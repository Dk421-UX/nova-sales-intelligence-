import * as xlsx from 'xlsx';
import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';
import { syncEntityToSupabase, syncBatchToSupabase } from '../db/supabaseSync.ts';

export const SUPPORTED_STATUSES = ['AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED'] as const;
export type PropertyStatus = typeof SUPPORTED_STATUSES[number];

export interface ColumnMappingItem {
  excelHeader: string;
  targetField: 'propertyNumber' | 'areaSqft' | 'facing' | 'status' | 'sectionOrPhase' | 'unitType' | 'plinthArea' | 'commonArea' | 'uds' | 'floor' | 'unmapped';
  colIndex: number;
}

export interface IdentifierCandidate {
  colIndex: number;
  header: string;
  normalizedHeader: string;
  score: number;
  reason: string;
  isRecommended: boolean;
}

export interface CustomColumnMapping {
  propNumberIdx?: number;
  areaIdx?: number;
  facingIdx?: number;
  statusIdx?: number;
  sectionIdx?: number;
  unitTypeIdx?: number;
  plinthIdx?: number;
  commonIdx?: number;
  udsIdx?: number;
  floorIdx?: number;
  [key: string]: number | undefined;
}

export interface ValidationErrorDetail {
  rowIndex: number;
  excelColumn: string;
  detectedField: string;
  originalValue: string;
  problem: string;
  possibleCause: string;
  suggestedAction: string;
}

export interface DuplicateRowDetail {
  reason: string;
  conflictingRowIndex?: number;
  matchType: 'IN_FILE' | 'DATABASE_MATCH';
  conflictingRowData?: {
    rowIndex?: number;
    propertyNumber: string;
    status: string;
    facing: string | null;
    areaSqft: number | null;
    sectionOrPhase: string | null;
  };
}

export interface ImportPreviewRow {
  rowIndex: number;
  propertyNumber: string;
  propertyType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP' | 'VILLA';
  status: string;
  facing: string | null;
  areaSqft: number | null;
  sectionOrPhase: string | null;
  unitType?: string | null;
  plinthArea?: number | null;
  commonArea?: number | null;
  saleableArea?: number | null;
  carpetArea?: number | null;
  uds?: number | null;
  shareType?: string | null;
  changeType: 'NEW' | 'STATUS_CHANGE' | 'UPDATED' | 'UNCHANGED' | 'INVALID' | 'CONFLICT' | 'DUPLICATE' | 'MISSING';
  existingData?: any;
  validationError?: string;
  errorDetails?: ValidationErrorDetail;
  duplicateDetails?: DuplicateRowDetail;
}

export function sanitizeCellValue(val: any): any {
  if (typeof val === 'string') {
    let clean = val.trim();
    // Neutralize formula injection risk if exported or processed
    if (clean.startsWith('=') || clean.startsWith('+') || clean.startsWith('-') || clean.startsWith('@')) {
      clean = clean.replace(/^[=+\-@]+/, '').trim();
    }
    return clean;
  }
  return val;
}

export function normalizeHeaderText(raw: any): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\s\-_./#:|]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function cleanToken(raw: any): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizePropertyIdentifier(val: string): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .trim()
    .replace(/^plot\s*[-#:]?\s*|^flat\s*[-#:]?\s*|^unit\s*[-#:]?\s*|^villa\s*[-#:]?\s*|^site\s*[-#:]?\s*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeSection(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

export function parseExcelSheets(buffer: Buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('File size exceeds the maximum limit of 15MB.');
  }
  const wb = xlsx.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Uploaded Excel workbook contains no valid sheets.');
  }
  return wb.SheetNames;
}

export function scoreHeaderRow(row: any[], nextRow?: any[], projectType: string = 'PLOT'): number {
  if (!row || !Array.isArray(row)) return -100;
  const nonEmpties = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
  if (nonEmpties.length === 0) return -100;
  if (nonEmpties.length === 1) return -25; // single banner/title cell

  let score = 0;
  let matches = 0;

  for (const cell of nonEmpties) {
    const norm = normalizeHeaderText(cell);
    const clean = cleanToken(cell);

    // Identifier keywords
    if (
      clean.includes('plotno') || clean.includes('plotnumber') || clean.includes('flatno') ||
      clean.includes('flatnumber') || clean.includes('flatname') || clean.includes('unitno') ||
      clean.includes('unitnumber') || clean.includes('apartmentno') || clean.includes('villano') ||
      clean.includes('siteno') || clean.includes('propertyno') || clean.includes('propertyid') ||
      clean.includes('doorno') || clean === 'plot' || clean === 'plots' || clean === 'flat' ||
      clean === 'flats' || clean === 'unit' || clean === 'units' || clean === 'villa' ||
      clean === 'villas' || clean === 'site' || clean === 'sites' || clean === 'property' ||
      clean === 'properties' || clean === 'sno' || clean === 'sno.' || clean === 'slno' ||
      clean === 'srno' || norm.includes('plot no') || norm.includes('flat name') ||
      norm.includes('unit no') || norm.includes('s no') || norm.includes('property no')
    ) {
      score += 15;
      matches++;
    }
    // Area keywords
    else if (
      clean.includes('area') || clean.includes('sqft') || clean.includes('sqfeet') ||
      clean.includes('extent') || clean.includes('saleable') || clean.includes('plinth') ||
      clean.includes('common') || clean.includes('uds') || clean.includes('carpet') ||
      clean.includes('size') || clean.includes('sba')
    ) {
      score += 10;
      matches++;
    }
    // Facing keywords
    else if (clean.includes('facing') || clean.includes('direction') || clean.includes('orientation') || clean === 'face') {
      score += 8;
      matches++;
    }
    // Status keywords
    else if (clean.includes('status') || clean.includes('staus') || clean.includes('stat') || clean.includes('avail') || clean.includes('booking')) {
      score += 10;
      matches++;
    }
    // Section / Phase keywords
    else if (clean.includes('phase') || clean.includes('section') || clean.includes('enclave') || clean.includes('block') || clean.includes('sector') || clean.includes('project')) {
      score += 7;
      matches++;
    }
    // Type / Share / Floor keywords
    else if (clean.includes('type') || clean.includes('bhk') || clean.includes('share') || clean.includes('floor')) {
      score += 5;
      matches++;
    }
  }

  if (matches >= 2) score += 15;
  if (matches >= 3) score += 15;
  if (nonEmpties.length >= 3) score += nonEmpties.length * 2;

  // Check next row for data-like patterns
  if (nextRow && Array.isArray(nextRow)) {
    const nextNonEmpties = nextRow.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    let dataSignals = 0;
    for (const c of nextNonEmpties) {
      if (typeof c === 'number') dataSignals++;
      else {
        const s = String(c).trim().toLowerCase();
        if (
          s === 'available' || s === 'booked' || s === 'sold' || s === 'registered' ||
          s === 'reserved' || s === 'blocked' || s === 'east' || s === 'west' ||
          s === 'north' || s === 'south' || s.includes('north') || s.includes('south') ||
          s.includes('east') || s.includes('west') || s === 'nova'
        ) {
          dataSignals++;
        }
      }
    }
    if (dataSignals >= 1) score += 15;
    if (dataSignals >= 2) score += 10;
  }

  return score;
}

export function detectHeaderRowIndex(rawRows: any[][], projectType: string = 'PLOT'): number {
  let bestRow = 0;
  let maxScore = -999;
  const scanLimit = Math.min(25, rawRows.length);

  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i] || [];
    const nextRow = i + 1 < rawRows.length ? rawRows[i + 1] : undefined;
    const score = scoreHeaderRow(row, nextRow, projectType);
    if (score > maxScore) {
      maxScore = score;
      bestRow = i;
    }
  }

  // Fallback: If maxScore is very low, pick the first row with >= 2 non-empty cells
  if (maxScore < 5) {
    for (let i = 0; i < scanLimit; i++) {
      const nonEmpties = (rawRows[i] || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (nonEmpties.length >= 2) {
        return i;
      }
    }
    return 0;
  }

  return bestRow;
}

export function scorePropertyIdentifier(header: string, projectType: string = 'PLOT'): { score: number; reason: string } {
  const norm = normalizeHeaderText(header);
  const clean = cleanToken(header);
  if (!clean) return { score: 0, reason: 'Empty column header' };

  let score = 0;
  let reason = '';

  // 1. PLOT variations
  if (
    clean.includes('plotno') || clean.includes('plotnumber') || clean.includes('plotnum') ||
    clean.includes('plotcode') || clean.includes('plotid') || clean.includes('plotname') ||
    norm.includes('plot no') || norm.includes('plot number') || norm.includes('plot #') ||
    norm.includes('plot id') || clean === 'plot' || clean === 'plots'
  ) {
    score = 100;
    reason = 'Standard Plot Identifier';
    if (projectType === 'PLOT') {
      score += 30;
      reason = 'Primary Plot Identifier matching PLOT project';
    }
  }
  // 2. APARTMENT / FLAT / UNIT variations
  else if (
    clean.includes('flatno') || clean.includes('flatnumber') || clean.includes('flatname') ||
    clean.includes('flatid') || norm.includes('flat no') || norm.includes('flat name') ||
    clean === 'flat' || clean === 'flats'
  ) {
    score = 100;
    reason = 'Standard Flat Identifier';
    if (projectType === 'APARTMENT') {
      score += 30;
      reason = 'Primary Flat Identifier matching APARTMENT project';
    }
  } else if (
    clean.includes('unitno') || clean.includes('unitnumber') || clean.includes('unitid') ||
    clean.includes('unitcode') || norm.includes('unit no') || norm.includes('unit number') ||
    clean === 'unit' || clean === 'units'
  ) {
    score = 95;
    reason = 'Standard Unit Identifier';
    if (projectType === 'APARTMENT' || projectType === 'COMMERCIAL_SHOP') {
      score += 30;
      reason = 'Primary Unit Identifier matching project type';
    }
  } else if (
    clean.includes('apartmentno') || clean.includes('apartmentnumber') || clean.includes('aptno') ||
    clean.includes('aptnumber') || norm.includes('apartment no') || norm.includes('apt no') ||
    clean === 'apartment' || clean === 'apartments' || clean === 'apt'
  ) {
    score = 95;
    reason = 'Standard Apartment Identifier';
    if (projectType === 'APARTMENT') {
      score += 30;
      reason = 'Primary Apartment Identifier matching APARTMENT project';
    }
  } else if (clean.includes('doorno') || clean.includes('doornumber') || norm.includes('door no')) {
    score = 85;
    reason = 'Door / Unit Identifier';
  }
  // 3. VILLA variations
  else if (
    clean.includes('villano') || clean.includes('villanumber') || clean.includes('villaid') ||
    norm.includes('villa no') || norm.includes('villa number') || clean === 'villa' || clean === 'villas'
  ) {
    score = 100;
    reason = 'Standard Villa Identifier';
    if (projectType === 'VILLA') {
      score += 35;
      reason = 'Primary Villa Identifier matching VILLA project';
    }
  }
  // 4. SITE variations
  else if (
    clean.includes('siteno') || clean.includes('sitenumber') || clean.includes('siteid') ||
    norm.includes('site no') || norm.includes('site number') || clean === 'site' || clean === 'sites'
  ) {
    score = 95;
    reason = 'Standard Site Identifier';
    if (projectType === 'PLOT') {
      score += 25;
      reason = 'Site Identifier for PLOT project';
    }
  }
  // 5. PROPERTY variations
  else if (
    clean.includes('propertyno') || clean.includes('propertynumber') || clean.includes('propertyid') ||
    norm.includes('property no') || norm.includes('property number') || norm.includes('property id') ||
    clean === 'property' || clean === 'properties'
  ) {
    score = 90;
    reason = 'General Property Identifier';
    score += 15;
  }
  // 6. COMMERCIAL / SHOP variations
  else if (
    clean.includes('shopno') || clean.includes('shopnumber') || clean.includes('shopid') ||
    norm.includes('shop no') || clean === 'shop' || clean === 'shops'
  ) {
    score = 90;
    reason = 'Commercial Shop Identifier';
    if (projectType === 'COMMERCIAL_SHOP') {
      score += 35;
      reason = 'Primary Shop Identifier matching COMMERCIAL project';
    }
  }
  // 7. S.NO / SERIAL NUMBER (Low priority fallback)
  else if (
    clean === 'sno' || clean === 'sno.' || clean === 'slno' || clean === 'slno.' ||
    clean === 'srno' || clean === 'srno.' || norm === 's no' || norm === 'sl no' ||
    norm === 'sr no' || norm === 'serial no' || norm === 'serial number' ||
    clean === 'serialno' || clean === 'serialnumber'
  ) {
    score = 30; // low fallback score
    reason = 'Serial Number (Fallback only if no primary property identifier exists)';
  }

  return { score, reason };
}

export function detectColumnMappings(
  headers: string[],
  projectType: string = 'PLOT',
  customMapping?: CustomColumnMapping
) {
  let propNumberIdx = -1;
  let areaIdx = -1;
  let facingIdx = -1;
  let statusIdx = -1;
  let sectionIdx = -1;
  let plinthIdx = -1;
  let commonIdx = -1;
  let udsIdx = -1;
  let floorIdx = -1;
  let unitTypeIdx = -1;

  // 1. Gather all property identifier candidates
  const candidates: IdentifierCandidate[] = [];
  headers.forEach((h, idx) => {
    const { score, reason } = scorePropertyIdentifier(h, projectType);
    if (score >= 25) {
      candidates.push({
        colIndex: idx,
        header: h || `Column ${idx + 1}`,
        normalizedHeader: normalizeHeaderText(h),
        score,
        reason,
        isRecommended: false
      });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 0) {
    candidates[0].isRecommended = true;
  }

  // Check if multiple strong candidates exist (e.g. candidates with close score)
  const strongCandidates = candidates.filter(c => c.score >= 80);
  const hasMultipleCandidates = strongCandidates.length > 1;

  // Auto-detect property number index if not provided by custom mapping
  if (candidates.length > 0) {
    propNumberIdx = candidates[0].colIndex;
  }

  // 2. Map remaining columns (area, facing, status, phase/section, plinth, common, uds, floor, unitType)
  headers.forEach((h, idx) => {
    // Avoid re-mapping the designated property number column to other fields
    if (idx === propNumberIdx && candidates.length > 0 && candidates[0].score >= 80) {
      return;
    }

    const norm = normalizeHeaderText(h);
    const clean = cleanToken(h);

    if (
      areaIdx === -1 &&
      (clean.includes('area') || clean.includes('sqft') || clean.includes('sqfeet') ||
       clean.includes('extent') || clean.includes('totalsaleablearea') || clean.includes('saleablearea') ||
       clean.includes('saleable') || clean.includes('builtup') || clean.includes('sba') ||
       clean.includes('size') || norm.includes('sq ft') || norm.includes('sq. ft') ||
       norm.includes('extent sqft') || norm.includes('total saleable'))
    ) {
      areaIdx = idx;
    } else if (
      facingIdx === -1 &&
      (clean.includes('facing') || clean.includes('direction') || clean.includes('orientation') || clean === 'face' || norm.includes('facing'))
    ) {
      facingIdx = idx;
    } else if (
      statusIdx === -1 &&
      (clean.includes('status') || clean.includes('staus') || clean.includes('stat') ||
       clean.includes('availability') || clean.includes('state') || clean.includes('bookingstatus') ||
       clean === 'avail')
    ) {
      statusIdx = idx;
    } else if (
      sectionIdx === -1 &&
      (clean.includes('phase') || clean.includes('section') || clean.includes('enclave') ||
       clean.includes('block') || clean.includes('sector') || clean.includes('subdivision') ||
       clean.includes('project') || clean.includes('tower') || clean.includes('wing') ||
       norm.includes('sub division') || norm.includes('sub-division'))
    ) {
      sectionIdx = idx;
    } else if (plinthIdx === -1 && clean.includes('plinth')) {
      plinthIdx = idx;
    } else if (commonIdx === -1 && clean.includes('common')) {
      commonIdx = idx;
    } else if (udsIdx === -1 && (clean.includes('uds') || clean.includes('undivided'))) {
      udsIdx = idx;
    } else if (floorIdx === -1 && (clean.includes('floor') || clean.includes('level'))) {
      floorIdx = idx;
    } else if (
      unitTypeIdx === -1 &&
      (clean.includes('unittype') || clean.includes('type') || clean.includes('bhk') || clean.includes('configuration') || clean.includes('flattype'))
    ) {
      unitTypeIdx = idx;
    }
  });

  // Apply custom mapping overrides if explicitly passed
  if (customMapping) {
    if (customMapping.propNumberIdx !== undefined) propNumberIdx = customMapping.propNumberIdx;
    if (customMapping.propertyNumber !== undefined) propNumberIdx = customMapping.propertyNumber;
    if (customMapping.areaIdx !== undefined) areaIdx = customMapping.areaIdx;
    if (customMapping.areaSqft !== undefined) areaIdx = customMapping.areaSqft;
    if (customMapping.facingIdx !== undefined) facingIdx = customMapping.facingIdx;
    if (customMapping.facing !== undefined) facingIdx = customMapping.facing;
    if (customMapping.statusIdx !== undefined) statusIdx = customMapping.statusIdx;
    if (customMapping.status !== undefined) statusIdx = customMapping.status;
    if (customMapping.sectionIdx !== undefined) sectionIdx = customMapping.sectionIdx;
    if (customMapping.sectionOrPhase !== undefined) sectionIdx = customMapping.sectionOrPhase;
    if (customMapping.unitTypeIdx !== undefined) unitTypeIdx = customMapping.unitTypeIdx;
    if (customMapping.unitType !== undefined) unitTypeIdx = customMapping.unitType;
    if (customMapping.plinthIdx !== undefined) plinthIdx = customMapping.plinthIdx;
    if (customMapping.plinthArea !== undefined) plinthIdx = customMapping.plinthArea;
    if (customMapping.commonIdx !== undefined) commonIdx = customMapping.commonIdx;
    if (customMapping.commonArea !== undefined) commonIdx = customMapping.commonArea;
    if (customMapping.udsIdx !== undefined) udsIdx = customMapping.udsIdx;
    if (customMapping.uds !== undefined) udsIdx = customMapping.uds;
    if (customMapping.floorIdx !== undefined) floorIdx = customMapping.floorIdx;
  }

  const columnMap = {
    propNumberIdx,
    areaIdx,
    facingIdx,
    statusIdx,
    sectionIdx,
    plinthIdx,
    commonIdx,
    udsIdx,
    floorIdx,
    unitTypeIdx
  };

  const detectedMapping: ColumnMappingItem[] = headers.map((h, idx) => {
    let targetField: ColumnMappingItem['targetField'] = 'unmapped';
    if (idx === columnMap.propNumberIdx) targetField = 'propertyNumber';
    else if (idx === columnMap.areaIdx) targetField = 'areaSqft';
    else if (idx === columnMap.facingIdx) targetField = 'facing';
    else if (idx === columnMap.statusIdx) targetField = 'status';
    else if (idx === columnMap.sectionIdx) targetField = 'sectionOrPhase';
    else if (idx === columnMap.unitTypeIdx) targetField = 'unitType';
    else if (idx === columnMap.plinthIdx) targetField = 'plinthArea';
    else if (idx === columnMap.commonIdx) targetField = 'commonArea';
    else if (idx === columnMap.udsIdx) targetField = 'uds';
    else if (idx === columnMap.floorIdx) targetField = 'floor';

    return {
      excelHeader: h || `Column ${idx + 1}`,
      targetField,
      colIndex: idx
    };
  });

  return { columnMap, candidates, hasMultipleCandidates, detectedMapping };
}

export function inspectSheetStructure(
  buffer: Buffer,
  sheetName: string,
  targetProjectId?: string
) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found in Excel workbook.`);

  let projectType = 'PLOT';
  if (targetProjectId) {
    const db = getDb();
    const project = db.prepare('SELECT project_type FROM projects WHERE id = ?').get(targetProjectId) as any;
    if (project?.project_type) projectType = project.project_type;
  }

  const rawRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  if (rawRows.length < 2) throw new Error('Sheet does not contain sufficient header and data rows.');

  const headerRowIdx = detectHeaderRowIndex(rawRows, projectType);
  const headers = (rawRows[headerRowIdx] || []).map(h => String(h || '').trim());
  const { columnMap, candidates, hasMultipleCandidates, detectedMapping } = detectColumnMappings(headers, projectType);

  return {
    headerRowIndex: headerRowIdx + 1,
    headers: headers.map((h, idx) => ({ header: h || `Column ${idx + 1}`, colIndex: idx })),
    candidates,
    hasMultipleCandidates,
    columnMap,
    detectedMapping
  };
}

export function generateImportPreview(
  buffer: Buffer,
  filename: string,
  targetProjectId: string,
  sheetName: string,
  userId: string,
  customMapping?: CustomColumnMapping
) {
  const db = getDb();
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('File size exceeds the maximum limit of 15MB.');
  }

  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error(`Sheet '${sheetName}' not found in Excel workbook.`);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(targetProjectId) as any;
  if (!project) throw new Error(`Project ${targetProjectId} not found.`);

  // Parse rows as raw 2D array
  const rawRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  if (rawRows.length < 2) throw new Error('Sheet does not contain sufficient header and data rows.');

  // Upgraded dynamic header row detection
  const headerRowIdx = detectHeaderRowIndex(rawRows, project.project_type);
  const headers = (rawRows[headerRowIdx] || []).map(h => String(h || '').trim());

  // Detect column mapping with project-type intelligence and custom overrides
  const { columnMap, candidates, hasMultipleCandidates, detectedMapping } = detectColumnMappings(
    headers,
    project.project_type,
    customMapping
  );

  if (columnMap.propNumberIdx === -1) {
    throw new Error('We couldn\'t confidently identify the property identifier column (e.g. "Plot No", "Flat No", "Unit") in header row. Please select the correct column.');
  }

  const previewRows: ImportPreviewRow[] = [];
  const seenRowsMap = new Map<string, { rowIndex: number; propertyNumber: string; status: string; facing: string | null; areaSqft: number | null; sectionOrPhase: string | null }>();
  const matchedExistingIds = new Set<string>();

  // Fetch all existing properties for comparison
  const existingProperties = db.prepare(`
    SELECT * FROM properties WHERE project_id = ? AND is_archived = 0 AND is_superseded = 0
  `).all(targetProjectId) as any[];

  const existingMap = new Map<string, any>();
  existingProperties.forEach(p => {
    const raw = p.property_number.toLowerCase().trim();
    const clean = normalizePropertyIdentifier(p.property_number);
    const sec = normalizeSection(p.section_or_phase);

    // Store compound key if section exists, plus direct clean key
    if (sec) {
      existingMap.set(`${clean}::${sec}`, p);
      existingMap.set(`${raw}::${sec}`, p);
    }
    // Also store fallback key
    if (!existingMap.has(raw)) existingMap.set(raw, p);
    if (clean && !existingMap.has(clean)) existingMap.set(clean, p);
  });

  let newCount = 0;
  let statusChangeCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;
  let missingCount = 0;

  for (let rIdx = headerRowIdx + 1; rIdx < rawRows.length; rIdx++) {
    const row = rawRows[rIdx];
    if (!row || row.every(c => c === null || c === undefined || c === '')) continue;

    const propNumberRaw = columnMap.propNumberIdx !== -1 ? row[columnMap.propNumberIdx] : null;
    if (propNumberRaw === null || propNumberRaw === undefined || String(propNumberRaw).trim() === '') continue;

    const propNumber = String(sanitizeCellValue(propNumberRaw)).trim();
    if (!propNumber || propNumber.toLowerCase() === 'none' || propNumber.toLowerCase() === 'total' || propNumber.toLowerCase() === 'grand total') {
      continue;
    }

    const areaRaw = columnMap.areaIdx !== -1 ? row[columnMap.areaIdx] : null;
    let areaSqft: number | null = null;
    if (typeof areaRaw === 'number') {
      areaSqft = areaRaw > 0 ? areaRaw : null;
    } else if (areaRaw) {
      const parsed = parseFloat(String(areaRaw).replace(/[^0-9.]/g, ''));
      areaSqft = isNaN(parsed) || parsed <= 0 ? null : parsed;
    }

    const facingRaw = columnMap.facingIdx !== -1 ? row[columnMap.facingIdx] : null;
    const facing = facingRaw ? String(sanitizeCellValue(facingRaw)).trim() : null;

    const statusHeader = columnMap.statusIdx !== -1 ? headers[columnMap.statusIdx] : 'Status';
    const statusRaw = columnMap.statusIdx !== -1 ? row[columnMap.statusIdx] : null;
    const statusVal = statusRaw ? String(sanitizeCellValue(statusRaw)).trim() : 'AVAILABLE';
    const statusResult = mapAndValidateStatus(statusVal);

    const sectionRaw = columnMap.sectionIdx !== -1 ? row[columnMap.sectionIdx] : null;
    const sectionOrPhase = sectionRaw ? String(sanitizeCellValue(sectionRaw)).trim() : null;

    const cleanLookup = normalizePropertyIdentifier(propNumber);
    const normSec = normalizeSection(sectionOrPhase);
    const compoundKey = normSec ? `${cleanLookup}::${normSec}` : cleanLookup;

    // 1. Validation check for unsupported status
    if (!statusResult.isValid) {
      invalidCount++;
      const errorDetails: ValidationErrorDetail = {
        rowIndex: rIdx + 1,
        excelColumn: statusHeader || 'Status',
        detectedField: 'Status',
        originalValue: statusVal,
        problem: `"${statusVal}" is not a supported inventory status.`,
        possibleCause: statusVal.toLowerCase().includes('club') || statusVal.toLowerCase().includes('park') 
          ? `Row indicates an on-site amenity reservation or non-saleable zone rather than an inventory sale status.`
          : `Incorrect column mapping or non-standard status terminology in spreadsheet.`,
        suggestedAction: `Review column mapping, skip this row, or map value to RESERVED / BLOCKED.`
      };

      previewRows.push({
        rowIndex: rIdx + 1,
        propertyNumber: propNumber,
        propertyType: project.project_type === 'APARTMENT' ? 'APARTMENT' : (project.project_type === 'VILLA' ? 'VILLA' : 'PLOT'),
        status: statusVal,
        facing,
        areaSqft,
        sectionOrPhase,
        changeType: 'INVALID',
        validationError: statusResult.error,
        errorDetails
      });
      continue;
    }

    const status = statusResult.status;

    // 2. LEVEL 1: Duplicate check within the same uploaded sheet (compound key: propertyNumber + section/phase)
    if (seenRowsMap.has(compoundKey)) {
      duplicateCount++;
      const prevRow = seenRowsMap.get(compoundKey)!;
      const dupReason = `Duplicate of Row ${prevRow.rowIndex} in this spreadsheet: same property identifier '${propNumber}'${sectionOrPhase ? ` in Section/Phase '${sectionOrPhase}'` : ''}.`;

      previewRows.push({
        rowIndex: rIdx + 1,
        propertyNumber: propNumber,
        propertyType: project.project_type === 'APARTMENT' ? 'APARTMENT' : (project.project_type === 'VILLA' ? 'VILLA' : 'PLOT'),
        status,
        facing,
        areaSqft,
        sectionOrPhase,
        changeType: 'DUPLICATE',
        validationError: dupReason,
        duplicateDetails: {
          reason: dupReason,
          conflictingRowIndex: prevRow.rowIndex,
          matchType: 'IN_FILE',
          conflictingRowData: prevRow
        }
      });
      continue;
    }
    seenRowsMap.set(compoundKey, {
      rowIndex: rIdx + 1,
      propertyNumber: propNumber,
      status,
      facing,
      areaSqft,
      sectionOrPhase
    });

    // 3. LEVEL 2: Matching against existing database records
    const existing = (normSec ? existingMap.get(compoundKey) : undefined) 
      || existingMap.get(propNumber.toLowerCase()) 
      || (cleanLookup ? existingMap.get(cleanLookup) : undefined);

    if (!existing) {
      newCount++;
      previewRows.push({
        rowIndex: rIdx + 1,
        propertyNumber: propNumber,
        propertyType: project.project_type === 'APARTMENT' ? 'APARTMENT' : (project.project_type === 'VILLA' ? 'VILLA' : 'PLOT'),
        status,
        facing,
        areaSqft,
        sectionOrPhase,
        changeType: 'NEW'
      });
    } else {
      matchedExistingIds.add(existing.id);

      const isStatusChanged = existing.status !== status;
      const isAreaChanged = areaSqft !== null && existing.area_sqft !== areaSqft;
      const isFacingChanged = facing !== null && existing.facing !== facing;

      // LEVEL 3: Conflict detection (e.g. Existing record is BOOKED/REGISTERED in DB, but Excel says AVAILABLE)
      if (isStatusChanged && (existing.status === 'BOOKED' || existing.status === 'REGISTERED') && status === 'AVAILABLE') {
        conflictCount++;
        previewRows.push({
          rowIndex: rIdx + 1,
          propertyNumber: propNumber,
          propertyType: existing.property_type,
          status,
          facing: facing || existing.facing,
          areaSqft: areaSqft || existing.area_sqft,
          sectionOrPhase: sectionOrPhase || existing.section_or_phase,
          changeType: 'CONFLICT',
          existingData: existing,
          validationError: `Conflict: Database record is currently '${existing.status}', but uploaded file indicates '${status}'.`
        });
      } else if (isStatusChanged && !isAreaChanged && !isFacingChanged) {
        statusChangeCount++;
        previewRows.push({
          rowIndex: rIdx + 1,
          propertyNumber: propNumber,
          propertyType: existing.property_type,
          status,
          facing: facing || existing.facing,
          areaSqft: areaSqft || existing.area_sqft,
          sectionOrPhase: sectionOrPhase || existing.section_or_phase,
          changeType: 'STATUS_CHANGE',
          existingData: existing
        });
      } else if (isStatusChanged || isAreaChanged || isFacingChanged) {
        updatedCount++;
        previewRows.push({
          rowIndex: rIdx + 1,
          propertyNumber: propNumber,
          propertyType: existing.property_type,
          status,
          facing: facing || existing.facing,
          areaSqft: areaSqft || existing.area_sqft,
          sectionOrPhase: sectionOrPhase || existing.section_or_phase,
          changeType: 'UPDATED',
          existingData: existing
        });
      } else {
        unchangedCount++;
        previewRows.push({
          rowIndex: rIdx + 1,
          propertyNumber: propNumber,
          propertyType: existing.property_type,
          status,
          facing: facing || existing.facing,
          areaSqft: areaSqft || existing.area_sqft,
          sectionOrPhase: sectionOrPhase || existing.section_or_phase,
          changeType: 'UNCHANGED',
          existingData: existing
        });
      }
    }
  }

  // =========================================================================
  // MISSING RECORD PROTECTION
  // =========================================================================
  existingProperties.forEach(p => {
    if (!matchedExistingIds.has(p.id)) {
      missingCount++;
      previewRows.push({
        rowIndex: -1,
        propertyNumber: p.property_number,
        propertyType: p.property_type,
        status: p.status,
        facing: p.facing,
        areaSqft: p.area_sqft,
        sectionOrPhase: p.section_or_phase,
        changeType: 'MISSING',
        existingData: p,
        validationError: `Property '${p.property_number}' is present in published database but not found in uploaded file.`
      });
    }
  });

  const totalProcessedRows = previewRows.length;
  const summary = {
    totalRows: totalProcessedRows,
    newCount,
    statusChangeCount,
    updatedCount,
    unchangedCount,
    invalidCount,
    duplicateCount,
    conflictCount,
    missingCount
  };

  const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Save to imports and import_rows tables
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO imports (
        id, filename, uploaded_by, detected_project_id, detected_sheet_name,
        total_rows, valid_rows, conflict_rows, missing_rows, status, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PREVIEW', ?, ?)
    `).run(
      importId,
      filename,
      userId,
      targetProjectId,
      sheetName,
      totalProcessedRows,
      newCount + statusChangeCount + updatedCount + unchangedCount,
      invalidCount + duplicateCount + conflictCount,
      missingCount,
      JSON.stringify(summary),
      now
    );

    const insertRow = db.prepare(`
      INSERT INTO import_rows (id, import_id, row_index, raw_data, normalized_data, validation_status, validation_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    previewRows.forEach((r, idx) => {
      let validationStatus = 'VALID';
      if (r.changeType === 'INVALID') validationStatus = 'INVALID';
      else if (r.changeType === 'DUPLICATE') validationStatus = 'DUPLICATE';
      else if (r.changeType === 'CONFLICT') validationStatus = 'CONFLICT';
      else if (r.changeType === 'MISSING') validationStatus = 'MISSING';

      insertRow.run(
        `imp_row_${importId}_${idx}`,
        importId,
        r.rowIndex,
        JSON.stringify(r),
        JSON.stringify(r),
        validationStatus,
        r.validationError || null
      );
    });
  });

  transaction();

  // Async sync preview metadata to Supabase
  try {
    const createdImport = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId);
    if (createdImport) {
      syncEntityToSupabase('imports', createdImport).catch(() => {});
    }
    const createdImportRows = db.prepare('SELECT * FROM import_rows WHERE import_id = ?').all(importId);
    if (createdImportRows && createdImportRows.length > 0) {
      syncBatchToSupabase('import_rows', createdImportRows).catch(() => {});
    }
  } catch (e) {}

  return {
    importId,
    projectId: targetProjectId,
    projectName: project.name,
    sheetName,
    headerRowIndex: headerRowIdx + 1,
    availableHeaders: headers.map((h, idx) => ({ header: h || `Column ${idx + 1}`, colIndex: idx })),
    detectedMapping,
    identifierCandidates: candidates,
    isIdentifierConfident: candidates.length > 0 && !hasMultipleCandidates,
    hasMultipleCandidates,
    summary,
    rows: previewRows
  };
}

export async function applyImport(
  importId: string,
  userId: string,
  userRole: string,
  options?: {
    skipInvalid?: boolean;
    rowActions?: Record<number, { action: 'SKIP' | 'SET_STATUS' | 'KEEP' | 'EXCLUDE'; status?: string }>;
  }
) {
  const db = getDb();
  const importRecord = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId) as any;
  if (!importRecord) throw new Error(`Import record '${importId}' not found.`);
  if (importRecord.status === 'APPLIED') throw new Error('This import has already been applied.');

  const rows = db.prepare('SELECT * FROM import_rows WHERE import_id = ?').all(importId) as any[];
  const projectId = importRecord.detected_project_id;
  const now = new Date().toISOString();
  const rowActions = options?.rowActions || {};
  const skipInvalid = options?.skipInvalid || false;

  // Check unresolvable INVALID rows if skipInvalid is not active
  const invalidRows = rows.filter(r => {
    if (r.validation_status !== 'INVALID') return false;
    const action = rowActions[r.row_index];
    if (action && (action.action === 'SKIP' || action.action === 'SET_STATUS' || action.action === 'EXCLUDE')) return false;
    return !skipInvalid;
  });

  if (invalidRows.length > 0) {
    const sample = JSON.parse(invalidRows[0].normalized_data) as ImportPreviewRow;
    const detail = sample.errorDetails;
    throw new Error(
      `Import cannot be applied because row ${sample.rowIndex} contains invalid data:\n` +
      `Field: ${detail?.detectedField || 'Status'}, Value: '${detail?.originalValue || sample.status}'.\n` +
      `Problem: ${detail?.problem || sample.validationError || 'Invalid data'}.\n` +
      `Action: You can choose [Skip Invalid Row] or [Review Mapping] to proceed. No changes were committed.`
    );
  }

  const insertProp = db.prepare(`
    INSERT INTO properties (
      id, project_id, property_type, property_number, status, draft_status, section_or_phase, facing,
      area_sqft, price, price_display, is_published, is_archived, is_superseded, has_pending_changes,
      source_document, source_sheet, source_row, last_verified_at, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateProp = db.prepare(`
    UPDATE properties
    SET status = ?, facing = coalesce(?, facing), area_sqft = coalesce(?, area_sqft), section_or_phase = coalesce(?, section_or_phase),
        last_verified_at = ?, updated_at = ?, published_at = ?
    WHERE project_id = ? AND property_number = ? AND coalesce(section_or_phase, '') = ? AND is_archived = 0 AND is_superseded = 0
  `);

  let appliedCount = 0;
  let skippedCount = 0;

  // Fully transactional apply: All valid changes commit, or entire batch rolls back safely
  const transaction = db.transaction(() => {
    for (const r of rows) {
      let data: ImportPreviewRow = JSON.parse(r.normalized_data);
      const action = rowActions[data.rowIndex];

      // Explicit skip/exclude or automatic skip of invalid rows
      if (action?.action === 'SKIP' || action?.action === 'EXCLUDE' || (r.validation_status === 'INVALID' && skipInvalid)) {
        skippedCount++;
        continue;
      }

      // Handle duplicate rows: only imported if explicitly marked KEEP by CRM
      if (data.changeType === 'DUPLICATE') {
        if (action?.action === 'KEEP') {
          data.changeType = 'NEW';
        } else {
          // Excluded by default unless approved
          skippedCount++;
          continue;
        }
      }

      if (action?.action === 'SET_STATUS' && action.status) {
        data.status = action.status;
        data.changeType = 'NEW';
      }

      // MISSING rows, DUPLICATE rows are protected
      if (data.changeType === 'NEW') {
        const id = `prop_${projectId.replace('proj_', '')}_${data.propertyNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${data.sectionOrPhase ? data.sectionOrPhase.replace(/[^a-zA-Z0-9]/g, '_') + '_' : ''}${Date.now()}_${appliedCount}`;
        try {
          insertProp.run(
            id,
            projectId,
            data.propertyType,
            data.propertyNumber,
            data.status,
            data.sectionOrPhase,
            data.facing,
            data.areaSqft,
            null,
            null,
            importRecord.filename,
            importRecord.detected_sheet_name,
            data.rowIndex,
            now,
            now,
            now,
            now
          );
          appliedCount++;
        } catch (err: any) {
          if (err.message && err.message.includes('UNIQUE constraint failed')) {
            updateProp.run(
              data.status,
              data.facing,
              data.areaSqft,
              data.sectionOrPhase,
              now,
              now,
              now,
              projectId,
              data.propertyNumber,
              data.sectionOrPhase || ''
            );
            appliedCount++;
          } else {
            throw err;
          }
        }
      } else if (data.changeType === 'STATUS_CHANGE' || data.changeType === 'UPDATED' || data.changeType === 'CONFLICT') {
        updateProp.run(
          data.status,
          data.facing,
          data.areaSqft,
          data.sectionOrPhase,
          now,
          now,
          now,
          projectId,
          data.propertyNumber,
          data.sectionOrPhase || ''
        );
        appliedCount++;
      }
    }

    db.prepare('UPDATE imports SET status = ? WHERE id = ?').run('APPLIED', importId);
    db.prepare(`
      UPDATE projects 
      SET status = CASE WHEN status = 'INVENTORY_PENDING' THEN 'ACTIVE' ELSE status END,
          last_verified_at = ?, 
          updated_at = ? 
      WHERE id = ?
    `).run(now, now, projectId);

    recordAuditLog({
      entity_type: 'IMPORT',
      entity_id: importId,
      project_id: projectId,
      action: 'APPLY_IMPORT',
      new_values: { appliedCount, skippedCount, filename: importRecord.filename },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  // Authoritative Supabase persistence: push all active properties of this project to Supabase
  try {
    const allProjectProps = db.prepare('SELECT * FROM properties WHERE project_id = ? AND is_archived = 0 AND is_superseded = 0').all(projectId) as any[];
    if (allProjectProps.length > 0) {
      await syncBatchToSupabase('properties', allProjectProps);
    }
    const updatedImport = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId);
    if (updatedImport) {
      await syncEntityToSupabase('imports', updatedImport);
    }
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (updatedProject) {
      await syncEntityToSupabase('projects', updatedProject);
    }
  } catch (syncErr: any) {
    console.warn('[ExcelService] Note on Supabase sync after apply:', syncErr.message);
  }

  return { 
    success: true,
    appliedCount, 
    skippedCount, 
    message: `Successfully applied ${appliedCount} records from import${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}.` 
  };
}



export function mapAndValidateStatus(val: string): { status: string; isValid: boolean; error?: string } {
  const raw = (val || '').toUpperCase().trim();

  if (raw === '' || raw === 'AVAILABLE' || raw === 'AVAIL' || raw === 'OPEN' || raw === 'VACANT') {
    return { status: 'AVAILABLE', isValid: true };
  }
  if (raw.includes('BOOKED') || raw === 'BOOK') {
    return { status: 'BOOKED', isValid: true };
  }
  if (raw.includes('REG') || raw.includes('REGISTERED') || raw === 'REGD') {
    return { status: 'REGISTERED', isValid: true };
  }
  if (raw.includes('SOLD') || raw === 'SALE') {
    return { status: 'SOLD', isValid: true };
  }
  if (raw.includes('RESERVED')) {
    return { status: 'RESERVED', isValid: true };
  }
  if (raw.includes('BLOCKED') || raw === 'BLOCK') {
    return { status: 'BLOCKED', isValid: true };
  }

  // If status is unsupported (such as 'APPLIED' or random string), fail validation gracefully
  return {
    status: raw,
    isValid: false,
    error: `Unsupported status: '${val}'. Allowed statuses are: ${SUPPORTED_STATUSES.join(', ')}.`
  };
}

export function mapStatusTerminology(val: string): string {
  const result = mapAndValidateStatus(val);
  return result.isValid ? result.status : 'AVAILABLE';
}

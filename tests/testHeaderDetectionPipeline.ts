import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { getDb } from '../server/db/database.ts';
import { 
  generateImportPreview, 
  applyImport, 
  detectHeaderRowIndex, 
  detectColumnMappings, 
  scorePropertyIdentifier,
  normalizeHeaderText,
  cleanToken,
  inspectSheetStructure
} from '../server/services/excelService.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

async function runHeaderDetectionSuite() {
  console.log('================================================================');
  console.log(' RUNNING COMPREHENSIVE EXCEL HEADER DETECTION & IMPORT SUITE');
  console.log('================================================================\n');

  const rootDir = process.cwd();
  const db = getDb();

  // -------------------------------------------------------------
  // TEST GROUP 1: Normalization & Alias Recognition
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: Header Normalization & Alias Recognition ---');

  // Test variations of Plot No
  const plotAliases = [
    'Plot No', 'Plot No.', 'PLOT NO', 'plot_no', 'plot-no', 'Plot #', 'Plot Number', 'Plot\nNo', 'Plot\r\nNumber', '  Plot No  ', 'Plots'
  ];
  for (const alias of plotAliases) {
    const score = scorePropertyIdentifier(alias, 'PLOT');
    assert(score.score >= 100, `Recognizes plot alias: "${alias.replace(/[\r\n]+/g, ' ')}" (Score: ${score.score})`);
  }

  // Test variations of Flat No / Unit / Apartment
  const flatAliases = [
    'Flat No', 'Flat Number', 'Flat Name', 'Flat', 'Flats', 'Flat #', 'Unit', 'Unit No', 'Unit Number', 'Units', 'Unit #', 'Apartment No', 'Apt No', 'Door No'
  ];
  for (const alias of flatAliases) {
    const score = scorePropertyIdentifier(alias, 'APARTMENT');
    assert(score.score >= 85, `Recognizes flat/unit alias: "${alias}" (Score: ${score.score})`);
  }

  // Test Villa & Site aliases
  const villaScore = scorePropertyIdentifier('Villa No', 'VILLA');
  assert(villaScore.score >= 130, `Recognizes Villa No for VILLA project (Score: ${villaScore.score})`);

  const siteScore = scorePropertyIdentifier('Site No', 'PLOT');
  assert(siteScore.score >= 120, `Recognizes Site No for PLOT project (Score: ${siteScore.score})`);

  // Test S.No is low priority fallback
  const snoScore = scorePropertyIdentifier('S.No', 'PLOT');
  assert(snoScore.score === 30, `S.No is given lower fallback priority (Score: ${snoScore.score})`);

  // -------------------------------------------------------------
  // TEST GROUP 2: Dynamic Header Row Detection on Formatted/Blank Row Workbooks
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Header Row Detection with Blank & Title Rows ---');

  // Synthetic sheet with 3 blank/title banner rows before actual headers
  const syntheticRows = [
    ['Nova Life Space Developers Pvt Ltd - Official Master Inventory'],
    ['CONFIDENTIAL AND PROPRIETARY'],
    [],
    ['S.No', 'Plot Number', 'Area (Sq.Ft)', 'Facing Direction', 'Current Status', 'Phase Enclave'],
    [1, 'Plot 201', 1200, 'North', 'AVAILABLE', 'Phase 1'],
    [2, 'Plot 202', 1500, 'East', 'BOOKED', 'Phase 1'],
    [3, 'Plot 203', 1800, 'South', 'AVAILABLE', 'Phase 2'],
  ];

  const detectedRow = detectHeaderRowIndex(syntheticRows, 'PLOT');
  assert(detectedRow === 3, `Correctly skipped 3 title/blank rows and detected Header Row at index 3 (Got: ${detectedRow})`);

  const headers = syntheticRows[detectedRow].map(String);
  const mappings = detectColumnMappings(headers, 'PLOT');
  assert(mappings.columnMap.propNumberIdx === 1, 'Correctly mapped "Plot Number" to propertyNumber index');
  assert(mappings.columnMap.areaIdx === 2, 'Correctly mapped "Area (Sq.Ft)" to areaSqft index');
  assert(mappings.columnMap.facingIdx === 3, 'Correctly mapped "Facing Direction" to facing index');
  assert(mappings.columnMap.statusIdx === 4, 'Correctly mapped "Current Status" to status index');
  assert(mappings.columnMap.sectionIdx === 5, 'Correctly mapped "Phase Enclave" to section index');

  // -------------------------------------------------------------
  // TEST GROUP 3: Multi-Candidate Column Disambiguation & Preference
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Project Type Disambiguation & Multi-Candidate ---');

  const multiCandidateHeaders = ['S.NO', 'Unit No', 'Plot No', 'Status'];
  const plotMapping = detectColumnMappings(multiCandidateHeaders, 'PLOT');
  assert(plotMapping.columnMap.propNumberIdx === 2, 'For PLOT project, prefers "Plot No" (index 2) over "Unit No" and "S.NO"');
  assert(plotMapping.candidates.length >= 3, 'All 3 candidate columns detected in candidate list');

  const aptMapping = detectColumnMappings(multiCandidateHeaders, 'APARTMENT');
  assert(aptMapping.columnMap.propNumberIdx === 1, 'For APARTMENT project, prefers "Unit No" (index 1) over "Plot No" and "S.NO"');

  // -------------------------------------------------------------
  // TEST GROUP 4: Verification Across All 11 Sheets of Nova Master Workbook
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Verification Across All 11 Sheets of Master Workbook ---');

  const xlsxPath = path.join(rootDir, 'Nova Available List 18.7.26 (1).xlsx');
  if (fs.existsSync(xlsxPath)) {
    const fileBuffer = fs.readFileSync(xlsxPath);
    const wb = xlsx.read(fileBuffer, { type: 'buffer' });

    for (const sheetName of wb.SheetNames) {
      const inspect = inspectSheetStructure(fileBuffer, sheetName);
      assert(inspect.headerRowIndex >= 1, `Sheet "${sheetName}": header row detected (Row ${inspect.headerRowIndex})`);
      assert(inspect.candidates.length > 0, `Sheet "${sheetName}": Property Identifier candidate detected (Top: "${inspect.candidates[0].header}")`);
      assert(inspect.columnMap.propNumberIdx !== -1, `Sheet "${sheetName}": Valid propertyNumber mapping resolved (Col ${inspect.columnMap.propNumberIdx + 1})`);
    }
  } else {
    console.log('  [Notice] Master workbook not on path, skipping file test.');
  }

  // -------------------------------------------------------------
  // TEST GROUP 5: Full End-to-End Pipeline on NOVA NCR Project
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Full End-to-End Import on NOVA NCR ---');

  const ncrWb = xlsx.utils.book_new();
  const ncrData = [
    ['Nova NCR Sub-Division'],
    ['S.NO', 'Plot No', 'Sqft', 'Facing', 'Status', 'Share'],
    [1, '501-A', 1261, 'East', 'Available', 'Nova'],
    [2, '501-B', 1434, 'East', 'Available', 'Nova'],
    [3, '502', 1500, 'West', 'Booked', 'Nova'],
  ];
  const ncrWs = xlsx.utils.aoa_to_sheet(ncrData);
  xlsx.utils.book_append_sheet(ncrWb, ncrWs, 'NOVA NCR');
  const ncrBuffer = xlsx.write(ncrWb, { type: 'buffer', bookType: 'xlsx' });

  // 1. Generate Preview
  const preview = generateImportPreview(
    ncrBuffer,
    'Nova NCR Test.xlsx',
    'proj_nova_ncr',
    'NOVA NCR',
    'usr_admin'
  );

  const newRows = preview.rows.filter(r => r.changeType === 'NEW');
  assert(newRows.length === 3, `NOVA NCR: generated preview with 3 NEW rows (Got: ${newRows.length})`);
  assert(preview.headerRowIndex === 2, `NOVA NCR: header row detected at row 2 (Got: ${preview.headerRowIndex})`);
  assert(preview.detectedMapping.find((m: any) => m.targetField === 'propertyNumber')?.colIndex === 1, 'NOVA NCR: Plot No mapped as propertyNumber (Col 2)');
  assert(preview.detectedMapping.find((m: any) => m.targetField === 'areaSqft')?.colIndex === 2, 'NOVA NCR: Sqft mapped as areaSqft (Col 3)');
  assert(preview.detectedMapping.find((m: any) => m.targetField === 'facing')?.colIndex === 3, 'NOVA NCR: Facing mapped as facing (Col 4)');
  assert(preview.detectedMapping.find((m: any) => m.targetField === 'status')?.colIndex === 4, 'NOVA NCR: Status mapped as status (Col 5)');

  // 2. Apply Import
  const applyResult = applyImport(preview.importId, 'usr_admin', 'ADMIN');
  assert(applyResult.success === true, 'NOVA NCR: Import applied successfully');
  assert(applyResult.appliedCount >= 3, `NOVA NCR: Applied ${applyResult.appliedCount} records to database`);

  // Verify DB state
  const ncrProps = db.prepare('SELECT * FROM properties WHERE project_id = ? AND is_archived = 0').all('proj_nova_ncr') as any[];
  const prop501A = ncrProps.find(p => p.property_number === '501-A');
  assert(prop501A !== undefined && prop501A.status === 'AVAILABLE', 'NOVA NCR: Plot 501-A recorded in database with status AVAILABLE');

  // -------------------------------------------------------------
  // TEST GROUP 6: Custom Mapping Overrides Flow
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Custom Mapping Overrides Flow ---');

  // Workbook with unconventional headers
  const customWb = xlsx.utils.book_new();
  const customData = [
    ['Code', 'Dimension', 'Direction', 'State'],
    ['U-101', 1250, 'East', 'Available'],
    ['U-102', 1400, 'West', 'Booked'],
  ];
  const customWs = xlsx.utils.aoa_to_sheet(customData);
  xlsx.utils.book_append_sheet(customWb, customWs, 'Custom Units');
  const customBuffer = xlsx.write(customWb, { type: 'buffer', bookType: 'xlsx' });

  // Custom mapping override specifying Code -> propertyNumber (0), Dimension -> areaSqft (1), Direction -> facing (2), State -> status (3)
  const customPreview = generateImportPreview(
    customBuffer,
    'custom.xlsx',
    'proj_nova_ncr',
    'Custom Units',
    'usr_admin',
    { propNumberIdx: 0, areaIdx: 1, facingIdx: 2, statusIdx: 3 }
  );

  const nonMissingRows = customPreview.rows.filter(r => r.changeType !== 'MISSING');
  assert(nonMissingRows.length === 2, `Custom mapping preview processed 2 uploaded rows (Got: ${nonMissingRows.length})`);
  assert(nonMissingRows[0].propertyNumber === 'U-101', 'Custom mapping correctly used column 0 as propertyNumber ("U-101")');
  assert(nonMissingRows[0].areaSqft === 1250, 'Custom mapping correctly used column 1 as areaSqft (1250)');

  console.log('\n================================================================');
  console.log(' ALL EXCEL HEADER DETECTION & IMPORT TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runHeaderDetectionSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

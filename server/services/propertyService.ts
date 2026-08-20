import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';

export interface PropertyFilter {
  projectId?: string;
  projectSlug?: string;
  status?: string;
  facing?: string;
  minArea?: number;
  maxArea?: number;
  propertyType?: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP';
  buildingId?: string;
  floorId?: string;
  unitType?: string;
  search?: string;
  includeSuperseded?: boolean;
  includeArchived?: boolean;
  includeDrafts?: boolean;
  limit?: number;
  offset?: number;
}

export interface PropertyDto {
  id: string;
  project_id: string;
  project_name?: string;
  project_slug?: string;
  property_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP';
  property_number: string;
  status: string;
  draft_status: string | null;
  effective_status: string; // Shows draft_status if in draft mode for staff, or status for customer
  section_or_phase: string | null;
  facing: string | null;
  area_sqft: number | null;
  price: number | null;
  price_display: string | null;
  building_id: string | null;
  building_name?: string | null;
  floor_id: string | null;
  floor_name?: string | null;
  unit_type: string | null;
  plinth_area_sqft: number | null;
  common_area_sqft: number | null;
  saleable_area_sqft: number | null;
  carpet_area_sqft: number | null;
  uds_sqft: number | null;
  share_type: string | null;
  is_published: number;
  is_archived: number;
  is_superseded: number;
  superseded_reason: string | null;
  has_pending_changes: number;
  source_document: string | null;
  source_sheet: string | null;
  source_row: number | null;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  geometry?: {
    geometry_type: string;
    svg_path: string | null;
    polygon_points: number[][] | null;
    center_x: number;
    center_y: number;
  } | null;
}

export function getProperties(filter: PropertyFilter): { properties: PropertyDto[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  // Superseded & Archived checks
  if (!filter.includeSuperseded) {
    conditions.push('p.is_superseded = 0');
  }
  if (!filter.includeArchived) {
    conditions.push('p.is_archived = 0');
  }
  if (!filter.includeDrafts) {
    conditions.push('p.is_published = 1');
  }

  // Resolve project slug to project_id if provided
  if (filter.projectSlug && !filter.projectId) {
    const projRow = db.prepare('SELECT id FROM projects WHERE slug = ?').get(filter.projectSlug) as any;
    if (projRow) {
      conditions.push('p.project_id = ?');
      params.push(projRow.id);
    } else {
      // Unknown slug → return empty result set
      return { properties: [], total: 0 };
    }
  } else if (filter.projectId) {
    conditions.push('p.project_id = ?');
    params.push(filter.projectId);
  }

  if (filter.propertyType) {
    conditions.push('p.property_type = ?');
    params.push(filter.propertyType);
  }

  if (filter.status) {
    conditions.push('p.status = ?');
    params.push(filter.status.toUpperCase());
  }

  if (filter.facing) {
    conditions.push('LOWER(p.facing) LIKE ?');
    params.push(`%${filter.facing.toLowerCase()}%`);
  }

  if (filter.minArea !== undefined && filter.minArea !== null) {
    conditions.push('p.area_sqft >= ?');
    params.push(filter.minArea);
  }

  if (filter.maxArea !== undefined && filter.maxArea !== null) {
    conditions.push('p.area_sqft <= ?');
    params.push(filter.maxArea);
  }

  if (filter.buildingId) {
    conditions.push('p.building_id = ?');
    params.push(filter.buildingId);
  }

  if (filter.floorId) {
    conditions.push('p.floor_id = ?');
    params.push(filter.floorId);
  }

  if (filter.unitType) {
    conditions.push('LOWER(p.unit_type) LIKE ?');
    params.push(`%${filter.unitType.toLowerCase()}%`);
  }

  if (filter.search) {
    conditions.push('(LOWER(p.property_number) LIKE ? OR LOWER(p.section_or_phase) LIKE ? OR LOWER(p.unit_type) LIKE ?)');
    const term = `%${filter.search.toLowerCase()}%`;
    params.push(term, term, term);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching
  const countRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM properties p
    ${whereSql}
  `).get(...params) as any;
  const total = countRow?.count || 0;

  // Query paginated results
  let query = `
    SELECT 
      p.*,
      pr.name as project_name,
      pr.slug as project_slug,
      b.name as building_name,
      f.floor_name,
      g.geometry_type,
      g.svg_path,
      g.polygon_points,
      g.center_x,
      g.center_y
    FROM properties p
    JOIN projects pr ON p.project_id = pr.id
    LEFT JOIN buildings b ON p.building_id = b.id
    LEFT JOIN floors f ON p.floor_id = f.id
    LEFT JOIN property_geometry g ON p.id = g.property_id
    ${whereSql}
    ORDER BY 
      CASE WHEN p.property_type = 'APARTMENT' THEN p.floor_id END ASC,
      CAST(p.property_number AS INTEGER) ASC,
      p.property_number ASC
  `;

  if (filter.limit) {
    query += ' LIMIT ?';
    params.push(filter.limit);
    if (filter.offset) {
      query += ' OFFSET ?';
      params.push(filter.offset);
    }
  }

  const rows = db.prepare(query).all(...params) as any[];

  const properties: PropertyDto[] = rows.map(r => {
    let polyPoints: number[][] | null = null;
    try {
      polyPoints = r.polygon_points ? JSON.parse(r.polygon_points) : null;
    } catch (e) {
      polyPoints = null;
    }

    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      project_slug: r.project_slug,
      property_type: r.property_type,
      property_number: r.property_number,
      status: r.status,
      draft_status: r.draft_status,
      effective_status: (filter.includeDrafts && r.draft_status) ? r.draft_status : r.status,
      section_or_phase: r.section_or_phase,
      facing: r.facing,
      area_sqft: r.area_sqft,
      price: r.price,
      price_display: r.price_display,
      building_id: r.building_id,
      building_name: r.building_name,
      floor_id: r.floor_id,
      floor_name: r.floor_name,
      unit_type: r.unit_type,
      plinth_area_sqft: r.plinth_area_sqft,
      common_area_sqft: r.common_area_sqft,
      saleable_area_sqft: r.saleable_area_sqft,
      carpet_area_sqft: r.carpet_area_sqft,
      uds_sqft: r.uds_sqft,
      share_type: r.share_type,
      is_published: r.is_published,
      is_archived: r.is_archived,
      is_superseded: r.is_superseded,
      superseded_reason: r.superseded_reason,
      has_pending_changes: r.has_pending_changes,
      source_document: r.source_document,
      source_sheet: r.source_sheet,
      source_row: r.source_row,
      last_verified_at: r.last_verified_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      published_at: r.published_at,
      geometry: r.center_x !== null && r.center_x !== undefined ? {
        geometry_type: r.geometry_type || 'POLYGON',
        svg_path: r.svg_path,
        polygon_points: polyPoints,
        center_x: r.center_x,
        center_y: r.center_y
      } : null
    };
  });

  return { properties, total };
}

export function getPropertyById(id: string, includeDrafts = false): PropertyDto | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT 
      p.*,
      pr.name as project_name,
      pr.slug as project_slug,
      b.name as building_name,
      f.floor_name,
      g.geometry_type,
      g.svg_path,
      g.polygon_points,
      g.center_x,
      g.center_y
    FROM properties p
    JOIN projects pr ON p.project_id = pr.id
    LEFT JOIN buildings b ON p.building_id = b.id
    LEFT JOIN floors f ON p.floor_id = f.id
    LEFT JOIN property_geometry g ON p.id = g.property_id
    WHERE p.id = ? AND p.is_archived = 0
  `).get(id) as any;

  if (!row) return null;
  if (!includeDrafts && (!row.is_published || row.is_superseded)) return null;

  let polyPoints: number[][] | null = null;
  try {
    polyPoints = row.polygon_points ? JSON.parse(row.polygon_points) : null;
  } catch (e) {
    polyPoints = null;
  }

  return {
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name,
    project_slug: row.project_slug,
    property_type: row.property_type,
    property_number: row.property_number,
    status: row.status,
    draft_status: row.draft_status,
    effective_status: (includeDrafts && row.draft_status) ? row.draft_status : row.status,
    section_or_phase: row.section_or_phase,
    facing: row.facing,
    area_sqft: row.area_sqft,
    price: row.price,
    price_display: row.price_display,
    building_id: row.building_id,
    building_name: row.building_name,
    floor_id: row.floor_id,
    floor_name: row.floor_name,
    unit_type: row.unit_type,
    plinth_area_sqft: row.plinth_area_sqft,
    common_area_sqft: row.common_area_sqft,
    saleable_area_sqft: row.saleable_area_sqft,
    carpet_area_sqft: row.carpet_area_sqft,
    uds_sqft: row.uds_sqft,
    share_type: row.share_type,
    is_published: row.is_published,
    is_archived: row.is_archived,
    is_superseded: row.is_superseded,
    superseded_reason: row.superseded_reason,
    has_pending_changes: row.has_pending_changes,
    source_document: row.source_document,
    source_sheet: row.source_sheet,
    source_row: row.source_row,
    last_verified_at: row.last_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
    geometry: row.center_x !== null && row.center_x !== undefined ? {
      geometry_type: row.geometry_type || 'POLYGON',
      svg_path: row.svg_path,
      polygon_points: polyPoints,
      center_x: row.center_x,
      center_y: row.center_y
    } : null
  };
}

export function createProperty(data: any, userId: string, userRole: string): PropertyDto {
  const db = getDb();
  const now = new Date().toISOString();

  // Validate uniqueness
  const duplicate = db.prepare(`
    SELECT id FROM properties 
    WHERE project_id = ? AND property_number = ? AND is_superseded = 0 AND is_archived = 0
  `).get(data.project_id, data.property_number) as any;

  if (duplicate) {
    throw new Error(`Property '${data.property_number}' already exists in this project.`);
  }

  const id = `prop_${data.project_id.replace('proj_', '')}_${data.property_number.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

  db.prepare(`
    INSERT INTO properties (
      id, project_id, property_type, property_number, status, draft_status, section_or_phase, facing,
      area_sqft, price, price_display, building_id, floor_id, unit_type, plinth_area_sqft,
      common_area_sqft, saleable_area_sqft, carpet_area_sqft, uds_sqft, share_type,
      is_published, is_archived, is_superseded, has_pending_changes,
      source_document, source_sheet, source_row, last_verified_at, created_at, updated_at, published_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      1, 0, 0, 0,
      ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id, data.project_id, data.property_type, data.property_number, data.status || 'AVAILABLE', null,
    data.section_or_phase || null, data.facing || null, data.area_sqft || null, data.price || null,
    data.price ? `Rs. ${Number(data.price).toLocaleString('en-IN')}` : null,
    data.building_id || null, data.floor_id || null, data.unit_type || null, data.plinth_area_sqft || null,
    data.common_area_sqft || null, data.saleable_area_sqft || null, data.carpet_area_sqft || null,
    data.uds_sqft || null, data.share_type || null,
    'Manual CRM Entry', 'CRM Staff Interface', null, now, now, now, now
  );

  recordAuditLog({
    entity_type: 'PROPERTY',
    entity_id: id,
    project_id: data.project_id,
    action: 'CREATE',
    new_values: data,
    performed_by: userId,
    user_role: userRole
  });

  return getPropertyById(id, true)!;
}

export function updateProperty(id: string, updates: any, userId: string, userRole: string, isDraft = false): PropertyDto {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(id) as any;
  if (!existing) throw new Error(`Property ${id} not found.`);

  const now = new Date().toISOString();

  if (isDraft && updates.status && updates.status !== existing.status) {
    // Stage as draft status update
    db.prepare(`
      UPDATE properties
      SET draft_status = ?, has_pending_changes = 1, updated_at = ?
      WHERE id = ?
    `).run(updates.status, now, id);

    recordAuditLog({
      entity_type: 'PROPERTY',
      entity_id: id,
      project_id: existing.project_id,
      action: 'DRAFT_STATUS_CHANGE',
      old_values: { status: existing.status },
      new_values: { draft_status: updates.status },
      performed_by: userId,
      user_role: userRole
    });
  } else {
    // Direct or full update
    const updatedStatus = updates.status ?? existing.status;
    const updatedFacing = updates.facing ?? existing.facing;
    const updatedArea = updates.area_sqft ?? existing.area_sqft;
    const updatedPrice = updates.price ?? existing.price;
    const updatedSection = updates.section_or_phase ?? existing.section_or_phase;
    const updatedUnitType = updates.unit_type ?? existing.unit_type;
    const updatedPlinth = updates.plinth_area_sqft ?? existing.plinth_area_sqft;
    const updatedCommon = updates.common_area_sqft ?? existing.common_area_sqft;
    const updatedSaleable = updates.saleable_area_sqft ?? existing.saleable_area_sqft;
    const updatedCarpet = updates.carpet_area_sqft ?? existing.carpet_area_sqft;
    const updatedUds = updates.uds_sqft ?? existing.uds_sqft;

    db.prepare(`
      UPDATE properties
      SET 
        status = ?, draft_status = NULL, has_pending_changes = 0, facing = ?, area_sqft = ?,
        price = ?, price_display = ?, section_or_phase = ?, unit_type = ?, plinth_area_sqft = ?,
        common_area_sqft = ?, saleable_area_sqft = ?, carpet_area_sqft = ?, uds_sqft = ?,
        last_verified_at = ?, updated_at = ?, published_at = ?
      WHERE id = ?
    `).run(
      updatedStatus, updatedFacing, updatedArea, updatedPrice,
      updatedPrice ? `Rs. ${Number(updatedPrice).toLocaleString('en-IN')}` : null,
      updatedSection, updatedUnitType, updatedPlinth, updatedCommon, updatedSaleable, updatedCarpet, updatedUds,
      now, now, now, id
    );

    recordAuditLog({
      entity_type: 'PROPERTY',
      entity_id: id,
      project_id: existing.project_id,
      action: 'UPDATE',
      old_values: existing,
      new_values: updates,
      performed_by: userId,
      user_role: userRole
    });
  }

  return getPropertyById(id, true)!;
}

export function stageStatusUpdate(id: string, newStatus: string, userId: string, userRole: string): PropertyDto {
  return updateProperty(id, { status: newStatus }, userId, userRole, true);
}

export function archiveProperty(id: string, reason: string, userId: string, userRole: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(id) as any;
  if (!existing) throw new Error(`Property ${id} not found.`);

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE properties
    SET is_archived = 1, superseded_reason = ?, updated_at = ?
    WHERE id = ?
  `).run(reason, now, id);

  recordAuditLog({
    entity_type: 'PROPERTY',
    entity_id: id,
    project_id: existing.project_id,
    action: 'ARCHIVE',
    old_values: { is_archived: 0 },
    new_values: { is_archived: 1, reason },
    performed_by: userId,
    user_role: userRole
  });

  return true;
}

export function compareProperties(propertyIds: string[]): PropertyDto[] {
  if (!propertyIds || propertyIds.length === 0) return [];
  const db = getDb();
  const placeholders = propertyIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT p.*, pr.name as project_name, pr.slug as project_slug
    FROM properties p
    JOIN projects pr ON p.project_id = pr.id
    WHERE p.id IN (${placeholders}) AND p.is_archived = 0 AND p.is_published = 1 AND p.is_superseded = 0
  `).all(...propertyIds) as any[];

  return rows.map(r => ({
    id: r.id,
    project_id: r.project_id,
    project_name: r.project_name,
    project_slug: r.project_slug,
    property_type: r.property_type,
    property_number: r.property_number,
    status: r.status,
    draft_status: null,
    effective_status: r.status,
    section_or_phase: r.section_or_phase,
    facing: r.facing,
    area_sqft: r.area_sqft,
    price: r.price,
    price_display: r.price_display,
    building_id: r.building_id,
    floor_id: r.floor_id,
    unit_type: r.unit_type,
    plinth_area_sqft: r.plinth_area_sqft,
    common_area_sqft: r.common_area_sqft,
    saleable_area_sqft: r.saleable_area_sqft,
    carpet_area_sqft: r.carpet_area_sqft,
    uds_sqft: r.uds_sqft,
    share_type: r.share_type,
    is_published: r.is_published,
    is_archived: r.is_archived,
    is_superseded: r.is_superseded,
    superseded_reason: r.superseded_reason,
    has_pending_changes: 0,
    source_document: r.source_document,
    source_sheet: r.source_sheet,
    source_row: r.source_row,
    last_verified_at: r.last_verified_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    published_at: r.published_at,
  }));
}

export function savePropertyGeometry(propertyId: string, layoutId: string, geometryData: any, userId: string, userRole: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM property_geometry WHERE property_id = ? AND layout_id = ?').get(propertyId, layoutId) as any;

  const id = existing?.id || `geom_${propertyId}_${Date.now()}`;
  const pointsStr = geometryData.polygon_points ? JSON.stringify(geometryData.polygon_points) : null;
  const stylingStr = geometryData.custom_styling ? JSON.stringify(geometryData.custom_styling) : null;

  db.prepare(`
    INSERT OR REPLACE INTO property_geometry (
      id, property_id, layout_id, geometry_type, svg_path, polygon_points, center_x, center_y, label_x, label_y, custom_styling, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, propertyId, layoutId, geometryData.geometry_type || 'POLYGON', geometryData.svg_path || null,
    pointsStr, geometryData.center_x || 0, geometryData.center_y || 0,
    geometryData.label_x || geometryData.center_x || 0,
    geometryData.label_y || geometryData.center_y || 0,
    stylingStr, now, now
  );

  recordAuditLog({
    entity_type: 'LAYOUT',
    entity_id: id,
    action: 'MAP_GEOMETRY',
    new_values: { propertyId, layoutId, geometryData },
    performed_by: userId,
    user_role: userRole
  });

  return { success: true, geometryId: id };
}

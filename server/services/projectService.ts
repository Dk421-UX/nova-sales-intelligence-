import fs from 'fs';
import path from 'path';
import { config } from '../config.ts';
import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';
import { calculateFreshness, FreshnessInfo } from './freshnessService.ts';
import { syncEntityToSupabase, deleteEntityFromSupabase, syncBatchToSupabase } from '../db/supabaseSync.ts';

export interface ProjectDto {
  id: string;
  slug: string;
  name: string;
  project_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL';
  location: string;
  city: string;
  description: string | null;
  highlights: string[];
  amenities: string[];
  total_area_reference: string | null;
  total_units_reference: number | null;
  brochure_reference: string | null;
  cover_image: string | null;
  status: string;
  current_version: number;
  is_published: number;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
  official_url?: string | null;
  freshness?: FreshnessInfo;
  // Dynamically calculated inventory stats
  stats: {
    total_inventory: number;
    available: number;
    booked: number;
    registered: number;
    sold: number;
    reserved: number;
  };
}

export function getAllProjects(includeUnpublished = false): ProjectDto[] {
  const db = getDb();
  const whereClause = includeUnpublished ? '' : 'WHERE p.is_published = 1';
  
  const projects = db.prepare(`
    SELECT p.* FROM projects p
    ${whereClause}
    ORDER BY p.name ASC
  `).all() as any[];

  // Performance Optimization: Batch calculate inventory stats in a single grouped query
  const statsMap = new Map<string, any>();
  try {
    const allStats = db.prepare(`
      SELECT
        project_id,
        COUNT(*) as total_inventory,
        SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) as booked,
        SUM(CASE WHEN status = 'REGISTERED' THEN 1 ELSE 0 END) as registered,
        SUM(CASE WHEN status = 'SOLD' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN status = 'RESERVED' THEN 1 ELSE 0 END) as reserved
      FROM properties
      WHERE is_archived = 0 AND is_superseded = 0 AND is_published = 1
      GROUP BY project_id
    `).all() as any[];
    for (const row of allStats) {
      statsMap.set(row.project_id, row);
    }
  } catch (e) {}

  return projects.map(p => enrichProjectWithStats(db, p, statsMap.get(p.id)));
}

export function getProjectBySlug(slug: string, includeUnpublished = false): ProjectDto | null {
  const db = getDb();
  const whereClause = includeUnpublished ? 'WHERE slug = ?' : 'WHERE slug = ? AND is_published = 1';
  const project = db.prepare(`SELECT * FROM projects ${whereClause}`).get(slug) as any;
  if (!project) return null;
  return enrichProjectWithStats(db, project);
}

export function getProjectById(id: string, includeUnpublished = false): ProjectDto | null {
  const db = getDb();
  const whereClause = includeUnpublished ? 'WHERE id = ?' : 'WHERE id = ? AND is_published = 1';
  const project = db.prepare(`SELECT * FROM projects ${whereClause}`).get(id) as any;
  if (!project) return null;
  return enrichProjectWithStats(db, project);
}

function enrichProjectWithStats(db: any, project: any, precalculatedStats?: any): ProjectDto {
  const statsRow = precalculatedStats || db.prepare(`
    SELECT
      COUNT(*) as total_inventory,
      SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'BOOKED' THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN status = 'REGISTERED' THEN 1 ELSE 0 END) as registered,
      SUM(CASE WHEN status = 'SOLD' THEN 1 ELSE 0 END) as sold,
      SUM(CASE WHEN status = 'RESERVED' THEN 1 ELSE 0 END) as reserved
    FROM properties
    WHERE project_id = ? AND is_archived = 0 AND is_superseded = 0 AND is_published = 1
  `).get(project.id) as any;

  let parsedHighlights: string[] = [];
  let parsedAmenities: string[] = [];
  try {
    parsedHighlights = project.highlights ? JSON.parse(project.highlights) : [];
  } catch (e) {
    parsedHighlights = [];
  }
  try {
    parsedAmenities = project.amenities ? JSON.parse(project.amenities) : [];
  } catch (e) {
    parsedAmenities = [];
  }

  const freshness = calculateFreshness(project.last_verified_at || project.updated_at);
  const totalInventory = statsRow?.total_inventory || 0;
  const effectiveStatus = (project.status === 'INVENTORY_PENDING' && totalInventory > 0)
    ? 'ACTIVE'
    : project.status;

  return {
    ...project,
    status: effectiveStatus,
    highlights: parsedHighlights,
    amenities: parsedAmenities,
    freshness,
    stats: {
      total_inventory: totalInventory,
      available: statsRow?.available || 0,
      booked: statsRow?.booked || 0,
      registered: statsRow?.registered || 0,
      sold: statsRow?.sold || 0,
      reserved: statsRow?.reserved || 0,
    }
  };
}

export function getProjectLayout(projectId: string) {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ? OR slug = ?').get(projectId, projectId) as any;
  const targetId = project ? project.id : projectId;

  // Prioritize durable cloud storage URLs (https://) and newest published versions
  const layout = db.prepare(`
    SELECT * FROM layouts 
    WHERE project_id = ? AND (status = 'PUBLISHED' OR (status IS NULL AND is_active = 1))
    ORDER BY 
      CASE WHEN image_url LIKE 'http%' THEN 0 ELSE 1 END ASC,
      updated_at DESC 
    LIMIT 1
  `).get(targetId) as any;

  if (!layout) return null;

  let refStats = {};
  try {
    refStats = layout.reference_stats ? JSON.parse(layout.reference_stats) : {};
  } catch (e) {
    refStats = {};
  }

  return {
    ...layout,
    reference_stats: refStats
  };
}

export function uploadProjectLayout(
  projectId: string,
  layoutData: {
    name: string;
    layoutType: 'MASTER_PLAN' | 'SUBDIVISION_PLAN' | 'FLOOR_PLAN' | 'SCHEME_PLAN';
    imageUrl?: string;
    svgContent?: string;
    width?: number;
    height?: number;
    viewbox?: string;
    referenceStats?: any;
    status?: 'DRAFT' | 'PUBLISHED';
  },
  userId: string,
  userRole: string
) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(projectId, projectId) as any;
  if (!project) throw new Error(`Project ${projectId} not found.`);
  const targetProjectId = project.id;

  const now = new Date().toISOString();
  const layoutId = `lay_${targetProjectId.replace('proj_', '')}_${Date.now()}`;
  const targetStatus = layoutData.status || 'PUBLISHED';
  const isActive = targetStatus === 'PUBLISHED' ? 1 : 0;

  // Calculate next version number
  const existingLayouts = db.prepare('SELECT version FROM layouts WHERE project_id = ?').all(targetProjectId) as any[];
  let maxVer = 0;
  for (const l of existingLayouts) {
    const vNum = parseFloat(String(l.version).replace(/[^0-9.]/g, '')) || 1.0;
    if (vNum > maxVer) maxVer = vNum;
  }
  const nextVersion = (maxVer > 0 ? (Math.floor(maxVer) + 1) : 1).toFixed(1);

  const transaction = db.transaction(() => {
    // If publishing immediately, archive previous published layouts
    if (targetStatus === 'PUBLISHED') {
      db.prepare("UPDATE layouts SET status = 'ARCHIVED', is_active = 0, updated_at = ? WHERE project_id = ? AND (status = 'PUBLISHED' OR is_active = 1)").run(now, targetProjectId);
    }

    // Insert new layout
    db.prepare(`
      INSERT INTO layouts (
        id, project_id, name, layout_type, version, svg_content, image_url, width, height, viewbox, reference_stats, status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      layoutId,
      targetProjectId,
      layoutData.name || `${project.name} Official Layout`,
      layoutData.layoutType || 'MASTER_PLAN',
      nextVersion,
      layoutData.svgContent || null,
      layoutData.imageUrl || null,
      layoutData.width || 1191,
      layoutData.height || 842,
      layoutData.viewbox || '0 0 1191 842',
      layoutData.referenceStats ? JSON.stringify(layoutData.referenceStats) : null,
      targetStatus,
      isActive,
      now,
      now
    );

    recordAuditLog({
      entity_type: 'LAYOUT',
      entity_id: layoutId,
      project_id: targetProjectId,
      action: targetStatus === 'PUBLISHED' ? 'PUBLISH_LAYOUT' : 'CREATE_LAYOUT_DRAFT',
      new_values: { layoutId, name: layoutData.name, imageUrl: layoutData.imageUrl, status: targetStatus, version: nextVersion },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  try {
    const allProjectLayouts = db.prepare('SELECT * FROM layouts WHERE project_id = ?').all(targetProjectId) as any[];
    if (allProjectLayouts.length > 0) {
      syncBatchToSupabase('layouts', allProjectLayouts).catch(() => {});
    }
  } catch (e) {}

  const createdLayout = db.prepare('SELECT * FROM layouts WHERE id = ?').get(layoutId) as any;
  return createdLayout;
}


export function getProjectBuildings(projectId: string) {
  const db = getDb();
  const buildings = db.prepare(`
    SELECT * FROM buildings WHERE project_id = ? ORDER BY name ASC
  `).all(projectId) as any[];

  return buildings.map(b => {
    const floors = db.prepare(`
      SELECT * FROM floors WHERE building_id = ? ORDER BY floor_number ASC
    `).all(b.id);
    return {
      ...b,
      floors
    };
  });
}

export function createProject(
  data: {
    name: string;
    project_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL';
    location: string;
    city?: string;
    description?: string;
    highlights?: string[];
    amenities?: string[];
    status?: string;
    is_published?: boolean;
    total_area_reference?: string;
    total_units_reference?: number;
    cover_image?: string;
    brochure_reference?: string;
    official_url?: string;
  },
  userId: string,
  userRole: string
) {

  const db = getDb();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Project name is required.');

  const projectType = data.project_type;
  if (!projectType || !['PLOT', 'APARTMENT', 'COMMERCIAL'].includes(projectType)) {
    throw new Error('Valid project type (PLOT, APARTMENT, COMMERCIAL) is required.');
  }

  const location = String(data.location || '').trim();
  if (!location) throw new Error('Location is required.');

  const city = String(data.city || location || '').trim();

  // Validate uniqueness by name
  const existing = db.prepare('SELECT id FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name) as any;
  if (existing) {
    throw new Error('A project with this name already exists.');
  }

  // Generate unique slug
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const existingSlug = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug) as any;
  if (existingSlug) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const id = `proj_${slug.replace(/-/g, '_')}_${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();
  const highlights = JSON.stringify(data.highlights || []);
  const amenities = JSON.stringify(data.amenities || []);

  db.prepare(`
    INSERT INTO projects (
      id, slug, name, project_type, location, city, description,
      highlights, amenities, total_area_reference, total_units_reference,
      cover_image, status, current_version, is_published, last_verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    id, slug, data.name, data.project_type, data.location, data.city, data.description || null,
    highlights, amenities, data.total_area_reference || null, data.total_units_reference || null,
    data.cover_image || null, data.status || 'ACTIVE', data.is_published ? 1 : 0, now, now, now
  );

  const insertedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (insertedProject) {
    syncEntityToSupabase('projects', insertedProject).catch(() => {});
  }


  recordAuditLog({
    entity_type: 'PROJECT',
    entity_id: id,
    project_id: id,
    action: 'CREATE',
    new_values: data,
    performed_by: userId,
    user_role: userRole
  });

  return getProjectById(id, true);
}

export function updateProject(id: string, updates: Partial<ProjectDto>, userId: string, userRole: string) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!existing) throw new Error(`Project ${id} not found.`);

  const now = new Date().toISOString();
  const updatedName = updates.name ?? existing.name;
  const updatedLocation = updates.location ?? existing.location;
  const updatedCity = updates.city ?? existing.city;
  const updatedDescription = updates.description ?? existing.description;
  const updatedHighlights = updates.highlights ? JSON.stringify(updates.highlights) : existing.highlights;
  const updatedAmenities = updates.amenities ? JSON.stringify(updates.amenities) : existing.amenities;
  const updatedStatus = updates.status ?? existing.status;
  const updatedPublished = updates.is_published !== undefined ? (updates.is_published ? 1 : 0) : existing.is_published;

  db.prepare(`
    UPDATE projects
    SET name = ?, location = ?, city = ?, description = ?, highlights = ?, amenities = ?, status = ?, is_published = ?, updated_at = ?
    WHERE id = ?
  `).run(updatedName, updatedLocation, updatedCity, updatedDescription, updatedHighlights, updatedAmenities, updatedStatus, updatedPublished, now, id);

  const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (updatedProject) {
    syncEntityToSupabase('projects', updatedProject).catch(() => {});
  }

  recordAuditLog({
    entity_type: 'PROJECT',
    entity_id: id,
    project_id: id,
    action: 'UPDATE',
    old_values: existing,
    new_values: updates,
    performed_by: userId,
    user_role: userRole
  });

  return getProjectById(id, true);
}

export function deleteProject(id: string, userId: string, userRole: string) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!existing) throw new Error(`Project ${id} not found.`);

  const transaction = db.transaction(() => {
    // Explicitly delete all dependent records before removing the project
    db.prepare('DELETE FROM properties WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM layouts WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM buildings WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM data_conflicts WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM draft_changes WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM enquiries WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM imports WHERE detected_project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    recordAuditLog({
      entity_type: 'PROJECT',
      entity_id: id,
      project_id: null,
      action: 'DELETE',
      old_values: existing,
      performed_by: userId,
      user_role: userRole
    });
  });

  // Cascade deletion in Supabase
  import('../db/supabaseClient.ts').then(async ({ getSupabaseAdmin }) => {
    const supa = getSupabaseAdmin();
    if (supa) {
      try {
        await supa.from('property_geometry').delete().eq('property_id', id);
        await supa.from('properties').delete().eq('project_id', id);
        await supa.from('layouts').delete().eq('project_id', id);
        await supa.from('projects').delete().eq('id', id);
      } catch (e) {}
    }
  }).catch(() => {});

  return { success: true, message: `Project '${existing.name}' and all associated inventory and layouts were successfully deleted.` };
}


export function reconfigureProjectType(id: string, newType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL', reason: string, userId: string, userRole: string) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!existing) throw new Error(`Project ${id} not found.`);

  if (existing.project_type === newType) {
    return getProjectById(id, true);
  }

  const now = new Date().toISOString();
  const newVersion = (existing.current_version || 1) + 1;

  const transaction = db.transaction(() => {
    // 1. Update project type and increment version
    db.prepare(`
      UPDATE projects
      SET project_type = ?, current_version = ?, updated_at = ?
      WHERE id = ?
    `).run(newType, newVersion, now, id);

    // 2. Insert project version history record
    db.prepare(`
      INSERT INTO project_versions (id, project_id, version_number, project_type, change_summary, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`ver_${id}_${newVersion}`, id, newVersion, newType, reason, userId, now);

    // 3. Supersede previous active inventory of the previous project type to maintain historical integrity
    if (existing.project_type === 'PLOT' && newType === 'APARTMENT') {
      db.prepare(`
        UPDATE properties
        SET is_superseded = 1, superseded_reason = ?
        WHERE project_id = ? AND property_type = 'PLOT' AND is_superseded = 0
      `).run(`Project reclassified from PLOT to APARTMENT: ${reason}`, id);
    }

    // 4. Record audit log
    recordAuditLog({
      entity_type: 'CONFIG',
      entity_id: id,
      project_id: id,
      action: 'CONFIG_CHANGE',
      old_values: { project_type: existing.project_type, version: existing.current_version },
      new_values: { project_type: newType, version: newVersion, reason },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  try {
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (updatedProject) syncEntityToSupabase('projects', updatedProject).catch(() => {});
    const newVer = db.prepare('SELECT * FROM project_versions WHERE id = ?').get(`ver_${id}_${newVersion}`);
    if (newVer) syncEntityToSupabase('project_versions', newVer).catch(() => {});
  } catch (e) {}

  return getProjectById(id, true);
}


export function getProjectVersions(projectId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number DESC
  `).all(projectId);
}

export interface ProjectHealth {
  projectId: string;
  projectName: string;
  totalInventory: number;
  publishedCount: number;
  draftCount: number;
  availableCount: number;
  bookedCount: number;
  registeredCount: number;
  duplicateCount: number;
  conflictCount: number;
  missingRequiredFieldsCount: number;
  layoutStatus: 'PUBLISHED' | 'DRAFT' | 'MISSING';
  layoutAnalysisStatus: 'VERIFIED' | 'NEEDS_REVIEW' | 'PENDING';
  mediaStatus: 'COMPLETE' | 'PARTIAL' | 'PENDING';
  readinessScore: number; // 0 - 100
  readinessStatus: 'READY' | 'NEEDS_ATTENTION' | 'INCOMPLETE';
  checklist: {
    projectInfo: boolean;
    layoutPublished: boolean;
    layoutAnalysisVerified: boolean;
    inventoryPublished: boolean;
    cleanDataQuality: boolean;
  };
}

export function getProjectHealth(projectId: string): ProjectHealth {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) throw new Error(`Project ${projectId} not found.`);

  // 1. Inventory counts
  const invRows = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_published = 1 AND is_archived = 0 THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN has_pending_changes = 1 OR draft_status IS NOT NULL THEN 1 ELSE 0 END) as drafts,
      SUM(CASE WHEN status = 'AVAILABLE' AND is_published = 1 AND is_archived = 0 THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'BOOKED' AND is_published = 1 AND is_archived = 0 THEN 1 ELSE 0 END) as booked,
      SUM(CASE WHEN status = 'REGISTERED' AND is_published = 1 AND is_archived = 0 THEN 1 ELSE 0 END) as registered,
      SUM(CASE WHEN area_sqft IS NULL OR area_sqft <= 0 THEN 1 ELSE 0 END) as missing_fields
    FROM properties
    WHERE project_id = ? AND is_superseded = 0
  `).get(projectId) as any;

  const totalInventory = invRows?.total || 0;
  const publishedCount = invRows?.published || 0;
  const draftCount = invRows?.drafts || 0;
  const availableCount = invRows?.available || 0;
  const bookedCount = invRows?.booked || 0;
  const registeredCount = invRows?.registered || 0;
  const missingRequiredFieldsCount = invRows?.missing_fields || 0;

  // 2. Duplicate counts in DB
  const dupRow = db.prepare(`
    SELECT COUNT(*) - COUNT(DISTINCT LOWER(TRIM(property_number))) as duplicates
    FROM properties
    WHERE project_id = ? AND is_archived = 0 AND is_superseded = 0
  `).get(projectId) as any;
  const duplicateCount = Math.max(0, dupRow?.duplicates || 0);

  // 3. Layout status
  const layout = db.prepare('SELECT * FROM layouts WHERE project_id = ? AND is_active = 1 LIMIT 1').get(projectId) as any;
  const layoutStatus = layout ? 'PUBLISHED' : 'MISSING';

  let layoutAnalysisStatus: 'VERIFIED' | 'NEEDS_REVIEW' | 'PENDING' = 'PENDING';
  if (layout) {
    if (layout.reference_stats) {
      try {
        const stats = JSON.parse(layout.reference_stats);
        layoutAnalysisStatus = stats.isReviewedByCrm ? 'VERIFIED' : 'NEEDS_REVIEW';
      } catch (e) {
        layoutAnalysisStatus = 'NEEDS_REVIEW';
      }
    } else {
      layoutAnalysisStatus = 'NEEDS_REVIEW';
    }
  }

  // 4. Media status
  const mediaCount = db.prepare('SELECT COUNT(*) as count FROM project_media WHERE project_id = ?').get(projectId) as any;
  const mediaStatus = (project.cover_image && (mediaCount?.count || 0) > 0) ? 'COMPLETE' : (project.cover_image ? 'PARTIAL' : 'PENDING');

  // 5. Deterministic Checklist & Readiness Scoring (Section 31)
  const checklist = {
    projectInfo: Boolean(project.name && project.location && project.city && project.description),
    layoutPublished: layoutStatus === 'PUBLISHED',
    layoutAnalysisVerified: layoutAnalysisStatus === 'VERIFIED',
    inventoryPublished: publishedCount > 0 || totalInventory === 0, // Valid if published or starting clean
    cleanDataQuality: duplicateCount === 0 && missingRequiredFieldsCount === 0
  };

  let score = 0;
  if (checklist.projectInfo) score += 20;
  if (checklist.layoutPublished) score += 25;
  if (checklist.layoutAnalysisVerified) score += 15;
  if (checklist.inventoryPublished) score += 25;
  if (checklist.cleanDataQuality) score += 15;

  const readinessStatus: 'READY' | 'NEEDS_ATTENTION' | 'INCOMPLETE' = 
    score >= 95 ? 'READY' : (score >= 60 ? 'NEEDS_ATTENTION' : 'INCOMPLETE');

  return {
    projectId,
    projectName: project.name,
    totalInventory,
    publishedCount,
    draftCount,
    availableCount,
    bookedCount,
    registeredCount,
    duplicateCount,
    conflictCount: 0,
    missingRequiredFieldsCount,
    layoutStatus,
    layoutAnalysisStatus,
    mediaStatus,
    readinessScore: score,
    readinessStatus,
    checklist
  };
}

export function getProjectLayouts(projectId: string) {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ? OR slug = ?').get(projectId, projectId) as any;
  const targetId = project ? project.id : projectId;

  const layouts = db.prepare(`
    SELECT * FROM layouts WHERE project_id = ? ORDER BY created_at DESC
  `).all(targetId) as any[];

  return layouts.map(l => {
    let refStats = {};
    try {
      refStats = l.reference_stats ? JSON.parse(l.reference_stats) : {};
    } catch (e) {
      refStats = {};
    }
    return {
      ...l,
      status: l.status || (l.is_active ? 'PUBLISHED' : 'ARCHIVED'),
      reference_stats: refStats
    };
  });
}

export function publishLayout(layoutId: string, userId: string, userRole: string) {
  const db = getDb();
  const layout = db.prepare('SELECT * FROM layouts WHERE id = ?').get(layoutId) as any;
  if (!layout) throw new Error(`Layout ${layoutId} not found.`);

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    // 1. Archive other layouts for this project
    db.prepare("UPDATE layouts SET status = 'ARCHIVED', is_active = 0, updated_at = ? WHERE project_id = ?").run(now, layout.project_id);
    // 2. Publish target layout
    db.prepare("UPDATE layouts SET status = 'PUBLISHED', is_active = 1, updated_at = ? WHERE id = ?").run(now, layoutId);

    recordAuditLog({
      entity_type: 'LAYOUT',
      entity_id: layoutId,
      project_id: layout.project_id,
      action: 'PUBLISH_LAYOUT',
      new_values: { layoutId, name: layout.name, version: layout.version, status: 'PUBLISHED' },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  try {
    const allProjectLayouts = db.prepare('SELECT * FROM layouts WHERE project_id = ?').all(layout.project_id) as any[];
    if (allProjectLayouts.length > 0) {
      syncBatchToSupabase('layouts', allProjectLayouts).catch(() => {});
    }
  } catch (e) {}

  return getProjectLayout(layout.project_id);
}

export function deleteLayout(layoutId: string, userId: string, userRole: string) {
  const db = getDb();
  const layout = db.prepare('SELECT * FROM layouts WHERE id = ?').get(layoutId) as any;
  if (!layout) throw new Error(`Layout ${layoutId} not found.`);

  const projectId = layout.project_id;
  const transaction = db.transaction(() => {
    // Storage Cleanup (Requirement 21)
    if (layout.image_url && layout.image_url.startsWith('/layouts/')) {
      const filename = path.basename(layout.image_url);
      const publicFilePath = path.join(process.cwd(), 'public', 'layouts', filename);
      const persistentFilePath = path.join(config.uploadsDir, 'layouts', filename);
      const otherUsing = db.prepare('SELECT COUNT(*) as count FROM layouts WHERE image_url = ? AND id != ?').get(layout.image_url, layoutId) as any;
      if (!otherUsing || otherUsing.count === 0) {
        if (fs.existsSync(publicFilePath)) {
          try {
            fs.unlinkSync(publicFilePath);
          } catch (e) {
            console.warn('[Storage Cleanup Warning]: Failed to unlink public file:', publicFilePath, e);
          }
        }
        if (fs.existsSync(persistentFilePath)) {
          try {
            fs.unlinkSync(persistentFilePath);
          } catch (e) {
            console.warn('[Storage Cleanup Warning]: Failed to unlink persistent file:', persistentFilePath, e);
          }
        }
      }
    }

    db.prepare('DELETE FROM layouts WHERE id = ?').run(layoutId);

    recordAuditLog({
      entity_type: 'LAYOUT',
      entity_id: layoutId,
      project_id: projectId,
      action: 'DELETE_LAYOUT',
      old_values: { name: layout.name, imageUrl: layout.image_url, status: layout.status, isActive: layout.is_active },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  deleteEntityFromSupabase('layouts', layoutId).catch(() => {});

  return { success: true, message: `Layout '${layout.name}' successfully deleted.` };
}

/**
 * PROJECT-SCOPED INVENTORY CLEAR / REPLACEMENT (Requirement Phase 10 & 11)
 * Safely removes all inventory properties, property geometry, draft changes, and imports
 * strictly for the specified project. Preserves the project itself, its media, and all other projects.
 * Requires exact confirmation e.g. "CLEAR NOVA VASANTHAM INVENTORY".
 */
export async function clearProjectInventory(
  projectId: string,
  userId: string,
  userRole: string,
  confirmation: string
): Promise<{ success: boolean; message: string; projectId: string; deletedCount: number }> {
  if (userRole !== 'ADMIN' && userRole !== 'CRM_STAFF') {
    throw new Error('Unauthorized: Only administrators with ADMIN or CRM_STAFF role can clear project inventory.');
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    throw new Error(`Project with ID '${projectId}' not found.`);
  }

  const expectedExact1 = `CLEAR ${project.name.toUpperCase().trim()} INVENTORY`;
  const expectedExact2 = `CLEAR ${project.name.toUpperCase().trim()}`;
  const expectedExact3 = `CLEAR ${project.slug.toUpperCase().replace(/-/g, ' ').trim()} INVENTORY`;
  const cleanedConfirm = (confirmation || '').toUpperCase().trim();

  if (cleanedConfirm !== expectedExact1 && cleanedConfirm !== expectedExact2 && cleanedConfirm !== expectedExact3) {
    throw new Error(`Confirmation mismatch: Please type exactly "${expectedExact1}".`);
  }

  let deletedCount = 0;
  const transaction = db.transaction(() => {
    // 1. Delete property_geometry belonging to this project's properties
    db.prepare(`
      DELETE FROM property_geometry 
      WHERE property_id IN (SELECT id FROM properties WHERE project_id = ?)
    `).run(projectId);

    // 2. Delete draft_changes for this project
    db.prepare(`DELETE FROM draft_changes WHERE project_id = ?`).run(projectId);

    // 3. Delete import_rows for imports belonging to this project
    db.prepare(`
      DELETE FROM import_rows 
      WHERE import_id IN (SELECT id FROM imports WHERE detected_project_id = ?)
    `).run(projectId);

    // 4. Delete imports for this project
    db.prepare(`DELETE FROM imports WHERE detected_project_id = ?`).run(projectId);

    // 5. Count and delete properties for this project
    const propCountRow = db.prepare(`SELECT COUNT(*) as c FROM properties WHERE project_id = ?`).get(projectId) as any;
    deletedCount = propCountRow?.c || 0;
    db.prepare(`DELETE FROM properties WHERE project_id = ?`).run(projectId);

    // 6. Record immutable audit log
    recordAuditLog({
      entity_type: 'PROJECT',
      entity_id: projectId,
      project_id: projectId,
      action: 'CLEAR_PROJECT_INVENTORY',
      old_values: { projectName: project.name, clearedPropertyCount: deletedCount },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  // Synchronize deletions to Supabase PostgreSQL in dependency order
  if (process.env.NODE_ENV !== 'test') {
    const { getSupabaseAdmin, isSupabaseConfigured } = await import('../db/supabaseClient.ts');
    const supabase = getSupabaseAdmin();
    if (supabase && isSupabaseConfigured()) {
      try {
        const { data: props } = await supabase.from('properties').select('id').eq('project_id', projectId);
        if (props && props.length > 0) {
          const propIds = props.map(p => p.id);
          await supabase.from('property_geometry').delete().in('property_id', propIds);
        }
        await supabase.from('draft_changes').delete().eq('project_id', projectId);
        
        const { data: imps } = await supabase.from('imports').select('id').eq('detected_project_id', projectId);
        if (imps && imps.length > 0) {
          const impIds = imps.map(i => i.id);
          await supabase.from('import_rows').delete().in('import_id', impIds);
        }
        await supabase.from('imports').delete().eq('detected_project_id', projectId);
        await supabase.from('properties').delete().eq('project_id', projectId);
      } catch (err: any) {
        console.error(`[SupabaseSync] Notice during project clear on Supabase:`, err.message);
      }
    }
  }

  return {
    success: true,
    message: `Successfully cleared ${deletedCount} inventory records for '${project.name}'. Project and layout assets remain intact.`,
    projectId,
    deletedCount
  };
}



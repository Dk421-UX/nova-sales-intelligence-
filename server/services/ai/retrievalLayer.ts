import { getDb } from '../../db/database.ts';
import { getProjectById, getProjectBySlug } from '../projectService.ts';
import { layoutAnalysisService } from '../layoutAnalysisService.ts';
import { RetrievedContext, InventoryFilters, NormalizedRecord } from './types.ts';

export class AiRetrievalLayer {
  /**
   * LEVEL 2: Retrieve published projects catalog
   */
  getPublishedProjects(filters?: { city?: string; location?: string; type?: string }): RetrievedContext {
    const db = getDb();
    let query = 'SELECT * FROM projects WHERE is_published = 1';
    const params: any[] = [];

    if (filters?.city) {
      query += ' AND LOWER(city) LIKE ?';
      params.push(`%${filters.city.toLowerCase()}%`);
    }
    if (filters?.location) {
      query += ' AND (LOWER(location) LIKE ? OR LOWER(city) LIKE ?)';
      params.push(`%${filters.location.toLowerCase()}%`, `%${filters.location.toLowerCase()}%`);
    }
    if (filters?.type) {
      query += ' AND project_type = ?';
      params.push(filters.type);
    }

    query += ' ORDER BY name ASC';
    const rows = db.prepare(query).all(...params) as any[];

    return {
      sourceType: 'PROJECT_DATA',
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        projectType: r.project_type,
        location: r.location,
        city: r.city,
        description: r.description,
        highlights: r.highlights ? JSON.parse(r.highlights) : [],
        amenities: r.amenities ? JSON.parse(r.amenities) : [],
        totalInventory: r.total_inventory,
        availableCount: r.available_count
      }))
    };
  }

  /**
   * LEVEL 2: Retrieve single published project details
   */
  getPublishedProjectBySlug(slug: string): RetrievedContext | null {
    const project = getProjectBySlug(slug);
    if (!project || !project.is_published) return null;

    return {
      sourceType: 'PROJECT_DATA',
      projectId: project.id,
      projectName: project.name,
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      data: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        projectType: project.project_type,
        location: project.location,
        city: project.city,
        description: project.description,
        highlights: project.highlights || [],
        amenities: project.amenities || [],
        totalAreaReference: project.total_area_reference,
        stats: project.stats
      }
    };
  }

  /**
   * LEVEL 1: Live published inventory database query
   * Highest authority. Queries live SQLite database, excluding drafts, superseded, and archived.
   */
  searchPublishedInventory(projectId: string, filters: InventoryFilters, limit = 15): RetrievedContext {
    const db = getDb();
    const project = getProjectById(projectId);

    let query = `
      SELECT * FROM properties
      WHERE project_id = ? AND is_published = 1 AND is_superseded = 0 AND is_archived = 0
    `;
    const params: any[] = [projectId];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status.toUpperCase());
    } else {
      // Default to AVAILABLE for customer property searches
      query += ' AND status = "AVAILABLE"';
    }

    if (filters.facing) {
      query += ' AND LOWER(facing) = LOWER(?)';
      params.push(filters.facing.trim());
    }

    if (filters.unitType) {
      query += ' AND LOWER(unit_type) = LOWER(?)';
      params.push(filters.unitType.trim());
    }

    if (filters.propertyType) {
      query += ' AND property_type = ?';
      params.push(filters.propertyType.toUpperCase());
    }

    if (filters.sectionOrPhase) {
      query += ' AND LOWER(section_or_phase) LIKE ?';
      params.push(`%${filters.sectionOrPhase.toLowerCase()}%`);
    }

    if (filters.minArea !== undefined) {
      query += ' AND (area_sqft >= ? OR saleable_area_sqft >= ?)';
      params.push(filters.minArea, filters.minArea);
    }

    if (filters.maxArea !== undefined) {
      query += ' AND (area_sqft <= ? OR saleable_area_sqft <= ?)';
      params.push(filters.maxArea, filters.maxArea);
    }

    // Count total matching in DB
    const countSql = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalMatch = (db.prepare(countSql).get(...params) as any)?.count || 0;

    // Fetch limited set for conversation presentation
    query += ' ORDER BY CAST(property_number AS INTEGER) ASC, property_number ASC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];

    const records: NormalizedRecord[] = rows.map(r => ({
      propertyNumber: r.property_number,
      propertyType: r.property_type,
      status: r.status,
      facing: r.facing || undefined,
      areaSqft: r.area_sqft || r.saleable_area_sqft || undefined,
      priceDisplay: r.price_display || undefined,
      unitType: r.unit_type || undefined,
      floorName: r.floor_name || undefined,
      sectionOrPhase: r.section_or_phase || undefined,
      udsSqft: r.uds_sqft || undefined,
      saleableAreaSqft: r.saleable_area_sqft || undefined
    }));

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId,
      projectName: project?.name,
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      records,
      data: {
        totalMatches: totalMatch,
        returnedMatches: records.length,
        filtersApplied: filters
      }
    };
  }

  /**
   * LEVEL 1: Specific property lookup in live published inventory
   */
  getPublishedProperty(projectId: string, propertyNumber: string): RetrievedContext | null {
    const db = getDb();
    const project = getProjectById(projectId);
    const raw = String(propertyNumber).trim().toLowerCase();
    const numOnly = raw.replace(/^plot\s*/i, '').replace(/^flat\s*-\s*/i, '').replace(/^unit\s*/i, '').trim();

    const row = db.prepare(`
      SELECT * FROM properties
      WHERE project_id = ? AND (
        LOWER(property_number) = ? OR 
        LOWER(property_number) = ? OR 
        LOWER(property_number) = ? OR
        LOWER(property_number) = ?
      ) AND is_published = 1 AND is_superseded = 0 AND is_archived = 0
      LIMIT 1
    `).get(projectId, raw, `plot ${numOnly}`, numOnly, `ext - plot ${numOnly}`) as any;

    if (!row) return null;

    const record: NormalizedRecord = {
      propertyNumber: row.property_number,
      propertyType: row.property_type,
      status: row.status,
      facing: row.facing || undefined,
      areaSqft: row.area_sqft || row.saleable_area_sqft || undefined,
      priceDisplay: row.price_display || undefined,
      unitType: row.unit_type || undefined,
      floorName: row.floor_name || undefined,
      sectionOrPhase: row.section_or_phase || undefined,
      udsSqft: row.uds_sqft || undefined,
      saleableAreaSqft: row.saleable_area_sqft || undefined
    };

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId,
      projectName: project?.name,
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      records: [record],
      data: record
    };
  }

  /**
   * LEVEL 1: Compare multiple properties in live published inventory
   */
  comparePublishedProperties(projectId: string, propertyNumbers: string[]): RetrievedContext {
    const db = getDb();
    const project = getProjectById(projectId);

    const candidateNumbers = new Set<string>();
    for (const num of propertyNumbers) {
      const raw = String(num).trim().toLowerCase();
      const numOnly = raw.replace(/^plot\s*/i, '').replace(/^flat\s*-\s*/i, '').replace(/^unit\s*/i, '').trim();
      candidateNumbers.add(raw);
      candidateNumbers.add(`plot ${numOnly}`);
      candidateNumbers.add(`ext - plot ${numOnly}`);
      candidateNumbers.add(numOnly);
    }

    const placeholders = Array.from(candidateNumbers).map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT * FROM properties
      WHERE project_id = ? AND LOWER(property_number) IN (${placeholders}) AND is_published = 1 AND is_superseded = 0 AND is_archived = 0
    `).all(projectId, ...Array.from(candidateNumbers)) as any[];

    const records: NormalizedRecord[] = rows.map(r => ({
      propertyNumber: r.property_number,
      propertyType: r.property_type,
      status: r.status,
      facing: r.facing || undefined,
      areaSqft: r.area_sqft || r.saleable_area_sqft || undefined,
      priceDisplay: r.price_display || undefined,
      unitType: r.unit_type || undefined,
      floorName: r.floor_name || undefined,
      sectionOrPhase: r.section_or_phase || undefined,
      udsSqft: r.uds_sqft || undefined,
      saleableAreaSqft: r.saleable_area_sqft || undefined
    }));

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId,
      projectName: project?.name,
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      records,
      data: {
        requested: propertyNumbers,
        found: records.map(r => r.propertyNumber)
      }
    };
  }

  /**
   * LEVEL 3: Official layout and verified layout analysis
   */
  getLayoutAnalysis(projectId: string): RetrievedContext | null {
    const analysis = layoutAnalysisService.getLayoutAnalysis(projectId);
    if (!analysis) return null;

    return {
      sourceType: 'LAYOUT_ANALYSIS',
      projectId,
      projectName: analysis.projectName,
      retrievedAt: new Date().toISOString(),
      publishedState: 'OFFICIAL',
      confidence: analysis.confidence?.overall >= 0.9 ? 'HIGH' : 'MEDIUM',
      data: {
        layoutType: analysis.layoutType,
        roads: analysis.roads || [],
        entrances: analysis.entrances || [],
        parks: analysis.parks || [],
        amenities: analysis.amenities || [],
        sections: analysis.sections || [],
        visiblePropertyLabels: analysis.visiblePropertyLabels || [],
        notes: analysis.notes || [],
        legend: analysis.legend || {}
      }
    };
  }
}

export const aiRetrievalLayer = new AiRetrievalLayer();

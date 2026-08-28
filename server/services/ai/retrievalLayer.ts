import { getDb } from '../../db/database.ts';
import { getProjectById, getProjectBySlug, getAllProjects } from '../projectService.ts';
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
      data: rows.map(r => {
        let total = r.total_inventory;
        let avail = r.available_count;
        if (total === null || total === undefined || avail === null || avail === undefined) {
          const stats = db.prepare(`
            SELECT COUNT(*) as total, SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as avail
            FROM properties
            WHERE project_id = ? AND is_published = 1 AND is_superseded = 0 AND is_archived = 0
          `).get(r.id) as any;
          total = stats?.total || 0;
          avail = stats?.avail || 0;
        }
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          projectType: r.project_type,
          location: r.location,
          city: r.city,
          description: r.description,
          highlights: r.highlights ? (typeof r.highlights === 'string' ? JSON.parse(r.highlights) : r.highlights) : [],
          amenities: r.amenities ? (typeof r.amenities === 'string' ? JSON.parse(r.amenities) : r.amenities) : [],
          totalInventory: total,
          availableCount: avail
        };
      })
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
      projectSlug: project.slug,
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
   * LEVEL 1: Live published inventory database query for a specific project
   * Highest authority. Queries live database, excluding drafts, superseded, and archived.
   */
  searchPublishedInventory(projectId: string, filters: InventoryFilters, limit = 15): RetrievedContext {
    const db = getDb();
    const project = getProjectById(projectId);

    let query = `
      SELECT * FROM properties
      WHERE project_id = ? AND is_published = 1 AND is_superseded = 0 AND is_archived = 0
    `;
    const params: any[] = [projectId];

    if (filters.status && filters.status.toUpperCase() !== 'ALL') {
      query += ' AND status = ?';
      params.push(filters.status.toUpperCase());
    } else if (!filters.status) {
      query += ' AND status = "AVAILABLE"';
    }

    if (filters.facing) {
      query += ' AND LOWER(facing) LIKE LOWER(?)';
      params.push(`%${filters.facing.trim()}%`);
    }

    if (filters.negatedFacing && filters.negatedFacing.length > 0) {
      for (const nf of filters.negatedFacing) {
        query += ' AND (facing IS NULL OR LOWER(facing) NOT LIKE LOWER(?))';
        params.push(`%${nf.trim()}%`);
      }
    }

    if (filters.unitType) {
      query += ' AND LOWER(unit_type) LIKE LOWER(?)';
      params.push(`%${filters.unitType.trim()}%`);
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

    const countSql = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalMatch = (db.prepare(countSql).get(...params) as any)?.count || 0;

    let orderBy = 'ORDER BY CAST(property_number AS INTEGER) ASC, property_number ASC';
    if (filters.sortBy === 'area_asc') {
      orderBy = 'ORDER BY COALESCE(saleable_area_sqft, area_sqft, 0) ASC, CAST(property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'area_desc') {
      orderBy = 'ORDER BY COALESCE(saleable_area_sqft, area_sqft, 0) DESC, CAST(property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'price_asc') {
      orderBy = 'ORDER BY price ASC, CAST(property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'price_desc') {
      orderBy = 'ORDER BY price DESC, CAST(property_number AS INTEGER) ASC';
    }

    const effectiveLimit = filters.limit || limit;
    query += ` ${orderBy} LIMIT ?`;
    params.push(effectiveLimit);

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
      saleableAreaSqft: r.saleable_area_sqft || undefined,
      carpetAreaSqft: r.carpet_area_sqft || undefined,
      plinthAreaSqft: r.plinth_area_sqft || undefined,
      projectId: project?.id,
      projectName: project?.name,
      projectSlug: project?.slug,
      location: project?.location,
      city: project?.city
    }));

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId,
      projectName: project?.name,
      projectSlug: project?.slug,
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
   * LEVEL 1: Live cross-project published inventory search
   * Used when customer asks e.g. "Do you have any 3 BHK apartments in Chennai?", "Show available plots across projects"
   */
  searchPublishedInventoryAcrossProjects(filters: InventoryFilters, limit = 15): RetrievedContext {
    const db = getDb();
    let query = `
      SELECT pr.*, p.name as project_name, p.slug as project_slug, p.location as project_location, p.city as project_city
      FROM properties pr
      JOIN projects p ON pr.project_id = p.id
      WHERE pr.is_published = 1 AND pr.is_superseded = 0 AND pr.is_archived = 0 AND p.is_published = 1
    `;
    const params: any[] = [];

    if (filters.status && filters.status.toUpperCase() !== 'ALL') {
      query += ' AND pr.status = ?';
      params.push(filters.status.toUpperCase());
    } else if (!filters.status) {
      query += ' AND pr.status = "AVAILABLE"';
    }

    if (filters.city) {
      query += ' AND (LOWER(p.city) LIKE ? OR LOWER(p.location) LIKE ?)';
      params.push(`%${filters.city.toLowerCase()}%`, `%${filters.city.toLowerCase()}%`);
    }

    if (filters.location) {
      query += ' AND (LOWER(p.location) LIKE ? OR LOWER(p.city) LIKE ?)';
      params.push(`%${filters.location.toLowerCase()}%`, `%${filters.location.toLowerCase()}%`);
    }

    if (filters.propertyType) {
      query += ' AND pr.property_type = ?';
      params.push(filters.propertyType.toUpperCase());
    }

    if (filters.unitType) {
      query += ' AND LOWER(pr.unit_type) LIKE LOWER(?)';
      params.push(`%${filters.unitType.trim()}%`);
    }

    if (filters.facing) {
      query += ' AND LOWER(pr.facing) LIKE LOWER(?)';
      params.push(`%${filters.facing.trim()}%`);
    }

    if (filters.negatedFacing && filters.negatedFacing.length > 0) {
      for (const nf of filters.negatedFacing) {
        query += ' AND (pr.facing IS NULL OR LOWER(pr.facing) NOT LIKE LOWER(?))';
        params.push(`%${nf.trim()}%`);
      }
    }

    if (filters.sectionOrPhase) {
      query += ' AND LOWER(pr.section_or_phase) LIKE ?';
      params.push(`%${filters.sectionOrPhase.toLowerCase()}%`);
    }

    if (filters.minArea !== undefined) {
      query += ' AND (pr.area_sqft >= ? OR pr.saleable_area_sqft >= ?)';
      params.push(filters.minArea, filters.minArea);
    }

    if (filters.maxArea !== undefined) {
      query += ' AND (pr.area_sqft <= ? OR pr.saleable_area_sqft <= ?)';
      params.push(filters.maxArea, filters.maxArea);
    }

    const countSql = query.replace('SELECT pr.*, p.name as project_name, p.slug as project_slug, p.location as project_location, p.city as project_city', 'SELECT COUNT(*) as count');
    const totalMatch = (db.prepare(countSql).get(...params) as any)?.count || 0;

    let orderBy = 'ORDER BY p.name ASC, CAST(pr.property_number AS INTEGER) ASC, pr.property_number ASC';
    if (filters.sortBy === 'area_asc') {
      orderBy = 'ORDER BY COALESCE(pr.saleable_area_sqft, pr.area_sqft, 0) ASC, CAST(pr.property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'area_desc') {
      orderBy = 'ORDER BY COALESCE(pr.saleable_area_sqft, pr.area_sqft, 0) DESC, CAST(pr.property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'price_asc') {
      orderBy = 'ORDER BY pr.price ASC, CAST(pr.property_number AS INTEGER) ASC';
    } else if (filters.sortBy === 'price_desc') {
      orderBy = 'ORDER BY pr.price DESC, CAST(pr.property_number AS INTEGER) ASC';
    }

    const effectiveLimit = filters.limit || limit;
    query += ` ${orderBy} LIMIT ?`;
    params.push(effectiveLimit);

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
      saleableAreaSqft: r.saleable_area_sqft || undefined,
      carpetAreaSqft: r.carpet_area_sqft || undefined,
      plinthAreaSqft: r.plinth_area_sqft || undefined,
      projectId: r.project_id,
      projectName: r.project_name,
      projectSlug: r.project_slug,
      location: r.project_location,
      city: r.project_city
    }));

    return {
      sourceType: 'LIVE_INVENTORY',
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      records,
      data: {
        totalMatches: totalMatch,
        returnedMatches: records.length,
        filtersApplied: filters,
        crossProject: true
      }
    };
  }

  /**
   * LEVEL 1: Specific property lookup in live published inventory (single or cross-project)
   */
  getPublishedProperty(projectIdOrSlug?: string, propertyNumber?: string): RetrievedContext | null {
    if (!propertyNumber) return null;
    const db = getDb();
    const raw = String(propertyNumber).trim().toLowerCase();
    const numOnly = raw
      .replace(/^flat\s*-\s*/i, '')
      .replace(/^flat\s*/i, '')
      .replace(/^plot\s*-\s*/i, '')
      .replace(/^plot\s*/i, '')
      .replace(/^unit\s*-\s*/i, '')
      .replace(/^unit\s*/i, '')
      .trim();

    let targetProj: any = null;
    if (projectIdOrSlug) {
      targetProj = getProjectBySlug(projectIdOrSlug) || getProjectById(projectIdOrSlug);
    }

    const candidateVariants = [
      raw,
      numOnly,
      `plot ${numOnly}`,
      `flat - ${numOnly}`,
      `flat ${numOnly}`,
      `unit ${numOnly}`,
      `ext - plot ${numOnly}`
    ];
    const placeholders = candidateVariants.map(() => '?').join(',');

    let query = `
      SELECT pr.*, p.name as project_name, p.slug as project_slug, p.location as project_location, p.city as project_city
      FROM properties pr
      JOIN projects p ON pr.project_id = p.id
      WHERE pr.is_published = 1 AND pr.is_superseded = 0 AND pr.is_archived = 0 AND p.is_published = 1
      AND (
        LOWER(pr.property_number) IN (${placeholders}) OR
        LOWER(REPLACE(pr.property_number, ' ', '')) = ? OR
        LOWER(REPLACE(pr.property_number, 'Flat - ', 'Flat ')) = ?
      )
    `;
    const params: any[] = [...candidateVariants, raw.replace(/\s+/g, ''), raw];

    if (targetProj) {
      query += ' AND pr.project_id = ?';
      params.push(targetProj.id);
    }

    query += ' LIMIT 1';
    const row = db.prepare(query).get(...params) as any;

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
      saleableAreaSqft: row.saleable_area_sqft || undefined,
      carpetAreaSqft: row.carpet_area_sqft || undefined,
      plinthAreaSqft: row.plinth_area_sqft || undefined,
      projectId: row.project_id,
      projectName: row.project_name,
      projectSlug: row.project_slug,
      location: row.project_location,
      city: row.project_city
    };

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId: row.project_id,
      projectName: row.project_name,
      projectSlug: row.project_slug,
      retrievedAt: new Date().toISOString(),
      publishedState: 'PUBLISHED',
      records: [record],
      data: record
    };
  }

  /**
   * LEVEL 1: Compare multiple properties in live published inventory
   */
  comparePublishedProperties(projectIdOrSlug?: string, propertyNumbers?: string[]): RetrievedContext {
    if (!propertyNumbers || propertyNumbers.length === 0) {
      return {
        sourceType: 'LIVE_INVENTORY',
        retrievedAt: new Date().toISOString(),
        publishedState: 'PUBLISHED',
        records: [],
        data: { requested: [], found: [] }
      };
    }

    const db = getDb();
    let targetProj: any = null;
    if (projectIdOrSlug) {
      targetProj = getProjectBySlug(projectIdOrSlug) || getProjectById(projectIdOrSlug);
    }

    const candidateNumbers = new Set<string>();
    for (const num of propertyNumbers) {
      const raw = String(num).trim().toLowerCase();
      const numOnly = raw
        .replace(/^flat\s*-\s*/i, '')
        .replace(/^flat\s*/i, '')
        .replace(/^plot\s*-\s*/i, '')
        .replace(/^plot\s*/i, '')
        .replace(/^unit\s*-\s*/i, '')
        .replace(/^unit\s*/i, '')
        .trim();

      candidateNumbers.add(raw);
      candidateNumbers.add(numOnly);
      candidateNumbers.add(`plot ${numOnly}`);
      candidateNumbers.add(`flat - ${numOnly}`);
      candidateNumbers.add(`flat ${numOnly}`);
      candidateNumbers.add(`unit ${numOnly}`);
      candidateNumbers.add(`ext - plot ${numOnly}`);
    }

    const placeholders = Array.from(candidateNumbers).map(() => '?').join(',');

    let query = `
      SELECT pr.*, p.name as project_name, p.slug as project_slug, p.location as project_location, p.city as project_city
      FROM properties pr
      JOIN projects p ON pr.project_id = p.id
      WHERE pr.is_published = 1 AND pr.is_superseded = 0 AND pr.is_archived = 0 AND p.is_published = 1
      AND LOWER(pr.property_number) IN (${placeholders})
    `;
    const params: any[] = [...Array.from(candidateNumbers)];

    if (targetProj) {
      query += ' AND pr.project_id = ?';
      params.push(targetProj.id);
    }

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
      saleableAreaSqft: r.saleable_area_sqft || undefined,
      carpetAreaSqft: r.carpet_area_sqft || undefined,
      plinthAreaSqft: r.plinth_area_sqft || undefined,
      projectId: r.project_id,
      projectName: r.project_name,
      projectSlug: r.project_slug,
      location: r.project_location,
      city: r.project_city
    }));

    return {
      sourceType: 'LIVE_INVENTORY',
      projectId: targetProj?.id,
      projectName: targetProj?.name,
      projectSlug: targetProj?.slug,
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


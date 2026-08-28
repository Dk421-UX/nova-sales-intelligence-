import { Router, Request, Response } from 'express';
import { getAllProjects, getProjectBySlug, getProjectLayout, getProjectBuildings } from '../services/projectService.ts';
import { getProperties, getPropertyById, compareProperties } from '../services/propertyService.ts';
import { officialWebsiteService } from '../services/officialWebsiteService.ts';
import { layoutAnalysisService } from '../services/layoutAnalysisService.ts';
import { getDb } from '../db/database.ts';

export const publicRouter = Router();

// 1. Get all published projects
publicRouter.get('/projects', (req: Request, res: Response) => {
  try {
    const projects = getAllProjects(false);
    res.json({ success: true, projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch projects.' });
  }
});

// 2. Get project details by slug
publicRouter.get('/projects/:slug', (req: Request, res: Response) => {
  try {
    const project = getProjectBySlug(req.params.slug as string, false);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project '${req.params.slug}' not found or not published.` });
    }
    res.json({ success: true, project });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch project.' });
  }
});

// 3. Get project layout plan (SVG & dimensions)
publicRouter.get('/projects/:slug/layout', (req: Request, res: Response) => {
  try {
    const project = getProjectBySlug(req.params.slug as string, false);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project '${req.params.slug}' not found.` });
    }
    const layout = getProjectLayout(project.id);
    res.json({ success: true, layout });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch layout.' });
  }
});

// 3b. Get project structured layout analysis (roads, entrances, parks, amenities)
publicRouter.get('/projects/:slug/layout-analysis', (req: Request, res: Response) => {
  try {
    const project = getProjectBySlug(req.params.slug as string, false);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project '${req.params.slug}' not found.` });
    }
    const analysis = layoutAnalysisService.getLayoutAnalysis(project.id);
    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch layout analysis.' });
  }
});

// 4. Get apartment project buildings and floors
publicRouter.get('/projects/:slug/buildings', (req: Request, res: Response) => {
  try {
    const project = getProjectBySlug(req.params.slug as string, false);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project '${req.params.slug}' not found.` });
    }
    const buildings = getProjectBuildings(project.id);
    res.json({ success: true, buildings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch buildings.' });
  }
});

// 5. Search / filter published properties
publicRouter.get('/properties', (req: Request, res: Response) => {
  try {
    const filter = {
      projectSlug: req.query.project_slug ? String(req.query.project_slug) : undefined,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      facing: req.query.facing ? String(req.query.facing) : undefined,
      minArea: req.query.minArea ? parseFloat(String(req.query.minArea)) : undefined,
      maxArea: req.query.maxArea ? parseFloat(String(req.query.maxArea)) : undefined,
      propertyType: req.query.propertyType as any,
      buildingId: req.query.buildingId ? String(req.query.buildingId) : undefined,
      floorId: req.query.floorId ? String(req.query.floorId) : undefined,
      unitType: req.query.unitType ? String(req.query.unitType) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      includeSuperseded: false, // PUBLIC NEVER SEES SUPERSEDED
      includeArchived: false,   // PUBLIC NEVER SEES ARCHIVED
      includeDrafts: false,     // PUBLIC ONLY SEES PUBLISHED
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 500,
      offset: req.query.offset ? parseInt(String(req.query.offset), 10) : 0,
    };

    const result = getProperties(filter);
    res.json({ success: true, total: result.total, properties: result.properties });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to search properties.' });
  }
});

// 6. Get single property details
publicRouter.get('/properties/:id', (req: Request, res: Response) => {
  try {
    const property = getPropertyById(req.params.id as string);
    if (!property || property.is_archived || property.is_superseded) {
      return res.status(404).json({ success: false, error: 'Property not found or is no longer available.' });
    }
    res.json({ success: true, property });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch property.' });
  }
});

// 7. Compare properties
publicRouter.post('/properties/compare', (req: Request, res: Response) => {
  try {
    const { propertyIds } = req.body;
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ success: false, error: 'propertyIds array is required.' });
    }
    const comparison = compareProperties(propertyIds);
    res.json({ success: true, comparison });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to compare properties.' });
  }
});

// 8. Submit customer enquiry
publicRouter.post('/enquiries', (req: Request, res: Response) => {
  try {
    const { projectId, propertyId, customerName, customerPhone, customerEmail, message } = req.body;
    if (!projectId || !customerName || !customerPhone) {
      return res.status(400).json({ success: false, error: 'Project, Customer Name, and Phone Number are required.' });
    }

    const db = getDb();
    const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO enquiries (id, project_id, property_id, customer_name, customer_phone, customer_email, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?)
    `).run(id, projectId, propertyId || null, customerName, customerPhone, customerEmail || null, message || '', now);

    res.json({ success: true, enquiryId: id, message: 'Thank you! Our Nova property specialist will get in touch with you shortly.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to submit enquiry.' });
  }
});

// 9. Get Official Nova Branding
publicRouter.get('/branding', (req: Request, res: Response) => {
  try {
    const branding = officialWebsiteService.getBranding();
    res.json({ success: true, branding });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch official branding.' });
  }
});

// 10. Get Official Website Project Content
publicRouter.get('/projects/:slug/official-content', (req: Request, res: Response) => {
  try {
    const content = officialWebsiteService.getProjectContent(req.params.slug as string);
    res.json({ success: true, content });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch official project content.' });
  }
});


import { getDb } from '../../db/database.ts';
import { getProperties, getPropertyById, compareProperties as comparePropsHelper } from '../propertyService.ts';
import { getProjectById, getProjectBySlug, getProjectLayout } from '../projectService.ts';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export const AI_TOOLS: ToolDefinition[] = [
  {
    name: 'search_properties',
    description: 'Search currently verified and published properties (plots or apartments) in the Nova database based on customer requirements.',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'The project slug, e.g. "nova-diya-gardens", "nova-vasantham", "nova-tejas", "nova-ncr"' },
        property_type: { type: 'string', enum: ['PLOT', 'APARTMENT', 'COMMERCIAL_SHOP'], description: 'Property type filter' },
        status: { type: 'string', enum: ['AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED'], description: 'Property status filter. Default to AVAILABLE when customer asks for available units.' },
        facing: { type: 'string', description: 'Facing orientation such as "East", "North", "West", "South"' },
        min_area: { type: 'number', description: 'Minimum area in square feet' },
        max_area: { type: 'number', description: 'Maximum area in square feet' },
        unit_type: { type: 'string', description: 'Apartment unit configuration, e.g. "2 BHK", "3 BHK", "2B2T+STUDY"' },
        section_or_phase: { type: 'string', description: 'Phase or section name, e.g. "Phase 1", "Edens 4", "Floor 2"' }
      }
    }
  },
  {
    name: 'get_property_details',
    description: 'Get verified attributes and live status for a specific plot or apartment unit.',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug' },
        property_number: { type: 'string', description: 'Plot number or flat name, e.g. "105", "PP:1", "Flat - 1A", "Unit 101"' }
      },
      required: ['project_slug', 'property_number']
    }
  },
  {
    name: 'get_project_details',
    description: 'Get approved overview, location, highlights, amenities, and project type for a Nova project.',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug, e.g. "nova-diya-gardens", "nova-vasantham", "nova-tejas"' }
      },
      required: ['project_slug']
    }
  },
  {
    name: 'get_project_availability_summary',
    description: 'Get real-time calculated database inventory counts (Available, Booked, Registered, Sold) for a project.',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug' }
      },
      required: ['project_slug']
    }
  },
  {
    name: 'compare_properties',
    description: 'Compare two or more verified properties side-by-side using real database attributes.',
    parameters: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Project slug' },
        property_numbers: { type: 'string', description: 'Comma separated list of property numbers, e.g. "105, 118" or "Flat - 1A, Flat - 1B"' }
      },
      required: ['project_slug', 'property_numbers']
    }
  }
];

export async function executeAiTool(toolName: string, args: any): Promise<any> {
  const db = getDb();

  switch (toolName) {
    case 'search_properties': {
      let projectId: string | undefined = undefined;
      if (args.project_slug) {
        const p = getProjectBySlug(args.project_slug);
        if (p) projectId = p.id;
      }

      const res = getProperties({
        projectId,
        propertyType: args.property_type,
        status: args.status || 'AVAILABLE',
        facing: args.facing,
        minArea: args.min_area,
        maxArea: args.max_area,
        unitType: args.unit_type,
        includeSuperseded: false,
        includeArchived: false,
        includeDrafts: false,
        limit: 15
      });

      return {
        count: res.total,
        returned: res.properties.length,
        properties: res.properties.map(p => ({
          property_number: p.property_number,
          property_type: p.property_type,
          status: p.status,
          facing: p.facing,
          area_sqft: p.area_sqft,
          price_display: p.price_display,
          section_or_phase: p.section_or_phase,
          unit_type: p.unit_type,
          floor_name: p.floor_name,
          saleable_area_sqft: p.saleable_area_sqft,
          uds_sqft: p.uds_sqft
        }))
      };
    }

    case 'get_property_details': {
      const p = getProjectBySlug(args.project_slug);
      if (!p) return { error: `Project '${args.project_slug}' not found.` };

      const row = db.prepare(`
        SELECT * FROM properties 
        WHERE project_id = ? AND LOWER(property_number) = LOWER(?) AND is_superseded = 0 AND is_archived = 0 AND is_published = 1
      `).get(p.id, String(args.property_number).trim()) as any;

      if (!row) return { error: `Property '${args.property_number}' is not found in published records for ${p.name}.` };

      return {
        project_name: p.name,
        property_number: row.property_number,
        property_type: row.property_type,
        status: row.status,
        facing: row.facing,
        area_sqft: row.area_sqft,
        price_display: row.price_display,
        section_or_phase: row.section_or_phase,
        unit_type: row.unit_type,
        plinth_area_sqft: row.plinth_area_sqft,
        saleable_area_sqft: row.saleable_area_sqft,
        carpet_area_sqft: row.carpet_area_sqft,
        uds_sqft: row.uds_sqft,
        last_verified_at: row.last_verified_at
      };
    }

    case 'get_project_details': {
      const p = getProjectBySlug(args.project_slug);
      if (!p) return { error: `Project '${args.project_slug}' not found.` };

      return {
        name: p.name,
        slug: p.slug,
        project_type: p.project_type,
        location: p.location,
        city: p.city,
        description: p.description,
        highlights: p.highlights,
        amenities: p.amenities,
        total_area_reference: p.total_area_reference,
        inventory_stats: p.stats
      };
    }

    case 'get_project_availability_summary': {
      const p = getProjectBySlug(args.project_slug);
      if (!p) return { error: `Project '${args.project_slug}' not found.` };

      return {
        project_name: p.name,
        project_type: p.project_type,
        last_verified_at: p.last_verified_at,
        stats: p.stats
      };
    }

    case 'compare_properties': {
      const p = getProjectBySlug(args.project_slug);
      if (!p) return { error: `Project '${args.project_slug}' not found.` };

      const propNums = String(args.property_numbers).split(',').map(s => s.trim().toLowerCase());
      const placeholders = propNums.map(() => '?').join(',');

      const rows = db.prepare(`
        SELECT * FROM properties
        WHERE project_id = ? AND LOWER(property_number) IN (${placeholders}) AND is_superseded = 0 AND is_archived = 0 AND is_published = 1
      `).all(p.id, ...propNums) as any[];

      if (rows.length === 0) {
        return { error: 'None of the requested properties could be found in published records.' };
      }

      return {
        project_name: p.name,
        comparison: rows.map(r => ({
          property_number: r.property_number,
          property_type: r.property_type,
          status: r.status,
          facing: r.facing,
          area_sqft: r.area_sqft,
          price_display: r.price_display,
          section_or_phase: r.section_or_phase,
          unit_type: r.unit_type,
          saleable_area_sqft: r.saleable_area_sqft,
          uds_sqft: r.uds_sqft
        }))
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

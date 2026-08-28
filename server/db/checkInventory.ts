import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.resolve(process.cwd(), 'nova_explorer.db'));

console.log('=== PROJECT COUNTS ===');
const projects = db.prepare('SELECT id, slug, name, project_type, status, is_published FROM projects ORDER BY name').all();
console.table(projects);

console.log('=== OVERALL PROPERTY COUNTS BY STATUS ===');
const statusCounts = db.prepare(`
  SELECT 
    status,
    COUNT(*) as total_count,
    SUM(CASE WHEN is_published = 1 AND is_archived = 0 AND is_superseded = 0 THEN 1 ELSE 0 END) as active_published,
    SUM(CASE WHEN is_superseded = 1 THEN 1 ELSE 0 END) as superseded,
    SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) as archived
  FROM properties
  GROUP BY status
`).all();
console.table(statusCounts);

console.log('=== PLOT PROJECTS AVAILABLE INVENTORY ===');
const plotCounts = db.prepare(`
  SELECT 
    pr.name as project_name,
    pr.slug,
    COUNT(p.id) as total_properties,
    SUM(CASE WHEN p.status = 'AVAILABLE' AND p.is_published = 1 AND p.is_archived = 0 AND p.is_superseded = 0 THEN 1 ELSE 0 END) as available,
    SUM(CASE WHEN p.status = 'BOOKED' AND p.is_published = 1 AND p.is_archived = 0 AND p.is_superseded = 0 THEN 1 ELSE 0 END) as booked,
    SUM(CASE WHEN p.status = 'REGISTERED' AND p.is_published = 1 AND p.is_archived = 0 AND p.is_superseded = 0 THEN 1 ELSE 0 END) as registered
  FROM projects pr
  LEFT JOIN properties p ON pr.id = p.project_id
  WHERE pr.project_type = 'PLOT'
  GROUP BY pr.id
  ORDER BY pr.name
`).all();
console.table(plotCounts);

const totalPlotAvailable = db.prepare(`
  SELECT COUNT(*) as count
  FROM properties p
  JOIN projects pr ON p.project_id = pr.id
  WHERE pr.project_type = 'PLOT' 
    AND p.status = 'AVAILABLE' 
    AND p.is_published = 1 
    AND p.is_archived = 0 
    AND p.is_superseded = 0
`).get() as any;
console.log('TOTAL AVAILABLE PLOTS ACROSS ALL PLOT PROJECTS:', totalPlotAvailable?.count);


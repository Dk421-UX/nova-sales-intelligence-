import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'nova_explorer.db');
const db = new Database(dbPath);

const tables = [
  'users', 'projects', 'project_versions', 'project_sources', 'project_media',
  'layouts', 'buildings', 'floors', 'properties', 'property_geometry',
  'imports', 'import_rows', 'draft_changes', 'audit_logs', 'enquiries',
  'official_content_cache'
];

console.log('[SQLite Check] Local SQLite database counts:');
for (const t of tables) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM "${t}"`).get() as any;
    console.log(`Table: ${t.padEnd(25)} | Count: ${String(row.count).padStart(5)}`);
  } catch (err: any) {
    console.log(`Table: ${t.padEnd(25)} | ERROR: ${err.message}`);
  }
}

import { Database as DatabaseType } from 'better-sqlite3';
import { getDb } from './database.ts';

export function runMigrations(db: DatabaseType = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const appliedVersions = new Set(applied.map(a => a.version));

  // Migration 1: Initial schema
  if (!appliedVersions.has(1)) {
    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
    insertMigration.run(1, '001_initial_canonical_schema', new Date().toISOString());
    console.log('[Migration] Applied: 001_initial_canonical_schema');
  }

  // Migration 3: Diya Garden Location to Thiruvallur, Clean Test Projects & Layout Status
  if (!appliedVersions.has(3)) {
    // 1. Correct Diya Gardens Location to Thiruvallur
    db.prepare(`
      UPDATE projects 
      SET location = 'Thiruvallur', city = 'Thiruvallur', updated_at = ?
      WHERE id = 'proj_nova_diya_gardens' OR slug = 'nova-diya-gardens'
    `).run(new Date().toISOString());

    // 2. Cleanly purge any test projects
    const testProj = db.prepare("SELECT id FROM projects WHERE slug = 'nova-test-no-layout' OR id = 'proj_test_no_layout'").get() as any;
    if (testProj) {
      db.prepare('DELETE FROM properties WHERE project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM layouts WHERE project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM project_versions WHERE project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM project_media WHERE project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM buildings WHERE project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM imports WHERE detected_project_id = ?').run(testProj.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(testProj.id);
    }

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
    insertMigration.run(3, '003_diya_garden_location_and_cleanup', new Date().toISOString());
    console.log('[Migration] Applied: 003_diya_garden_location_and_cleanup');
  }

  // Migration 4: Add status column to layouts table if not present
  if (!appliedVersions.has(4)) {
    try {
      const columns = db.prepare("PRAGMA table_info(layouts)").all() as any[];
      const hasStatus = columns.some(c => c.name === 'status');
      if (!hasStatus) {
        db.exec("ALTER TABLE layouts ADD COLUMN status TEXT DEFAULT 'PUBLISHED'");
        db.exec("UPDATE layouts SET status = 'PUBLISHED' WHERE is_active = 1");
        db.exec("UPDATE layouts SET status = 'ARCHIVED' WHERE is_active = 0");
      }
    } catch (e) {
      console.warn('[Migration 4 Warning]:', e);
    }

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
    insertMigration.run(4, '004_layout_lifecycle_status_column', new Date().toISOString());
    console.log('[Migration] Applied: 004_layout_lifecycle_status_column');
  }

  // Migration 5: Clean customer-facing display names (Preserving IDs and Slugs)
  if (!appliedVersions.has(5)) {
    try {
      db.prepare(`
        UPDATE projects SET name = 'Nova KNG Pudur', updated_at = ?
        WHERE id = 'proj_kng_pudur_opt3' OR slug = 'kng-pudur-option-03'
      `).run(new Date().toISOString());

      db.prepare(`
        UPDATE projects SET name = 'Nova Diya Gardens', updated_at = ?
        WHERE id = 'proj_nova_diya_gardens' OR slug = 'nova-diya-gardens'
      `).run(new Date().toISOString());

      db.prepare(`
        UPDATE projects SET name = 'Nova NCR', updated_at = ?
        WHERE id = 'proj_nova_ncr' OR slug = 'nova-ncr'
      `).run(new Date().toISOString());
    } catch (e) {
      console.warn('[Migration 5 Warning]:', e);
    }

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
    insertMigration.run(5, '005_clean_customer_project_names', new Date().toISOString());
    console.log('[Migration] Applied: 005_clean_customer_project_names');
  }

  // Migration 6: Rename Nova KNG Pudur to Nova Pinnacle & Update Nova City Location to Thiruvallur
  if (!appliedVersions.has(6)) {
    try {
      // 1. Rename KNG Pudur to Nova Pinnacle
      db.prepare(`
        UPDATE projects SET name = 'Nova Pinnacle', updated_at = ?
        WHERE id = 'proj_kng_pudur_opt3' OR slug = 'kng-pudur-option-03'
      `).run(new Date().toISOString());

      // 2. Correct Nova City location and city to Thiruvallur
      db.prepare(`
        UPDATE projects SET location = 'Thiruvallur', city = 'Thiruvallur', updated_at = ?
        WHERE id = 'proj_nova_city' OR slug = 'nova-city'
      `).run(new Date().toISOString());
    } catch (e) {
      console.warn('[Migration 6 Warning]:', e);
    }

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
    insertMigration.run(6, '006_rename_nova_pinnacle_and_nova_city_thiruvallur', new Date().toISOString());
    console.log('[Migration] Applied: 006_rename_nova_pinnacle_and_nova_city_thiruvallur');
  }
}

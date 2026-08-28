import { getSupabaseAdmin, isSupabaseConfigured } from './db/supabaseClient.ts';
import { getDb } from './db/database.ts';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function run() {
  const db = getDb();
  const supabase = getSupabaseAdmin();

  console.log('======================================================================');
  console.log('              PRE-CLEANUP PRODUCTION SNAPSHOT REPORT                  ');
  console.log('======================================================================\n');

  const tables = [
    'projects', 'properties', 'layouts', 'buildings', 'floors', 
    'property_geometry', 'project_media', 'project_sources', 
    'project_versions', 'imports', 'import_rows', 'draft_changes', 'audit_logs'
  ];

  console.log('--- 1. TABLE ROW COUNTS ---');
  for (const t of tables) {
    let sqCount = 'N/A';
    try {
      sqCount = (db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get() as any).c;
    } catch (_) {}

    let supaCount = 'N/A';
    if (supabase) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      supaCount = error ? `ERR: ${error.message}` : String(count);
    }
    console.log(`Table [${t.padEnd(20)}]: SQLite = ${String(sqCount).padStart(5)} | Supabase = ${String(supaCount).padStart(5)}`);
  }

  console.log('\n--- 2. PROJECT BREAKDOWN & DUPLICATE DIAGNOSTIC ---');
  const projects = db.prepare('SELECT * FROM projects ORDER BY name').all() as any[];
  for (const p of projects) {
    const propCount = (db.prepare('SELECT COUNT(*) as c FROM properties WHERE project_id = ?').get(p.id) as any).c;
    const layoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts WHERE project_id = ?').get(p.id) as any).c;
    const versionCount = (db.prepare('SELECT COUNT(*) as c FROM project_versions WHERE project_id = ?').get(p.id) as any).c;
    
    let supaProps = 'N/A';
    let supaLayouts = 'N/A';
    if (supabase) {
      const { count: cp } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', p.id);
      const { count: cl } = await supabase.from('layouts').select('*', { count: 'exact', head: true }).eq('project_id', p.id);
      supaProps = cp !== null ? String(cp) : '0';
      supaLayouts = cl !== null ? String(cl) : '0';
    }

    const isDuplicate = p.id === 'proj_kng_pudur_opt3';
    console.log(`[${p.id}] Name: ${p.name.padEnd(22)} | Slug: ${p.slug.padEnd(22)} | Type: ${p.project_type.padEnd(10)} | City: ${(p.city || 'N/A').padEnd(12)} | Props: (SQ:${String(propCount).padStart(3)}, SB:${String(supaProps).padStart(3)}) | Layouts: (SQ:${layoutCount}, SB:${supaLayouts}) | Canonical: ${isDuplicate ? 'NO (Duplicate/Legacy)' : 'YES'}`);
  }
}

run();

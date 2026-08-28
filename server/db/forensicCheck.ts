import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient.ts';
import dotenv from 'dotenv';
dotenv.config();

async function runDiscovery() {
  console.log('================================================================');
  console.log(' PHASE 1: PRODUCTION DATABASE FORENSIC CHECK');
  console.log('================================================================');
  const supaConfigured = isSupabaseConfigured();
  const supaUrl = process.env.SUPABASE_URL || '';
  let host = 'none';
  try {
    if (supaUrl) host = new URL(supaUrl).host;
  } catch (e) {}

  console.log('Supabase Configured:        ', supaConfigured);
  console.log('Supabase Host:              ', host);
  console.log('Service Role Key Configured:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('Anon Key Configured:        ', !!process.env.SUPABASE_ANON_KEY);
  console.log('NODE_ENV:                   ', process.env.NODE_ENV || 'development');
  console.log('DB_PATH:                    ', process.env.DB_PATH || 'nova_explorer.db (default)');

  console.log('\n================================================================');
  console.log(' PHASE 2: PRODUCTION DATA DISCOVERY (SUPABASE POSTGRESQL)');
  console.log('================================================================');
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('ERROR: Supabase admin client unavailable.');
    return;
  }

  const tables = [
    'users', 'projects', 'project_versions', 'layouts', 'buildings', 
    'floors', 'properties', 'property_geometry', 'imports', 
    'import_rows', 'draft_changes', 'audit_logs', 'enquiries', 'official_content_cache'
  ];

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table [${table.padEnd(24)}]: ERROR -> ${error.message}`);
    } else {
      console.log(`Table [${table.padEnd(24)}]: ${String(count).padStart(4)} records`);
    }
  }

  console.log('\n================================================================');
  console.log(' PROJECT-LEVEL BREAKDOWN IN AUTHORITATIVE SUPABASE');
  console.log('================================================================');
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, slug, name, project_type, is_published, status')
    .order('name');

  if (projErr) {
    console.error('Error fetching projects:', projErr.message);
    return;
  }

  console.log(`Total Projects in Supabase: ${projects?.length || 0}`);
  const plotProjects = (projects || []).filter(p => p.project_type === 'PLOT');
  const aptProjects = (projects || []).filter(p => p.project_type === 'APARTMENT');
  console.log(`PLOT Projects:             ${plotProjects.length}`);
  console.log(`APARTMENT Projects:        ${aptProjects.length}\n`);

  for (const p of (projects || [])) {
    const { count: propCount } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', p.id);
    const { count: availCount } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'AVAILABLE');
    const { count: bookedCount } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'BOOKED');
    const { count: soldCount } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', p.id).in('status', ['SOLD', 'REGISTERED']);
    const { count: layoutCount } = await supabase.from('layouts').select('*', { count: 'exact', head: true }).eq('project_id', p.id);

    console.log(
      `[${p.id}] ${p.name.padEnd(22)} | Type: ${p.project_type.padEnd(9)} | Status: ${p.status.padEnd(6)} | Published: ${p.is_published ? 'YES' : 'NO '} | Total: ${String(propCount).padStart(3)} (Avail: ${String(availCount).padStart(3)}, Booked: ${String(bookedCount).padStart(3)}, Sold/Reg: ${String(soldCount).padStart(3)}) | Layouts: ${layoutCount}`
    );
  }
}

runDiscovery().catch(console.error);

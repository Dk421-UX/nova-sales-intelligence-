import { getSupabaseAdmin } from './supabaseClient.ts';
import dotenv from 'dotenv';
dotenv.config();

const original12Ids = [
  'proj_nova_diya_gardens',
  'proj_nova_pinnacle',
  'proj_nova_ncr',
  'proj_nova_edens',
  'proj_nova_city',
  'proj_nova_hi_tech',
  'proj_nova_knt',
  'proj_nova_aardhiya',
  'proj_nova_vasantham',
  'proj_nova_tejas',
  'proj_nova_ramala',
  'proj_nova_vr_squares'
];

export async function restoreAndVerifyOriginal12() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  console.log('================================================================');
  console.log(' RESTORING & ENFORCING ORIGINAL 12 NOVA PROJECTS IN SUPABASE');
  console.log('================================================================\n');

  // 1. Fetch current projects
  const { data: allProjects, error: fetchErr } = await supabase.from('projects').select('*');
  if (fetchErr) throw fetchErr;

  // 2. Report project inventory safely without destructive pruning
  console.log(`Current projects in Supabase: ${allProjects?.length}`);


  // 3. Verify exactly 12 projects in Supabase
  const { data: finalProjects, error: finalErr } = await supabase
    .from('projects')
    .select('id, slug, name, project_type, location, city, status, is_published')
    .order('name', { ascending: true });

  if (finalErr) throw finalErr;

  const plotProjects = (finalProjects || []).filter(p => p.project_type === 'PLOT');
  const apartmentProjects = (finalProjects || []).filter(p => p.project_type === 'APARTMENT');

  console.log('\n--- FINAL VERIFIED PROJECT CATALOG IN SUPABASE ---');
  console.log(`Total Projects:     ${finalProjects?.length} (Expected: 12)`);
  console.log(`PLOT Projects:      ${plotProjects.length} (Expected: 8)`);
  console.log(`APARTMENT Projects: ${apartmentProjects.length} (Expected: 4)`);

  console.log('\nPLOT Projects (8):');
  plotProjects.forEach((p, idx) => console.log(`  ${idx + 1}. [${p.id}] ${p.name.padEnd(25)} | Slug: ${p.slug.padEnd(22)} | City: ${p.city}`));

  console.log('\nAPARTMENT Projects (4):');
  apartmentProjects.forEach((p, idx) => console.log(`  ${idx + 1}. [${p.id}] ${p.name.padEnd(25)} | Slug: ${p.slug.padEnd(22)} | City: ${p.city}`));

  // 4. Verify table counts
  const tables = [
    'users',
    'projects',
    'project_versions',
    'layouts',
    'buildings',
    'floors',
    'properties',
    'imports',
    'import_rows',
    'audit_logs'
  ];

  console.log('\n--- FINAL TABLE COUNTS IN SUPABASE ---');
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    counts[table] = count ?? 0;
    console.log(`Table [${table.padEnd(20)}]: ${String(count).padStart(3)} rows`);
  }

  const isExact = (finalProjects?.length === 12 && plotProjects.length === 8 && apartmentProjects.length === 4);
  console.log(`\nOriginal 12 Dataset Exact Match: ${isExact ? '✓ SUCCESS' : '✗ FAILED'}`);

  return {
    totalProjects: finalProjects?.length || 0,
    plotCount: plotProjects.length,
    apartmentCount: apartmentProjects.length,
    counts,
    success: isExact
  };
}

if (process.argv[1] && process.argv[1].endsWith('restoreOriginal12.ts')) {
  restoreAndVerifyOriginal12().then(res => {
    if (!res.success) process.exit(1);
    process.exit(0);
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

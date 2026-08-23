import { getAllProjects, getProjectBySlug } from '../server/services/projectService.ts';
import { getProperties } from '../server/services/propertyService.ts';
import { getSupabaseAdmin } from '../server/db/supabaseClient.ts';
import { getDb } from '../server/db/database.ts';

async function runApartmentDisplaySuite() {
  console.log('================================================================');
  console.log(' APARTMENT INVENTORY DISPLAY & PERSISTENCE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${msg}`);
      failed++;
    }
  }

  // Test 1: Project Catalog Verification (12 Total, 8 Plot, 4 Apartment)
  const allProjects = getAllProjects(false);
  assert(allProjects.length === 12, `Total public projects is 12 (Found: ${allProjects.length})`);
  
  const plotProjects = allProjects.filter(p => p.project_type === 'PLOT');
  const aptProjects = allProjects.filter(p => p.project_type === 'APARTMENT');
  assert(plotProjects.length === 8, `PLOT projects count is 8 (Found: ${plotProjects.length})`);
  assert(aptProjects.length === 4, `APARTMENT projects count is 4 (Found: ${aptProjects.length})`);

  // Test 2: Nova Vasantham Project & Stats
  const vasantham = getProjectBySlug('nova-vasantham', false);
  assert(vasantham !== null, 'Nova Vasantham project exists');
  assert(vasantham?.project_type === 'APARTMENT', 'Nova Vasantham is APARTMENT type');
  assert(vasantham?.stats.total_inventory === 12, `Nova Vasantham total_inventory is 12 (Found: ${vasantham?.stats.total_inventory})`);
  assert(vasantham?.stats.available === 12, `Nova Vasantham available is 12 (Found: ${vasantham?.stats.available})`);
  assert(vasantham?.status === 'ACTIVE', `Nova Vasantham status is ACTIVE (Found: ${vasantham?.status})`);

  // Test 3: Nova Vasantham Properties Query
  const vasanthamProps = getProperties({ projectSlug: 'nova-vasantham', includeDrafts: false });
  assert(vasanthamProps.total === 12, `Nova Vasantham properties count is 12 (Found: ${vasanthamProps.total})`);
  assert(vasanthamProps.properties.length === 12, `Nova Vasantham returned properties array length is 12 (Found: ${vasanthamProps.properties.length})`);

  const expectedFlats = ['1A', '2A', '3A', '1B', '2B', '3B', '1C', '2C', '3C', '1D', '2D', '3D'];
  const actualFlats = vasanthamProps.properties.map(p => p.property_number).sort();
  const allFlatsPresent = expectedFlats.every(f => actualFlats.includes(f));
  assert(allFlatsPresent, `All 12 expected flats (1A-3D) present in Vasantham inventory (Found: ${actualFlats.join(', ')})`);

  const allAvailable = vasanthamProps.properties.every(p => p.status === 'AVAILABLE');
  assert(allAvailable, 'All Vasantham flats have status AVAILABLE');

  const allApartmentType = vasanthamProps.properties.every(p => p.property_type === 'APARTMENT');
  assert(allApartmentType, 'All Vasantham properties have property_type = APARTMENT');

  // Test 4: Other Apartment Projects Verification
  const tejas = getProjectBySlug('nova-tejas', false);
  assert(tejas?.project_type === 'APARTMENT' && tejas.stats.total_inventory === 10, `Nova Tejas has 10 apartment units (Found: ${tejas?.stats.total_inventory})`);

  const ramala = getProjectBySlug('nova-ramala', false);
  assert(ramala?.project_type === 'APARTMENT' && ramala.stats.total_inventory === 6, `Nova Ramala has 6 apartment units (Found: ${ramala?.stats.total_inventory})`);

  const vrSquares = getProjectBySlug('nova-vr-squares', false);
  assert(vrSquares?.project_type === 'APARTMENT' && vrSquares.stats.total_inventory === 6, `Nova VR Squares has 6 apartment units (Found: ${vrSquares?.stats.total_inventory})`);

  // Test 5: Plot Projects Intact
  const diya = getProjectBySlug('nova-diya-gardens', false);
  assert(diya?.project_type === 'PLOT' && (diya.stats.total_inventory || 0) > 0, `Nova Diya Gardens has active plot inventory (${diya?.stats.total_inventory} units)`);

  const pinnacle = getProjectBySlug('kng-pudur-option-03', false);
  assert(pinnacle?.project_type === 'PLOT' && (pinnacle.stats.total_inventory || 0) > 0, `Nova Pinnacle has active plot inventory (${pinnacle?.stats.total_inventory} units)`);

  // Test 6: Supabase Authoritative Match
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { count: supaProjCount } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    assert(supaProjCount === 12, `Supabase contains exactly 12 projects (Found: ${supaProjCount})`);

    const { count: supaVasanthamProps } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('project_id', 'proj_nova_vasantham');
    assert(supaVasanthamProps === 12, `Supabase contains 12 properties for proj_nova_vasantham (Found: ${supaVasanthamProps})`);
  }

  console.log('\n================================================================');
  console.log(` SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runApartmentDisplaySuite().catch(err => {
  console.error(err);
  process.exit(1);
});

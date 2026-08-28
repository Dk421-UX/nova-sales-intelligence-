import { getDb, closeDb } from '../server/db/database.ts';
import { getSupabaseAdmin, isSupabaseConfigured } from '../server/db/supabaseClient.ts';
import { initAndSyncFromSupabase, isHydrated, waitForHydration } from '../server/db/supabaseSync.ts';
import { getAllProjects, getProjectBySlug, getProjectById } from '../server/services/projectService.ts';
import { getProperties, getPropertyById } from '../server/services/propertyService.ts';
import { aiService } from '../server/services/ai/aiService.ts';
import { AI_TOOLS } from '../server/services/ai/tools.ts';
import { config } from '../server/config.ts';
import dotenv from 'dotenv';
dotenv.config();

async function runProductionDataIntegritySuite() {
  console.log('================================================================');
  console.log(' NOVA PRODUCTION DATA INTEGRITY & PERSISTENCE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      if (details) console.error('    Details:', details);
      failed++;
    }
  }

  // ----------------------------------------------------------------------
  // TEST GROUP 1: Production Database Selection & Architecture Verification
  // ----------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Production Database Selection & Source of Truth ---');
  
  const supabaseConfigured = isSupabaseConfigured();
  assert(supabaseConfigured === true, 'Requirement 1: Supabase PostgreSQL is configured and detected');

  const supabase = getSupabaseAdmin();
  assert(Boolean(supabase), 'Requirement 2: Supabase admin client is initialized');

  if (supabase) {
    const { count: supaProjCount, error: projErr } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    assert(supaProjCount === 12, `Requirement 3: Supabase PostgreSQL contains authoritative 12 projects (Found: ${supaProjCount})`, projErr);

    const { count: supaPropCount, error: propErr } = await supabase.from('properties').select('*', { count: 'exact', head: true });
    assert((supaPropCount || 0) >= 800, `Requirement 4: Supabase PostgreSQL contains authoritative inventory (${supaPropCount} properties)`, propErr);
  }

  // ----------------------------------------------------------------------
  // TEST GROUP 2: Fail-Closed Behavior & Error vs Empty Distinction
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Fail-Closed Data Access & Error/Empty Distinction ---');

  const waitResult = await waitForHydration();
  assert(waitResult === true, 'Requirement 5: waitForHydration resolves true on completed state');

  // Test hydration readiness contract
  const hydrated = isHydrated();
  assert(hydrated === true, 'Requirement 6: Hydration readiness check returns true when data is synced');

  // Test that a query for a non-existent slug returns 0 records (empty success), NOT an error
  const nonExistentSlugResult = getProperties({ projectSlug: 'non-existent-project-xyz' });
  assert(nonExistentSlugResult.total === 0 && Array.isArray(nonExistentSlugResult.properties), 'Requirement 7: Genuine empty filter query returns empty array ({ total: 0, properties: [] })');

  // ----------------------------------------------------------------------
  // TEST GROUP 3: Project Catalog & Classified Categories
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Authoritative Project Catalog ---');

  const allProjects = getAllProjects(false);
  assert(allProjects.length === 12, `Requirement 8: Catalog returns exactly 12 published projects (Got ${allProjects.length})`);

  const plotProjects = allProjects.filter(p => p.project_type === 'PLOT');
  const aptProjects = allProjects.filter(p => p.project_type === 'APARTMENT');

  assert(plotProjects.length === 8, `Requirement 9: Exactly 8 PLOT projects classified (Found: ${plotProjects.length})`);
  assert(aptProjects.length === 4, `Requirement 10: Exactly 4 APARTMENT projects classified (Found: ${aptProjects.length})`);

  // Verify specific expected projects
  const expectedPlotSlugs = [
    'nova-diya-gardens',
    'kng-pudur-option-03',
    'nova-ncr',
    'nova-edens',
    'nova-city',
    'nova-hi-tech',
    'nova-knt',
    'nova-aardhiya-nagar'
  ];

  const actualPlotSlugs = plotProjects.map(p => p.slug);
  const allPlotsFound = expectedPlotSlugs.every(s => actualPlotSlugs.includes(s));
  assert(allPlotsFound, `Requirement 11: All 8 expected PLOT projects present (${expectedPlotSlugs.join(', ')})`);

  const expectedAptSlugs = [
    'nova-vasantham',
    'nova-tejas',
    'nova-ramala',
    'nova-vr-squares'
  ];

  const actualAptSlugs = aptProjects.map(p => p.slug);
  const allAptsFound = expectedAptSlugs.every(s => actualAptSlugs.includes(s));
  assert(allAptsFound, `Requirement 12: All 4 expected APARTMENT projects present (${expectedAptSlugs.join(', ')})`);

  // ----------------------------------------------------------------------
  // TEST GROUP 4: Dynamic Statistics & Mathematical Consistency
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Dynamic Statistics & Mathematical Consistency ---');

  const allPublishedProps = getProperties({ includeDrafts: false, limit: 2000 }).properties;
  assert(allPublishedProps.length >= 800, `Requirement 13: All published properties retrieved (${allPublishedProps.length} total)`);

  const totalCalculatedAvailable = allPublishedProps.filter(p => p.status === 'AVAILABLE').length;
  const totalCalculatedBooked = allPublishedProps.filter(p => p.status === 'BOOKED').length;
  const totalCalculatedRegistered = allPublishedProps.filter(p => p.status === 'REGISTERED').length;

  const aggregatedAvailableFromProjects = allProjects.reduce((sum, p) => sum + (p.stats?.available || 0), 0);
  const aggregatedBookedFromProjects = allProjects.reduce((sum, p) => sum + (p.stats?.booked || 0), 0);
  const aggregatedRegisteredFromProjects = allProjects.reduce((sum, p) => sum + (p.stats?.registered || 0), 0);

  assert(
    aggregatedAvailableFromProjects === totalCalculatedAvailable,
    `Requirement 14: Project stats AVAILABLE (${aggregatedAvailableFromProjects}) is mathematically consistent with published inventory (${totalCalculatedAvailable})`
  );
  assert(
    aggregatedBookedFromProjects === totalCalculatedBooked,
    `Requirement 15: Project stats BOOKED (${aggregatedBookedFromProjects}) matches published inventory (${totalCalculatedBooked})`
  );
  assert(
    aggregatedRegisteredFromProjects === totalCalculatedRegistered,
    `Requirement 16: Project stats REGISTERED (${aggregatedRegisteredFromProjects}) matches published inventory (${totalCalculatedRegistered})`
  );
  assert(
    totalCalculatedAvailable >= 300,
    `Requirement 17: Available inventory is substantially populated (Found: ${totalCalculatedAvailable} available properties)`
  );

  // ----------------------------------------------------------------------
  // TEST GROUP 5: Apartment Projects Specific Inventory Integrity
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Apartment Projects Inventory Verification ---');

  // Nova Vasantham
  const vasantham = getProjectBySlug('nova-vasantham', false);
  const vasanthamProps = getProperties({ projectSlug: 'nova-vasantham', includeDrafts: false });
  assert(vasantham !== null && vasantham.project_type === 'APARTMENT', 'Requirement 18: Nova Vasantham is verified APARTMENT project');
  assert(vasanthamProps.total >= 12, `Requirement 19: Nova Vasantham contains full apartment units (Found ${vasanthamProps.total})`);

  // Nova Tejas
  const tejas = getProjectBySlug('nova-tejas', false);
  const tejasProps = getProperties({ projectSlug: 'nova-tejas', includeDrafts: false });
  assert(tejas !== null && tejas.project_type === 'APARTMENT', 'Requirement 20: Nova Tejas is verified APARTMENT project');
  assert(tejasProps.total >= 10, `Requirement 21: Nova Tejas contains verified apartment units (Found ${tejasProps.total})`);

  // Nova Ramala & VR Squares
  const ramala = getProjectBySlug('nova-ramala', false);
  const vrSquares = getProjectBySlug('nova-vr-squares', false);
  assert(ramala !== null && ramala.stats.total_inventory === 6, `Requirement 22: Nova Ramala has 6 units (Found ${ramala?.stats.total_inventory})`);
  assert(vrSquares !== null && vrSquares.stats.total_inventory === 6, `Requirement 23: Nova VR Squares has 6 units (Found ${vrSquares?.stats.total_inventory})`);

  // ----------------------------------------------------------------------
  // TEST GROUP 6: Plot Projects Specific Inventory Integrity
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Plot Projects Inventory Verification ---');

  const diya = getProjectBySlug('nova-diya-gardens', false);
  assert(diya !== null && (diya.stats.available || 0) >= 150, `Requirement 24: Nova Diya Gardens active plot inventory (${diya?.stats.available} available)`);

  const pinnacle = getProjectBySlug('kng-pudur-option-03', false);
  assert(pinnacle !== null && (pinnacle.stats.available || 0) >= 30, `Requirement 25: Nova Pinnacle active plot inventory (${pinnacle?.stats.available} available)`);

  const ncr = getProjectBySlug('nova-ncr', false);
  assert(ncr !== null && (ncr.stats.available || 0) >= 15, `Requirement 26: Nova NCR active plot inventory (${ncr?.stats.available} available)`);

  // ----------------------------------------------------------------------
  // TEST GROUP 7: Restart Persistence Simulation (Render Lifecycle)
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Restart Persistence Simulation (Render Lifecycle) ---');

  const beforeRestartProjCount = getAllProjects(false).length;
  const beforeRestartPropCount = getProperties({ includeDrafts: false, limit: 2000 }).total;

  // Simulate server stop
  closeDb();

  // Simulate server boot & hydration from Supabase
  await initAndSyncFromSupabase();

  const afterRestartProjCount = getAllProjects(false).length;
  const afterRestartPropCount = getProperties({ includeDrafts: false, limit: 2000 }).total;

  assert(
    afterRestartProjCount === beforeRestartProjCount,
    `Requirement 27: Server restart preserves exact project count (${afterRestartProjCount} projects)`
  );
  assert(
    afterRestartPropCount === beforeRestartPropCount,
    `Requirement 28: Server restart preserves exact property count (${afterRestartPropCount} properties)`
  );

  // ----------------------------------------------------------------------
  // TEST GROUP 8: AI Safety & Strictly Read-Only Execution
  // ----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Nova AI Safety & Read-Only Grounding ---');

  const db = getDb();
  const initialProjectsCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const initialPropertiesCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const initialLayoutsCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;
  const initialUsersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;

  // Execute AI query
  const aiResponse = await aiService.askNova([
    { role: 'user', content: 'What 3 BHK apartments are available in Chennai?' }
  ], 'nova-tejas');

  assert(Boolean(aiResponse && aiResponse.text), 'Requirement 29: AI generates grounded response using live database');

  // Verify all database tables remained completely untouched
  const finalProjectsCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const finalPropertiesCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const finalLayoutsCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;
  const finalUsersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;

  assert(finalProjectsCount === initialProjectsCount, 'Requirement 30: AI did not mutate projects table (Zero mutation)');
  assert(finalPropertiesCount === initialPropertiesCount, 'Requirement 31: AI did not mutate properties table (Zero mutation)');
  assert(finalLayoutsCount === initialLayoutsCount, 'Requirement 32: AI did not mutate layouts table (Zero mutation)');
  assert(finalUsersCount === initialUsersCount, 'Requirement 33: AI did not mutate users table (Zero mutation)');

  // Verify available AI tools are strictly read-only
  const toolNames = AI_TOOLS.map(t => t.name);
  const hasWriteTool = toolNames.some(name => /create|insert|update|delete|drop|truncate|seed|restore|mutate|write/i.test(name));
  assert(hasWriteTool === false, 'Requirement 34: No AI tool has write/mutation capability (Strictly read-only tools)');

  console.log('\n================================================================');
  console.log(` PRODUCTION INTEGRITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionDataIntegritySuite().catch(err => {
  console.error('[Production Data Integrity Test FATAL Error]:', err);
  process.exit(1);
});

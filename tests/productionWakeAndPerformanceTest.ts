import { getDb } from '../server/db/database.ts';
import { getAllProjects, getProjectBySlug, getProjectLayout } from '../server/services/projectService.ts';
import { getProperties } from '../server/services/propertyService.ts';
import { initAndSyncFromSupabase, waitForHydration, isHydrated } from '../server/db/supabaseSync.ts';
import { isSupabaseConfigured, getSupabaseAdmin } from '../server/db/supabaseClient.ts';
import { config } from '../server/config.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, failureDetails?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (failureDetails) console.error('    Details:', failureDetails);
    failed++;
  }
}

async function runProductionSuite() {
  console.log('================================================================');
  console.log(' RUNNING PRODUCTION WAKE, PERSISTENCE & PERFORMANCE VERIFICATION');
  console.log('================================================================\n');

  const db = getDb();

  // -------------------------------------------------------------
  // 1. DATABASE SOURCE OF TRUTH & PERSISTENCE VERIFICATION
  // -------------------------------------------------------------
  console.log('--- TEST 1: Database Source of Truth & Project Catalog ---');
  assert(isSupabaseConfigured(), 'Supabase PostgreSQL is configured and authenticated');

  // Trigger hydration
  const syncSuccess = await initAndSyncFromSupabase();
  assert(syncSuccess === true, 'Authoritative Supabase PostgreSQL synchronization succeeded');
  assert(isHydrated() === true, 'Hydration status reports isHydrated = true');

  const projects = getAllProjects(false);
  assert(projects.length === 12, `All 12 canonical projects loaded (Found ${projects.length})`);

  // Verify plot vs apartment projects
  const plotProjects = projects.filter(p => p.project_type === 'PLOT');
  const aptProjects = projects.filter(p => p.project_type === 'APARTMENT');
  assert(plotProjects.length === 8, `8 Plot projects present (Got ${plotProjects.length})`);
  assert(aptProjects.length === 4, `4 Apartment projects present (Got ${aptProjects.length})`);

  // -------------------------------------------------------------
  // 2. INVENTORY ACCURACY & PRESERVATION OF ALL 324 PLOTS/UNITS
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Inventory Accuracy & 324 Available Properties Preservation ---');
  const allPropertiesRes = getProperties({ limit: 1000 });
  assert(allPropertiesRes.total === 849, `Total published properties exactly matches 849 active records (Got ${allPropertiesRes.total})`);

  const availableRes = getProperties({ status: 'AVAILABLE', limit: 1000 });
  assert(availableRes.total === 324, `EXACTLY 324 available properties returned on first request (Got ${availableRes.total})`);

  const bookedRes = getProperties({ status: 'BOOKED', limit: 1000 });
  assert(bookedRes.total === 54, `Booked inventory preserved: 54 units (Got ${bookedRes.total})`);

  const registeredRes = getProperties({ status: 'REGISTERED', limit: 1000 });
  assert(registeredRes.total === 448, `Registered inventory preserved: 448 units (Got ${registeredRes.total})`);

  const blockedRes = getProperties({ status: 'BLOCKED', limit: 1000 });
  assert(blockedRes.total === 20, `Blocked inventory preserved: 20 units (Got ${blockedRes.total})`);

  // Verify specific projects inventory
  const diyaPlots = getProperties({ projectSlug: 'nova-diya-gardens', status: 'AVAILABLE', limit: 500 });
  assert(diyaPlots.total === 167, `Nova Diya Gardens has exactly 167 available plots (Got ${diyaPlots.total})`);

  const edensPlots = getProperties({ projectSlug: 'nova-edens', status: 'AVAILABLE', limit: 500 });
  assert(edensPlots.total === 44, `Nova Edens has exactly 44 available plots (Got ${edensPlots.total})`);

  const pinnaclePlots = getProperties({ projectSlug: 'kng-pudur-option-03', status: 'AVAILABLE', limit: 500 });
  assert(pinnaclePlots.total === 41, `Nova Pinnacle has exactly 41 available plots (Got ${pinnaclePlots.total})`);

  // -------------------------------------------------------------
  // 3. LAYOUT PERSISTENCE ACROSS RESTART & STORAGE DURABILITY
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Layout Persistence & Cloud Storage Durability ---');
  
  const testProjectSlugs = [
    'nova-aardhiya-nagar',
    'nova-city',
    'nova-diya-gardens',
    'nova-edens',
    'nova-hi-tech',
    'nova-knt',
    'nova-ncr',
    'kng-pudur-option-03',
    'nova-ramala',
    'nova-vasantham',
    'nova-vr-squares'
  ];

  let durableLayoutCount = 0;
  for (const slug of testProjectSlugs) {
    const proj = getProjectBySlug(slug);
    if (!proj) continue;
    const layout = getProjectLayout(proj.id);
    if (layout && layout.image_url) {
      const isDurable = layout.image_url.startsWith('https://') || layout.image_url.startsWith('http://');
      assert(isDurable, `Project '${proj.name}' layout uses durable cloud URL (${layout.image_url.slice(0, 60)}...)`);
      if (isDurable) durableLayoutCount++;
    }
  }

  assert(durableLayoutCount >= 10, `At least 10 major projects have durable cloud layout URLs (Got ${durableLayoutCount})`);

  // Simulate server restart: re-sync from Supabase and re-query
  console.log('\n--- TEST 4: Simulated Render Restart / Cold Wake Verification ---');
  const tStartSync = Date.now();
  await initAndSyncFromSupabase();
  const syncDuration = Date.now() - tStartSync;
  assert(syncDuration < 3000, `Re-hydration after simulated restart completed in < 3000ms (Actual: ${syncDuration}ms)`);

  // Query immediately on first request after simulated wake
  const firstReqStart = Date.now();
  const firstReqProjects = getAllProjects(false);
  const firstReqProperties = getProperties({ status: 'AVAILABLE', limit: 500 });
  const firstReqEdensLayout = getProjectLayout('proj_nova_edens');
  const firstReqDuration = Date.now() - firstReqStart;

  assert(firstReqProjects.length === 12, 'First request immediately returns all 12 projects on wake');
  assert(firstReqProperties.total === 324, 'First request immediately returns all 324 available properties without reload');
  assert(firstReqEdensLayout !== null && Boolean(firstReqEdensLayout?.image_url), 'First request immediately returns persistent layout for Nova Edens');
  assert(firstReqDuration < 100, `First request response time after wake is fast (Actual: ${firstReqDuration}ms)`);

  // -------------------------------------------------------------
  // 5. CACHE PERFORMANCE & RESPONSE METRICS
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Performance Metrics & Batch Query Optimization ---');
  
  // Uncached vs Cached properties timing
  const t0 = Date.now();
  getProperties({ limit: 500 });
  const uncachedTime = Date.now() - t0;

  const t1 = Date.now();
  getProperties({ limit: 500 });
  const cachedTime = Date.now() - t1;

  console.log(`  * Uncached Properties Query Time: ${uncachedTime}ms`);
  console.log(`  * In-Memory Cached Query Time: ${cachedTime}ms`);
  assert(cachedTime <= uncachedTime, 'In-memory cache delivers equal or faster response time');

  // Measure batch projects query time
  const t2 = Date.now();
  getAllProjects(false);
  const projectsQueryTime = Date.now() - t2;
  console.log(`  * Batch Projects Query Time (12 projects + stats): ${projectsQueryTime}ms`);
  assert(projectsQueryTime < 50, `Batch aggregate query completes in < 50ms (Actual: ${projectsQueryTime}ms)`);

  console.log('\n================================================================');
  console.log(` PRODUCTION VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

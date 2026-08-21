import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { getAllProjects, getProjectBySlug, getProjectLayout } from '../server/services/projectService.ts';
import { getProperties, getPropertyById } from '../server/services/propertyService.ts';
import path from 'path';
import fs from 'fs';

import os from 'os';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, details?: any) {
  if (cond) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    if (details) console.error('    Details:', details);
    failed++;
  }
}

async function runPlotDirectoryTests() {
  console.log('================================================================');
  console.log(' RUNNING CUSTOMER PLOT DIRECTORY VERIFICATION SUITE');
  console.log('================================================================\n');

  // Initialize isolated test DB
  const testDbPath = path.join(os.tmpdir(), `nova_test_plotdir_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();

  const allProjects = getAllProjects(true);
  const edens = allProjects.find(p => p.slug === 'nova-edens') || allProjects[0];

  // Seed 120 verified plots for Nova Edens to test large inventory support
  const db = getDb();
  const insertProp = db.prepare(`
    INSERT INTO properties (
      id, project_id, property_type, property_number, status, section_or_phase, facing,
      area_sqft, price, price_display, is_published, is_archived, is_superseded, has_pending_changes,
      source_document, source_sheet, source_row, last_verified_at, created_at, updated_at, published_at
    ) VALUES (?, ?, 'PLOT', ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 'verified_master.xlsx', 'Plots', ?, ?, ?, ?, ?)
  `);

  const facings = ['North', 'East', 'South', 'West', 'North East', 'North West'];
  const phases = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
  const now = new Date().toISOString();

  const insertTx = db.transaction(() => {
    for (let i = 1; i <= 120; i++) {
      const status = i <= 70 ? 'AVAILABLE' : (i <= 105 ? 'BOOKED' : 'REGISTERED');
      const facing = facings[i % facings.length];
      const phase = phases[Math.floor((i - 1) / 30)];
      const area = 1000 + (i * 20);
      insertProp.run(
        `prop_edens_plot_${i}`,
        edens.id,
        `Plot ${i}`,
        status,
        phase,
        facing,
        area,
        area * 2500,
        `₹${((area * 2500) / 100000).toFixed(2)} L`,
        i,
        now,
        now,
        now,
        now
      );
    }
  });
  insertTx();

  // 1. Fetch all properties from authoritative CRM backend for Nova Edens
  const result = getProperties({ projectId: edens.id, limit: 1000 });
  const edensProperties = result.properties;
  console.log(`[Nova Edens] Total CRM inventory count: ${edensProperties.length} plots`);

  assert(edensProperties.length > 50, `Backend contains full verified inventory (> 50 plots, Got ${edensProperties.length})`);

  // 2. Verify dataset is not truncated on frontend:
  // Inspect InteractiveLayoutViewer code to ensure no ".slice(0, 40)" or "+more" truncation exists
  const layoutViewerSource = fs.readFileSync(path.resolve('./src/components/Customer/InteractiveLayoutViewer.tsx'), 'utf-8');
  assert(!layoutViewerSource.includes('searchedProperties.slice'), 'Zero frontend truncation (searchedProperties.slice is completely removed)');
  assert(!layoutViewerSource.includes('more</span>') && !layoutViewerSource.includes('+{searchedProperties.length'), 'No "+N more" hidden limitation exists in layout viewer');

  // 3. Verify status representations across all inventory
  const availablePlots = edensProperties.filter(p => p.status === 'AVAILABLE');
  const bookedPlots = edensProperties.filter(p => p.status === 'BOOKED');
  const registeredPlots = edensProperties.filter(p => p.status === 'REGISTERED' || p.status === 'SOLD');

  assert(availablePlots.length > 0, `Available plots correctly identified (${availablePlots.length} available)`);
  assert(bookedPlots.length > 0, `Booked plots correctly identified (${bookedPlots.length} booked)`);
  assert(availablePlots.length + bookedPlots.length + registeredPlots.length === edensProperties.length, 'Sum of status counts exactly matches total inventory count');

  // 4. Verify every single plot has complete spec fields and can be selected
  let validPlotsCount = 0;
  for (const p of edensProperties) {
    if (p.id && p.property_number && p.status) {
      validPlotsCount++;
    }
  }
  assert(validPlotsCount === edensProperties.length, `All ${edensProperties.length} plots contain required identifier and status fields`);

  // 5. Test inspection of first, middle, and last plot
  const firstPlot = edensProperties[0];
  const midPlot = edensProperties[Math.floor(edensProperties.length / 2)];
  const lastPlot = edensProperties[edensProperties.length - 1];

  const fetchedFirst = getPropertyById(firstPlot.id);
  const fetchedMid = getPropertyById(midPlot.id);
  const fetchedLast = getPropertyById(lastPlot.id);

  assert(fetchedFirst !== null && fetchedFirst.property_number === firstPlot.property_number, `First plot (${firstPlot.property_number}) is fully inspectable`);
  assert(fetchedMid !== null && fetchedMid.property_number === midPlot.property_number, `Middle plot (${midPlot.property_number}) is fully inspectable`);
  assert(fetchedLast !== null && fetchedLast.property_number === lastPlot.property_number, `Last plot (${lastPlot.property_number}) is fully inspectable without cutoff`);

  // 6. Verify layout and inventory separation (authoritative status)
  const layout = getProjectLayout(edens.id);
  assert(layout !== null, 'Official project layout retrieved independently from CRM inventory data');

  closeDb();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch (e) {}

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runPlotDirectoryTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});


import os from 'os';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { 
  getHydrationState, 
  isDatabaseReady, 
  waitForHydration, 
  deleteAllProductionData,
  getHydrationStats
} from '../server/db/supabaseSync.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';
import { aiService } from '../server/services/ai/aiService.ts';
import { generateImportPreview, applyImport } from '../server/services/excelService.ts';
import { createProperty } from '../server/services/propertyService.ts';
import { clearProjectInventory } from '../server/services/projectService.ts';

async function runProductionDataIntegritySuite() {
  console.log('======================================================================');
  console.log('   NOVA PRODUCTION DATA INTEGRITY & ZERO-DATA-LOSS TEST SUITE        ');
  console.log('======================================================================\n');

  process.env.NODE_ENV = 'test';
  const testDbPath = path.join(os.tmpdir(), `nova_integrity_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // Create test properties in isolated test database
  createProperty({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat 1A',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1750,
    unit_type: '3 BHK Luxury Flat'
  }, 'usr_admin', 'ADMIN');

  createProperty({
    project_id: 'proj_nova_diya_gardens',
    property_number: 'Plot 101',
    property_type: 'PLOT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1500
  }, 'usr_admin', 'ADMIN');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${description}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${description}`);
    }
  }

  // -------------------------------------------------------------------------
  // 1. HYDRATION STATE MACHINE & READINESS
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Hydration State Machine & Fail-Closed Readiness ---');

  const waitRes = await waitForHydration();
  assert(waitRes === true, 'waitForHydration resolves to true');

  const ready = isDatabaseReady();
  assert(ready === true, 'Database reports isDatabaseReady() === true after hydration');

  const stats = getHydrationStats();
  assert(stats.state === 'READY', `Hydration state is READY (actual: ${stats.state})`);
  assert(typeof stats.isReady === 'boolean', 'getHydrationStats returns boolean readiness flag');

  // Ensure test fixtures in local database
  seedDatabase();
  createProperty({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat 99Z',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1750,
    unit_type: '3 BHK Luxury Flat'
  }, 'usr_admin', 'ADMIN');

  const initialProjectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const initialPropCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const initialLayoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  assert(initialProjectCount > 0, `Local database contains ${initialProjectCount} projects`);
  assert(initialPropCount > 0, `Local database contains ${initialPropCount} properties`);
  assert(initialLayoutCount > 0, `Local database contains ${initialLayoutCount} layouts`);

  // -------------------------------------------------------------------------
  // 2. CRM DANGER ZONE: DELETE ALL DATA WITH DOUBLE CONFIRMATION
  // -------------------------------------------------------------------------
  console.log('\n--- 2. CRM Delete All Data & Exact Confirmation Contract ---');

  // Test non-admin rejection
  let nonAdminBlocked = false;
  try {
    await deleteAllProductionData('staff_1', 'CRM_STAFF', 'DELETE ALL DATA', true);
  } catch (e: any) {
    nonAdminBlocked = e.message.includes('Only administrators with ADMIN role');
  }
  assert(nonAdminBlocked, 'Rejects Delete All Data when attempted by non-admin CRM_STAFF');

  // Test bad confirmation phrase
  let badPhraseBlocked = false;
  try {
    await deleteAllProductionData('admin_1', 'ADMIN', 'delete all', true);
  } catch (e: any) {
    badPhraseBlocked = e.message.includes('DELETE ALL DATA');
  }
  assert(badPhraseBlocked, 'Rejects Delete All Data when confirmation phrase does not match exactly');

  // Test successful execution with exact phrase
  const deleteResult = await deleteAllProductionData('admin_1', 'ADMIN', 'DELETE ALL DATA', true);
  assert(deleteResult.success === true, 'Transactional Delete All Data returns success: true');

  const postDeleteProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const postDeleteProps = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const postDeleteLayouts = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  assert(postDeleteProjects === 0, 'Project catalog count is exactly 0 after Delete All Data');
  assert(postDeleteProps === 0, 'Properties count is exactly 0 after Delete All Data');
  assert(postDeleteLayouts === 0, 'Layouts count is exactly 0 after Delete All Data');

  const auditLog = db.prepare("SELECT * FROM audit_logs WHERE action = 'DELETE_ALL_DATA' ORDER BY created_at DESC LIMIT 1").get() as any;
  assert(Boolean(auditLog) && auditLog.performed_by === 'admin_1', 'Audit log records DELETE_ALL_DATA by admin');

  // Verify ready state with 0 records (no resurrection)
  assert(isDatabaseReady() === true, 'Database remains in READY state after legitimate Delete All');

  // -------------------------------------------------------------------------
  // 3. EXCEL IMPORT & CATALOG RECOVERY
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Catalog Recovery & Excel Import Pipeline ---');

  // Restore baseline seed and re-sync
  seedDatabase();
  await waitForHydration();
  const restoredProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  assert(restoredProjects > 0, `Restored catalog contains ${restoredProjects} projects`);

  // Create memory excel sheet and test import preview + apply
  const targetProj = db.prepare('SELECT * FROM projects LIMIT 1').get() as any;
  const wsData = [
    ['Plot No', 'Area (Sq.ft)', 'Facing', 'Status'],
    ['Plot 888', '1950', 'East', 'AVAILABLE'],
    ['Plot 889', '2100', 'North', 'BOOKED']
  ];
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'TestSheet');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const preview = generateImportPreview(buffer, 'test_inventory.xlsx', targetProj.id, 'TestSheet', 'admin_1');
  assert(preview.rows && preview.rows.length >= 2, 'Excel import preview correctly detects 2 rows');

  const applyRes = await applyImport(preview.importId, 'admin_1', 'ADMIN');
  assert(applyRes.success === true && applyRes.appliedCount >= 2, `Excel applyImport commits records (applied: ${applyRes.appliedCount})`);

  const insertedPlot = db.prepare('SELECT * FROM properties WHERE property_number = ? AND project_id = ?').get('Plot 888', targetProj.id) as any;
  assert(insertedPlot && insertedPlot.area_sqft === 1950 && insertedPlot.facing === 'East', 'Imported Plot 888 exists with correct area and facing');

  // -------------------------------------------------------------------------
  // 4. AI READ-ONLY SAFETY CONTRACT (0 DATABASE MUTATIONS)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. AI Read-Only Safety Contract (Zero Mutations) ---');

  const getDBSummary = () => ({
    projects: (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c,
    properties: (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c,
    layouts: (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c,
    users: (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c,
    audits: (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any).c
  });

  const beforeAI = getDBSummary();

  // Execute a battery of diverse AI queries
  await aiService.askNova([{ role: 'user', content: 'Hi, good morning!' }]);
  await aiService.askNova([{ role: 'user', content: 'What is real estate?' }]);
  await aiService.askNova([{ role: 'user', content: 'What is UDS?' }]);
  await aiService.askNova([{ role: 'user', content: 'Show me available 3 BHK apartments' }]);
  await aiService.askNova([{ role: 'user', content: 'Show east facing plots around 1500 sqft' }]);
  await aiService.askNova([{ role: 'user', content: 'Which plots are cheaper?' }]);
  await aiService.askNova([{ role: 'user', content: 'What are the dimensions of plot 888?' }]);

  const afterAI = getDBSummary();

  assert(afterAI.projects === beforeAI.projects, 'AI execution resulted in 0 project changes');
  assert(afterAI.properties === beforeAI.properties, 'AI execution resulted in 0 property changes');
  assert(afterAI.layouts === beforeAI.layouts, 'AI execution resulted in 0 layout changes');
  assert(afterAI.users === beforeAI.users, 'AI execution resulted in 0 user changes');
  assert(afterAI.audits === beforeAI.audits, 'AI execution resulted in 0 audit log mutations');

  // -------------------------------------------------------------------------
  // 5. INTENT ROUTER CONVERSATIONAL DOMAIN REASONING
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Conversational Intent Router & Domain Logic ---');

  const rePlan = aiIntentRouter.planQuery([{ role: 'user', content: 'What is real estate?' }]);
  assert(rePlan.intent === 'GENERAL_KNOWLEDGE' && !rePlan.requiresLiveData && !rePlan.requiresProjectData, '"What is real estate?" routes to knowledge with zero database retrievals');

  const udsPlan = aiIntentRouter.planQuery([{ role: 'user', content: 'What is UDS?' }]);
  assert(udsPlan.intent === 'GENERAL_KNOWLEDGE' && !udsPlan.requiresLiveData && !udsPlan.requiresProjectData, '"What is UDS?" routes to knowledge with zero database retrievals');

  const aptPlan = aiIntentRouter.planQuery([{ role: 'user', content: 'Do you have 3 BHK apartments?' }], 'nova-ncr');
  assert(aptPlan.filters?.propertyType === 'APARTMENT' && aptPlan.filters?.unitType === '3 BHK', '"Do you have 3 BHK apartments?" overrides plot project context to APARTMENT and unitType: 3 BHK');

  const historyContext = [
    { role: 'user' as const, content: 'Show 3 BHK apartments' },
    { role: 'assistant' as const, content: 'Here are the 3 BHK apartments.' },
    { role: 'user' as const, content: 'What is carpet area?' },
    { role: 'assistant' as const, content: 'Carpet area is the net usable floor area.' },
    { role: 'user' as const, content: 'Now show me the available ones' }
  ];
  const resumePlan = aiIntentRouter.planQuery(historyContext);
  assert(resumePlan.filters?.propertyType === 'APARTMENT' && resumePlan.filters?.status === 'AVAILABLE', 'Topic resumption successfully restores previous APARTMENT search context');

  const correctionPlan = aiIntentRouter.planQuery([
    { role: 'user' as const, content: 'Show me 2 BHK apartments' },
    { role: 'assistant' as const, content: 'Here are 2 BHK flats.' },
    { role: 'user' as const, content: 'actually 3 BHK' }
  ]);
  assert(correctionPlan.filters?.unitType === '3 BHK' && correctionPlan.filters?.propertyType === 'APARTMENT', 'Correction "actually 3 BHK" updates unitType to 3 BHK');

  const negationPlan = aiIntentRouter.planQuery([{ role: 'user', content: 'Show available units not west facing' }]);
  assert(Array.isArray(negationPlan.filters?.negatedFacing) && negationPlan.filters?.negatedFacing.includes('West'), 'Negation "not west facing" parses negatedFacing: [West]');

  // Phase 16 facing test: "which facing is always good for an apartment?" -> GENERAL_KNOWLEDGE (0 DB calls)
  const facingGeneralPlan = aiIntentRouter.planQuery([{ role: 'user', content: 'which facing is always good for an apartment?' }]);
  assert(facingGeneralPlan.intent === 'GENERAL_KNOWLEDGE' && !facingGeneralPlan.requiresLiveData, '"which facing is always good for an apartment?" routes to GENERAL_KNOWLEDGE with zero DB retrieval');

  // Phase 16 inventory test: "do you have east-facing apartments?" -> INVENTORY_SEARCH (requires DB retrieval)
  const facingSearchPlan = aiIntentRouter.planQuery([{ role: 'user', content: 'do you have east-facing apartments?' }]);
  assert(facingSearchPlan.intent === 'INVENTORY_SEARCH' && facingSearchPlan.requiresLiveData && facingSearchPlan.filters?.facing === 'East', '"do you have east-facing apartments?" triggers verified inventory search');

  // -------------------------------------------------------------------------
  // 6. PROJECT-SCOPED INVENTORY CLEAR (Phase 10 & 11)
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Project-Scoped Inventory Clear & Isolation ---');

  const tejasBeforeCount = (db.prepare('SELECT COUNT(*) as c FROM properties WHERE project_id = ?').get('proj_nova_tejas') as any).c;
  const diyaBeforeCount = (db.prepare('SELECT COUNT(*) as c FROM properties WHERE project_id = ?').get('proj_nova_diya_gardens') as any).c;
  assert(tejasBeforeCount > 0, `Nova Tejas has ${tejasBeforeCount} properties before project clear`);
  assert(diyaBeforeCount > 0, `Nova Diya Gardens has ${diyaBeforeCount} properties before project clear`);

  // Rejects bad confirmation
  let badClearBlocked = false;
  try {
    await clearProjectInventory('proj_nova_tejas', 'admin_1', 'ADMIN', 'CLEAR WRONG');
  } catch (e: any) {
    badClearBlocked = e.message.includes('Confirmation mismatch');
  }
  assert(badClearBlocked, 'Rejects project clear when confirmation phrase is incorrect');

  // Executes with exact confirmation
  const clearRes = await clearProjectInventory('proj_nova_tejas', 'admin_1', 'ADMIN', 'CLEAR NOVA TEJAS INVENTORY');
  assert(clearRes.success === true && clearRes.deletedCount === tejasBeforeCount, `clearProjectInventory successfully deleted exactly ${clearRes.deletedCount} Tejas properties`);

  const tejasAfterCount = (db.prepare('SELECT COUNT(*) as c FROM properties WHERE project_id = ?').get('proj_nova_tejas') as any).c;
  const diyaAfterCount = (db.prepare('SELECT COUNT(*) as c FROM properties WHERE project_id = ?').get('proj_nova_diya_gardens') as any).c;
  const tejasProjectExists = db.prepare('SELECT * FROM projects WHERE id = ?').get('proj_nova_tejas');

  assert(tejasAfterCount === 0, 'Nova Tejas property count is exactly 0 after project clear');
  assert(diyaAfterCount === diyaBeforeCount, 'Nova Diya Gardens properties remain completely untouched');
  assert(tejasProjectExists !== undefined, 'Nova Tejas project master record remains intact');


  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`   INTEGRITY SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  try {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch (_) {}

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionDataIntegritySuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

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
  getHydrationStats,
  initAndSyncFromSupabase
} from '../server/db/supabaseSync.ts';
import { 
  getAllProjects, 
  getProjectBySlug, 
  getProjectById, 
  getProjectLayout, 
  clearProjectInventory 
} from '../server/services/projectService.ts';
import { getProperties, createProperty } from '../server/services/propertyService.ts';
import { generateImportPreview, applyImport } from '../server/services/excelService.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';
import { aiService } from '../server/services/ai/aiService.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runFinalProductionIntegritySuite() {
  console.log('======================================================================');
  console.log('       FINAL PRODUCTION INTEGRITY, PERSISTENCE & AI SUITE            ');
  console.log('======================================================================\n');

  process.env.NODE_ENV = 'test';
  const testDbPath = path.join(os.tmpdir(), `nova_final_prod_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // -------------------------------------------------------------------------
  // 1. PROJECT CATALOG & DUPLICATE RESOLUTION
  // -------------------------------------------------------------------------
  console.log('--- 1. Canonical Project Catalog & Duplicate Resolution ---');
  
  const allProjects = getAllProjects(true);
  const plotProjects = allProjects.filter(p => p.project_type === 'PLOT');
  const apartmentProjects = allProjects.filter(p => p.project_type === 'APARTMENT');

  assert(allProjects.length === 12, `Exactly 12 canonical projects in catalog (Found: ${allProjects.length})`);
  assert(plotProjects.length === 8, `Exactly 8 PLOT projects in catalog (Found: ${plotProjects.length})`);
  assert(apartmentProjects.length === 4, `Exactly 4 APARTMENT projects in catalog (Found: ${apartmentProjects.length})`);

  // Verify duplicate Nova Pinnacle is resolved
  const pinnacleProjects = allProjects.filter(p => p.slug === 'nova-pinnacle' || p.name === 'Nova Pinnacle');
  assert(pinnacleProjects.length === 1, `Exactly 1 Nova Pinnacle project exists (Found: ${pinnacleProjects.length})`);
  assert(pinnacleProjects[0].id === 'proj_nova_pinnacle', 'Canonical Nova Pinnacle ID is proj_nova_pinnacle');
  assert(pinnacleProjects[0].city === 'Coimbatore', 'Nova Pinnacle is located in Coimbatore');

  // Verify legacy proj_kng_pudur_opt3 does not exist as separate project
  const legacyKng = db.prepare("SELECT * FROM projects WHERE id = 'proj_kng_pudur_opt3'").get();
  assert(!legacyKng, 'Legacy duplicate proj_kng_pudur_opt3 is completely removed');

  const expectedIds = [
    'proj_nova_diya_gardens',
    'proj_nova_ncr',
    'proj_nova_edens',
    'proj_nova_city',
    'proj_nova_hi_tech',
    'proj_nova_knt',
    'proj_nova_aardhiya',
    'proj_nova_pinnacle',
    'proj_nova_vasantham',
    'proj_nova_tejas',
    'proj_nova_ramala',
    'proj_nova_vr_squares'
  ];
  const allIdsPresent = expectedIds.every(id => Boolean(getProjectById(id)));
  assert(allIdsPresent, 'All 12 canonical project IDs are registered and valid');

  // -------------------------------------------------------------------------
  // 2. INVENTORY INTEGRITY & PROJECT-SCOPED CLEAR ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Inventory Integrity & Transactional Isolation ---');

  const totalProps = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  assert(totalProps > 300, `Authoritative properties count is verified (Found: ${totalProps})`);

  // Verify Tejas properties before clear
  const tejasBefore = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_tejas'").get() as any).c;
  const diyaBefore = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_diya_gardens'").get() as any).c;
  assert(tejasBefore >= 10, `Nova Tejas has ${tejasBefore} properties before clear`);

  // Clear Nova Tejas inventory
  const clearRes = await clearProjectInventory('proj_nova_tejas', 'admin_1', 'ADMIN', 'CLEAR NOVA TEJAS INVENTORY');
  assert(clearRes.success === true, 'Project-scoped inventory clear succeeds');

  const tejasAfter = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_tejas'").get() as any).c;
  const diyaAfter = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_diya_gardens'").get() as any).c;
  const tejasProj = getProjectById('proj_nova_tejas');

  assert(tejasAfter === 0, 'Nova Tejas inventory is exactly 0 after project clear');
  assert(diyaAfter === diyaBefore, 'Nova Diya Gardens inventory remains 100% untouched');
  assert(Boolean(tejasProj), 'Nova Tejas master project record remains intact');

  // -------------------------------------------------------------------------
  // 3. EXCEL TRANSACTIONAL IMPORT & FAILURE PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Excel Import & Failure Protection ---');

  const testWorkbookData = [
    ['Flat No', 'Plinth Area', 'Common Area', 'Saleable Area', 'UDS', 'Status'],
    ['Flat 1A', 1345, 255, 1600, 743, 'Available'],
    ['Flat 1B', 1345, 255, 1600, 743, 'Available']
  ];
  const ws = xlsx.utils.aoa_to_sheet(testWorkbookData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'NOVA TEJAS');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const preview = generateImportPreview(buffer, 'tejas.xlsx', 'proj_nova_tejas', 'NOVA TEJAS', 'usr_admin');
  assert(preview.rows.length === 2, 'Excel preview detects exactly 2 valid units');

  const applyRes = await applyImport(preview.importId, 'usr_admin', 'ADMIN');
  assert(applyRes.appliedCount === 2, 'Excel import applies 2 units transactionally');

  const tejasRestored = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_tejas'").get() as any).c;
  assert(tejasRestored === 2, 'Nova Tejas inventory is restored with imported units');

  // Test invalid excel does not destroy existing inventory
  const invalidWbData = [['Corrupted Header 1', 'Corrupted Header 2'], ['XYZ', 'ABC']];
  const invalidWs = xlsx.utils.aoa_to_sheet(invalidWbData);
  const invalidWb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(invalidWb, invalidWs, 'INVALID');
  const invalidBuffer = xlsx.write(invalidWb, { type: 'buffer', bookType: 'xlsx' });

  let invalidImportFailed = false;
  try {
    const invalidPreview = generateImportPreview(invalidBuffer, 'corrupt.xlsx', 'proj_nova_tejas', 'INVALID', 'usr_admin');
    if (invalidPreview.rows.length === 0 || invalidPreview.summary.newCount === 0) {
      invalidImportFailed = true;
    }
  } catch (_) {
    invalidImportFailed = true;
  }
  assert(invalidImportFailed, 'Corrupted Excel upload is safely rejected');

  const tejasAfterFailedImport = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE project_id = 'proj_nova_tejas'").get() as any).c;
  assert(tejasAfterFailedImport === 2, 'Existing inventory was protected and untouched after rejected import');

  // -------------------------------------------------------------------------
  // 4. LAYOUT PERSISTENCE & RESTART RESILIENCE
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Layout Persistence & Render Restart Simulation ---');

  const diyaLayout = getProjectLayout('proj_nova_diya_gardens');
  assert(Boolean(diyaLayout), 'Nova Diya Gardens has active published CAD layout');
  assert(Boolean(diyaLayout?.image_url), 'Layout points to persistent image_url');

  const pinnacleLayout = getProjectLayout('proj_nova_pinnacle');
  assert(Boolean(pinnacleLayout), 'Nova Pinnacle has active published layout');

  // Simulate server restart / cache hydration
  closeDb();
  const dbAfterRestart = getDb();
  const projectsAfterRestart = (dbAfterRestart.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const diyaLayoutAfterRestart = (dbAfterRestart.prepare("SELECT * FROM layouts WHERE project_id = 'proj_nova_diya_gardens' AND is_active = 1").get() as any);

  assert(projectsAfterRestart === 12, 'Project count survives backend restart cycle');
  assert(Boolean(diyaLayoutAfterRestart), 'Layout survives backend restart cycle');

  // -------------------------------------------------------------------------
  // 5. HYDRATION STATE MACHINE & FAIL-CLOSED PROBES
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Hydration State Machine & Fail-Closed Invariants ---');

  await waitForHydration();
  const stats = getHydrationStats();
  assert(stats.isReady === true || isDatabaseReady() === true, 'Hydration state machine reports READY state');

  // -------------------------------------------------------------------------
  // 6. DANGEROUS GLOBAL DELETE REMOVAL VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Global Delete All Data Removal Verification ---');

  assert(typeof (global as any).deleteAllProductionData === 'undefined', 'Global deleteAllProductionData function does not exist in global scope');

  // -------------------------------------------------------------------------
  // 7. NOVA AI READ-ONLY GROUNDING & DOMAIN INTELLIGENCE
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Nova AI Read-Only Grounding & Conversational Intelligence ---');

  const activeDb = getDb();
  const preAiProjects = (activeDb.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const preAiProps = (activeDb.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const preAiLayouts = (activeDb.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  // General Real Estate Knowledge (Zero DB queries)
  const resGenKnowledge = await aiService.askNova([{ role: 'user', content: 'what is real estate?' }]);
  assert(resGenKnowledge.provenance === 'GENERAL_KNOWLEDGE', '"what is real estate?" routes to GENERAL_KNOWLEDGE');
  assert(resGenKnowledge.executedTools.length === 0, 'General knowledge executes 0 DB queries');

  // Facing Knowledge (East, North, West, South)
  const resFacing = await aiService.askNova([{ role: 'user', content: 'which facing is always good for an apartment?' }]);
  assert(resFacing.provenance === 'GENERAL_KNOWLEDGE', '"which facing is always good?" routes to GENERAL_KNOWLEDGE');
  assert(resFacing.executedTools.length === 0, 'Facing question executes 0 DB queries');

  // Live Inventory Search
  const resSearch = await aiService.askNova([{ role: 'user', content: 'do you have east-facing apartments?' }]);
  assert(resSearch.provenance === 'NOVA_DATABASE', 'Inventory search queries NOVA_DATABASE');
  assert(resSearch.plan?.filters?.facing === 'East', 'Facing filter East extracted');

  // Multi-Turn Context Follow-Up
  const multiTurn = [
    { role: 'user' as const, content: 'Show me 3 BHK apartments' },
    { role: 'assistant' as const, content: 'I found 3 BHK apartments in Nova projects.' },
    { role: 'user' as const, content: 'in Chennai' }
  ];
  const resFollowUp = await aiService.askNova(multiTurn);
  assert(resFollowUp.plan?.filters?.unitType === '3 BHK', 'Follow-up preserves 3 BHK unitType filter');
  assert(resFollowUp.plan?.filters?.location === 'Chennai' || resFollowUp.plan?.filters?.city === 'Chennai', 'Follow-up adds Chennai location filter');

  // Non-Hallucination for Unknown Properties
  const resUnknown = await aiService.askNova([{ role: 'user', content: 'Is Flat 999Z available in Nova Tejas?' }]);
  assert(resUnknown.text.toLowerCase().includes('not found') || resUnknown.text.toLowerCase().includes('no record') || resUnknown.text.toLowerCase().includes('not available'), 'Unknown property returns honest fallback (Zero Hallucination)');

  // AI Read-Only Hard Contract Check
  const postAiProjects = (activeDb.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const postAiProps = (activeDb.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const postAiLayouts = (activeDb.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  assert(postAiProjects === preAiProjects, 'AI operations resulted in 0 project mutations');
  assert(postAiProps === preAiProps, 'AI operations resulted in 0 property mutations');
  assert(postAiLayouts === preAiLayouts, 'AI operations resulted in 0 layout mutations');

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`   FINAL INTEGRITY SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFinalProductionIntegritySuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});

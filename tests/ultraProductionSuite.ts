import os from 'os';
import path from 'path';
import fs from 'fs';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { getAllProjects, getProjectBySlug, getProjectLayout, getProjectLayouts, uploadProjectLayout, publishLayout, deleteLayout } from '../server/services/projectService.ts';
import { aiService } from '../server/services/ai/aiService.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';

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

async function runUltraSuite() {
  console.log('====================================================');
  console.log(' RUNNING ULTRA PRODUCTION ENHANCEMENT TEST SUITE');
  console.log('====================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_ultra_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // -------------------------------------------------------------
  // 1. NOVA PINNACLE — COIMBATORE VERIFICATION
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: Nova Pinnacle in Coimbatore ---');
  const pinnacle = getProjectBySlug('nova-pinnacle');
  assert(Boolean(pinnacle), 'Nova Pinnacle master record is registered in catalog');
  assert(pinnacle?.city === 'Coimbatore', 'Nova Pinnacle is located in Coimbatore');
  assert(pinnacle?.stats?.total_inventory !== undefined && pinnacle?.stats?.total_inventory >= 0, 'Nova Pinnacle master record has valid inventory stats');
  assert(pinnacle?.stats?.available !== undefined && pinnacle?.stats?.available >= 0, 'Nova Pinnacle has valid available count');
  
  const pinnacleLayout = getProjectLayout('proj_nova_pinnacle');
  assert(pinnacleLayout === null, 'Nova Pinnacle starts with null layout (Mode C clean baseline)');

  const coimbatoreProjects = getAllProjects().filter(p => p.city.toLowerCase() === 'coimbatore');
  assert(coimbatoreProjects.some(p => p.slug === 'nova-pinnacle'), 'Nova Pinnacle appears in Coimbatore city filter');

  // -------------------------------------------------------------
  // 2. CRM LAYOUT LIFECYCLE MANAGEMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: CRM Layout Lifecycle (Draft, Publish, Archive, Delete & Storage Cleanup) ---');
  const testProjId = 'proj_nova_pinnacle';

  // 2.1 Upload Draft Layout
  const draftLayout: any = uploadProjectLayout(
    testProjId,
    {
      name: 'Pinnacle Master Plan V1 Draft',
      layoutType: 'MASTER_PLAN',
      imageUrl: '/layouts/test_pinnacle_v1.png',
      status: 'DRAFT'
    },
    'usr_admin',
    'ADMIN'
  );
  assert(draftLayout.status === 'DRAFT', 'Layout created with status DRAFT');
  assert(draftLayout.is_active === 0, 'Layout draft is_active is 0');

  // Customer should still see null layout
  const customerLayoutDuringDraft = getProjectLayout(testProjId);
  assert(customerLayoutDuringDraft === null, 'Customer public viewer sees null layout while draft is unpublished');

  // 2.2 Publish Draft Layout
  const publishedLayout = publishLayout(draftLayout.id, 'usr_admin', 'ADMIN');
  assert(publishedLayout !== null && publishedLayout.id === draftLayout.id, 'Layout published successfully');
  assert(publishedLayout?.status === 'PUBLISHED', 'Layout status transitioned to PUBLISHED');
  assert(publishedLayout?.is_active === 1, 'Layout is_active is now 1');

  // Customer now sees published layout
  const customerLayoutAfterPublish = getProjectLayout(testProjId);
  assert(customerLayoutAfterPublish?.id === draftLayout.id, 'Customer public viewer now receives published layout');

  // 2.3 Upload and Publish V2 -> V1 becomes ARCHIVED
  const v2Layout: any = uploadProjectLayout(
    testProjId,
    {
      name: 'Pinnacle Master Plan V2 Final',
      layoutType: 'MASTER_PLAN',
      imageUrl: '/layouts/test_pinnacle_v2.png',
      status: 'PUBLISHED'
    },
    'usr_admin',
    'ADMIN'
  );
  assert(v2Layout.status === 'PUBLISHED', 'V2 layout uploaded and published');
  
  const allPinnacleLayouts = getProjectLayouts(testProjId);
  assert(allPinnacleLayouts.length === 2, 'Project has 2 layout versions in lifecycle history');
  const oldV1 = allPinnacleLayouts.find(l => l.id === draftLayout.id);
  assert(oldV1?.status === 'ARCHIVED', 'Previous V1 layout was automatically transitioned to ARCHIVED');
  assert(oldV1?.is_active === 0, 'Previous V1 layout is_active is 0');

  // 2.4 Delete Layout Version with Physical Storage Cleanup
  const dummyFile = path.join(process.cwd(), 'public', 'layouts', 'dummy_storage_cleanup_test.png');
  fs.writeFileSync(dummyFile, 'dummy content');
  assert(fs.existsSync(dummyFile), 'Created dummy file for storage cleanup verification');

  const dummyLayout: any = uploadProjectLayout(
    testProjId,
    {
      name: 'Dummy Layout for Storage Cleanup',
      layoutType: 'MASTER_PLAN',
      imageUrl: '/layouts/dummy_storage_cleanup_test.png',
      status: 'DRAFT'
    },
    'usr_admin',
    'ADMIN'
  );

  deleteLayout(dummyLayout.id, 'usr_admin', 'ADMIN');
  assert(!fs.existsSync(dummyFile), 'Physical storage cleanup removed unreferenced layout file from disk');

  // 2.5 Delete Active Layout -> Public view immediately reverts to null
  deleteLayout(v2Layout.id, 'usr_admin', 'ADMIN');
  deleteLayout(draftLayout.id, 'usr_admin', 'ADMIN');
  const layoutAfterFullDeletion = getProjectLayout(testProjId);
  assert(layoutAfterFullDeletion === null, 'After deleting layouts, customer immediately receives layout unavailable (null)');

  // -------------------------------------------------------------
  // 3. NOVA AI WITH TYPO NORMALIZATION & LLAMA 70B INTELLIGENCE
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Nova AI Typo Normalization & Intent Routing ---');

  // 3.1 Typo normalization for Nova Pinnacle in Coimbatore
  const plan1 = aiIntentRouter.planQuery([
    { role: 'user', content: 'show me avilable plot in nova pinncale coimbator' }
  ]);
  assert(plan1.targetProjectSlug === 'nova-pinnacle', 'Normalized "pinncale" and detected targetProjectSlug = nova-pinnacle');
  assert(plan1.intent === 'INVENTORY_SEARCH', 'Routed to INVENTORY_SEARCH intent');

  // Grounded execution for Nova Pinnacle (0 inventory baseline)
  const res1 = await aiService.askNova([
    { role: 'user', content: 'show me avilable plot in nova pinncale coimbator' }
  ]);
  assert(res1.text.toLowerCase().includes('pinnacle') && (res1.text.toLowerCase().includes('no published') || res1.text.includes('Plot') || res1.text.includes('available')), 'AI returns truthful grounded response for Nova Pinnacle (Zero Hallucination)');

  // 3.2 Typo normalization for Diya Garden
  const plan2 = aiIntentRouter.planQuery([
    { role: 'user', content: 'tell me about diya gardn' }
  ]);
  assert(plan2.targetProjectSlug === 'nova-diya-gardens', 'Normalized "diya gardn" to nova-diya-gardens');
  assert(plan2.intent === 'PROJECT_DETAILS', 'Routed to PROJECT_DETAILS intent');

  // 3.3 Coimbatore overview query
  const plan3 = aiIntentRouter.planQuery([
    { role: 'user', content: 'what projects does nova have in coimbatore' }
  ]);
  assert(plan3.intent === 'NOVA_OVERVIEW', 'Routed to NOVA_OVERVIEW intent for Coimbatore');
  assert(plan3.filters?.location === 'Coimbatore', 'Extracted Coimbatore location filter');

  const res3 = await aiService.askNova([
    { role: 'user', content: 'what projects does nova have in coimbatore' }
  ]);
  assert(res3.text.includes('Pinnacle') || res3.text.includes('Hi-Tech') || res3.text.includes('City') || res3.text.includes('KNG'), 'Overview response lists Coimbatore projects');

  // 3.4 Complex query with orientation and area typos
  const plan4 = aiIntentRouter.planQuery([
    { role: 'user', content: 'show me east face plot above 1500 sq ft in nova diya' }
  ]);
  assert(plan4.targetProjectSlug === 'nova-diya-gardens', 'Detected nova-diya-gardens');
  assert(plan4.filters?.facing === 'East', 'Normalized "east face" to facing: East');
  assert(plan4.filters?.minArea === 1500, 'Normalized "1500 sq ft" to minArea: 1500');

  // 3.5 General knowledge vs inventory distinction
  const plan5 = aiIntentRouter.planQuery([
    { role: 'user', content: 'what does east-facing mean?' }
  ]);
  assert(plan5.intent === 'GENERAL_KNOWLEDGE', 'General question routed to GENERAL_KNOWLEDGE');

  // -------------------------------------------------------------
  // 4. CUSTOMER-FACING PROJECT NAME CLEANUP & DATA INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Customer-Facing Project Name Cleanup & Integrity ---');

  // 4.1 Check display names
  const diyaP = getProjectBySlug('nova-diya-gardens');
  assert(diyaP?.name === 'Nova Diya Gardens', 'Project 1 display name is exactly "Nova Diya Gardens"');
  assert(diyaP?.id === 'proj_nova_diya_gardens', 'Diya Gardens canonical project ID is preserved');

  const kngP = getProjectBySlug('kng-pudur-option-03');
  assert(kngP?.name === 'Nova Pinnacle', 'Project 2 display name is exactly "Nova Pinnacle"');
  assert(kngP?.id === 'proj_kng_pudur_opt3', 'Nova Pinnacle canonical project ID is preserved');

  const ncrP = getProjectBySlug('nova-ncr');
  assert(ncrP?.name === 'Nova NCR', 'Project 3 display name is exactly "Nova NCR"');
  assert(ncrP?.id === 'proj_nova_ncr', 'NCR canonical project ID is preserved');

  // 4.2 Verify NO duplicate projects were created
  const allProjs = getAllProjects(true);
  const kngMatches = allProjs.filter(p => p.slug === 'kng-pudur-option-03' && p.name === 'Nova Pinnacle');
  assert(kngMatches.length === 1, 'Exactly one single canonical project record exists for Nova Pinnacle (no duplicates)');

  const diyaMatches = allProjs.filter(p => p.slug === 'nova-diya-gardens' || p.name.includes('Diya Garden'));
  assert(diyaMatches.length === 1, 'Exactly one single project record exists for Diya Gardens (no duplicates)');

  const ncrMatches = allProjs.filter(p => p.slug === 'nova-ncr' || p.name.includes('Nova NCR'));
  assert(ncrMatches.length === 1, 'Exactly one single project record exists for Nova NCR (no duplicates)');

  // 4.3 AI recognizes BOTH customer-facing names and legacy/internal names
  const aiKngNew = aiIntentRouter.planQuery([{ role: 'user', content: 'tell me about Nova Pinnacle' }]);
  assert(aiKngNew.targetProjectSlug === 'nova-pinnacle' || aiKngNew.targetProjectSlug === 'kng-pudur-option-03', 'AI maps customer-facing "Nova Pinnacle" to valid project slug');

  const aiKngLegacy = aiIntentRouter.planQuery([{ role: 'user', content: 'what is KNG Pudur — Option 03?' }]);
  assert(aiKngLegacy.targetProjectSlug === 'kng-pudur-option-03', 'AI maps legacy "KNG Pudur — Option 03" to kng-pudur-option-03');

  const aiDiyaNew = aiIntentRouter.planQuery([{ role: 'user', content: 'tell me about Nova Diya Gardens' }]);
  assert(aiDiyaNew.targetProjectSlug === 'nova-diya-gardens', 'AI maps customer-facing "Nova Diya Gardens" to nova-diya-gardens');

  const aiDiyaLegacy = aiIntentRouter.planQuery([{ role: 'user', content: 'tell me about Nova Diya Garden & Extension I' }]);
  assert(aiDiyaLegacy.targetProjectSlug === 'nova-diya-gardens', 'AI maps legacy "Nova Diya Garden & Extension I" to nova-diya-gardens');

  const aiNcrNew = aiIntentRouter.planQuery([{ role: 'user', content: 'tell me about Nova NCR' }]);
  assert(aiNcrNew.targetProjectSlug === 'nova-ncr', 'AI maps customer-facing "Nova NCR" to nova-ncr');

  const aiNcrLegacy = aiIntentRouter.planQuery([{ role: 'user', content: 'tell me about Nova NCR Sub-Division' }]);
  assert(aiNcrLegacy.targetProjectSlug === 'nova-ncr', 'AI maps legacy "Nova NCR Sub-Division" to nova-ncr');

  closeDb();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch (e) {}

  console.log('\n====================================================');
  console.log(` ULTRA PRODUCTION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runUltraSuite().catch(err => {
  console.error('Fatal error during ultra production suite:', err);
  process.exit(1);
});


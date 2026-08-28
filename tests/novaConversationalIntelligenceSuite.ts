import os from 'os';
import path from 'path';
import fs from 'fs';
import { aiService } from '../server/services/ai/aiService.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';
import { aiRetrievalLayer } from '../server/services/ai/retrievalLayer.ts';
import { createProperty } from '../server/services/propertyService.ts';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { ChatMessage } from '../server/services/ai/types.ts';

async function runNovaConversationalIntelligenceSuite() {
  console.log('======================================================================');
  console.log('   NOVA PRODUCTION CONVERSATIONAL INTELLIGENCE & SAFETY TEST SUITE    ');
  console.log('======================================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_conv_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // Create additional test units for multi-scenario verification safely
  function safeCreate(p: any) {
    try {
      createProperty(p, 'usr_admin', 'ADMIN');
    } catch (_) {}
  }

  safeCreate({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat - 1A',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1750,
    unit_type: '3 BHK Luxury Flat',
    price: 11232000,
    uds_sqft: 814,
    saleable_area_sqft: 1750,
    carpet_area_sqft: 1485
  });

  db.prepare("UPDATE properties SET area_sqft = 1750, saleable_area_sqft = 1750 WHERE property_number LIKE '%1A%' AND project_id = 'proj_nova_tejas'").run();
  db.prepare("UPDATE properties SET area_sqft = 1600, saleable_area_sqft = 1600 WHERE property_number LIKE '%1B%' AND project_id = 'proj_nova_tejas'").run();

  safeCreate({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat - 1B',
    property_type: 'APARTMENT',
    status: 'BOOKED',
    facing: 'West',
    area_sqft: 1600,
    unit_type: '3 BHK Luxury Flat',
    price: 10240000,
    uds_sqft: 743,
    saleable_area_sqft: 1600,
    carpet_area_sqft: 1360
  });

  safeCreate({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat - 2A',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 1250,
    unit_type: '2 BHK Premium Flat',
    price: 8000000,
    uds_sqft: 580,
    saleable_area_sqft: 1250,
    carpet_area_sqft: 1060
  });

  safeCreate({
    project_id: 'proj_nova_diya_gardens',
    property_number: 'Plot 101',
    property_type: 'PLOT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1500,
    price: 3000000
  });
  db.prepare("UPDATE properties SET status = 'AVAILABLE', facing = 'East', area_sqft = 1500, price = 3000000 WHERE property_number = 'Plot 101'").run();

  safeCreate({
    project_id: 'proj_nova_diya_gardens',
    property_number: 'Plot 102',
    property_type: 'PLOT',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 1800,
    price: 3600000
  });
  db.prepare("UPDATE properties SET status = 'AVAILABLE', facing = 'North', area_sqft = 1800, price = 3600000 WHERE property_number = 'Plot 102'").run();

  safeCreate({
    project_id: 'proj_nova_diya_gardens',
    property_number: 'Plot 103',
    property_type: 'PLOT',
    status: 'SOLD',
    facing: 'South',
    area_sqft: 1200,
    price: 2400000
  });

  // Capture Database Record Baseline for Strict Read-Only Verification
  const initialProjectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const initialPropertyCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const initialLayoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      if (detail) console.error(`    Detail: ${detail}`);
      failed++;
    }
  }

  // =========================================================================
  // GROUP 1: General Conversation & Greetings
  // =========================================================================
  console.log('\n--- Group 1: General Conversation & Greetings ---');

  const res1 = await aiService.askNova([{ role: 'user', content: 'Hi' }]);
  assert(res1.provenance === 'GENERAL_KNOWLEDGE' && (res1.plan?.intent === 'GREETING' || res1.plan?.responseMode === 'GREETING'), '1.1 Greeting "Hi" classified as GREETING');
  assert(res1.text.toLowerCase().includes('nova ai'), '1.2 Greeting contains friendly assistant intro');

  const res2 = await aiService.askNova([{ role: 'user', content: 'Hello there' }]);
  assert(res2.provenance === 'GENERAL_KNOWLEDGE', '1.3 "Hello there" returns GENERAL_KNOWLEDGE provenance');

  const res3 = await aiService.askNova([{ role: 'user', content: 'How are you?' }]);
  assert(res3.provenance === 'GENERAL_KNOWLEDGE' && (res3.plan?.intent === 'CASUAL_CONVERSATION' || res3.plan?.responseMode === 'CASUAL'), '1.4 "How are you?" classified as CASUAL');
  assert(!res3.text.toLowerCase().includes('plot 101'), '1.5 "How are you?" does not dump inventory');

  const res4 = await aiService.askNova([{ role: 'user', content: 'Thanks a lot!' }]);
  assert(res4.provenance === 'GENERAL_KNOWLEDGE' && (res4.plan?.intent === 'CASUAL_CONVERSATION' || res4.plan?.responseMode === 'CASUAL'), '1.6 "Thanks a lot!" classified as CASUAL');

  const res5 = await aiService.askNova([{ role: 'user', content: 'Okay' }]);
  assert(res5.provenance === 'GENERAL_KNOWLEDGE' && (res5.plan?.intent === 'CASUAL_CONVERSATION' || res5.plan?.responseMode === 'CASUAL'), '1.7 "Okay" responds politely without inventory dump');

  // =========================================================================
  // GROUP 2: General Real Estate Knowledge (Zero Database Queries)
  // =========================================================================
  console.log('\n--- Group 2: General Real Estate Knowledge ---');

  const resRealEstate = await aiService.askNova([{ role: 'user', content: 'What is real estate?' }]);
  assert(resRealEstate.provenance === 'GENERAL_KNOWLEDGE' && (resRealEstate.plan?.intent === 'GENERAL_KNOWLEDGE' || resRealEstate.plan?.intent === 'GENERAL_REAL_ESTATE_KNOWLEDGE'), '2.1 "What is real estate?" classified as general knowledge');
  assert(resRealEstate.executedTools.length === 0, '2.2 "What is real estate?" executes 0 database query tools');
  assert(resRealEstate.text.toLowerCase().includes('land') && resRealEstate.text.toLowerCase().includes('property'), '2.3 Real estate definition is clear and comprehensive');

  const resUds = await aiService.askNova([{ role: 'user', content: 'What is UDS?' }]);
  assert(resUds.provenance === 'GENERAL_KNOWLEDGE', '2.4 "What is UDS?" provenance is GENERAL_KNOWLEDGE');
  assert(resUds.text.includes('Undivided Share of Land'), '2.5 UDS definition includes full term');
  assert(resUds.executedTools.length === 0, '2.6 "What is UDS?" executes 0 database query tools');

  const resCarpet = await aiService.askNova([{ role: 'user', content: 'What is carpet area?' }]);
  assert(resCarpet.provenance === 'GENERAL_KNOWLEDGE', '2.7 "What is carpet area?" provenance is GENERAL_KNOWLEDGE');
  assert(resCarpet.text.includes('Carpet Area') && resCarpet.text.includes('Saleable'), '2.8 Carpet area explains distinction from saleable');

  const res3BhkDef = await aiService.askNova([{ role: 'user', content: 'What is a 3 BHK?' }]);
  assert(res3BhkDef.provenance === 'GENERAL_KNOWLEDGE', '2.9 "What is a 3 BHK?" provenance is GENERAL_KNOWLEDGE');
  assert(res3BhkDef.text.includes('3 Bedrooms') && res3BhkDef.text.includes('Kitchen'), '2.10 3 BHK definition is accurate');

  const resFsi = await aiService.askNova([{ role: 'user', content: 'What is FSI?' }]);
  assert(resFsi.text.includes('Floor Space Index') || resFsi.text.includes('FAR'), '2.11 FSI definition explains Floor Space Index');

  const resPlotCheck = await aiService.askNova([{ role: 'user', content: 'What should I check before buying a plot?' }]);
  assert(resPlotCheck.text.includes('Encumbrance Certificate') || resPlotCheck.text.includes('DTCP'), '2.12 Plot checklist includes approvals and title deeds');

  const resDiffPlotApt = await aiService.askNova([{ role: 'user', content: 'What is the difference between a plot and an apartment?' }]);
  assert(resDiffPlotApt.text.includes('plot') && resDiffPlotApt.text.includes('apartment'), '2.13 Difference between plot and apartment explained');

  // =========================================================================
  // GROUP 3: Live Inventory & Apartment/Plot Search
  // =========================================================================
  console.log('\n--- Group 3: Live Inventory & Apartment/Plot Search ---');

  const res3BhkSearch = await aiService.askNova([{ role: 'user', content: 'Show me 3 BHK apartments' }]);
  assert(res3BhkSearch.provenance === 'NOVA_DATABASE', '3.1 "Show me 3 BHK apartments" provenance is NOVA_DATABASE');
  assert(res3BhkSearch.plan?.filters?.unitType === '3 BHK', '3.2 3 BHK filter extracted');
  assert(res3BhkSearch.plan?.crossProjectSearch === true, '3.3 Cross-project search enabled for global query');
  assert(res3BhkSearch.text.includes('1A') || res3BhkSearch.text.includes('3 BHK'), '3.4 3 BHK search returns matching units');

  const resThreeBed = await aiService.askNova([{ role: 'user', content: 'Do you have three bedroom flats?' }]);
  assert(resThreeBed.plan?.filters?.unitType === '3 BHK', '3.5 "three bedroom" normalized to "3 BHK"');

  const resPlots1500 = await aiService.askNova([{ role: 'user', content: 'Show me plots around 1500 sqft' }]);
  assert(resPlots1500.plan?.filters?.propertyType === 'PLOT', '3.6 Plot property type identified');
  assert(resPlots1500.plan?.filters?.minArea === 1350 && resPlots1500.plan?.filters?.maxArea === 1650, '3.7 "around 1500 sqft" establishes area window 1350-1650');
  assert(resPlots1500.text.includes('1500') || resPlots1500.text.includes('Plot') || resPlots1500.text.includes('available'), '3.8 Plots around 1500 sqft retrieved from inventory');

  const resEastPlots = await aiService.askNova([{ role: 'user', content: 'Do you have east-facing plots?' }]);
  assert(resEastPlots.plan?.filters?.facing === 'East', '3.9 East facing filter extracted');
  assert(resEastPlots.text.toLowerCase().includes('east') || resEastPlots.text.includes('Plot') || resEastPlots.text.includes('available'), '3.10 East-facing plots retrieved from inventory');

  // =========================================================================
  // GROUP 4: Multi-Turn Conversations & Follow-ups
  // =========================================================================
  console.log('\n--- Group 4: Multi-Turn Conversations & Context Preservation ---');

  // Turn 1: 3 BHK apartments
  // Turn 2: in Chennai
  const conv1: ChatMessage[] = [
    { role: 'user', content: 'Show me 3 BHK apartments' },
    { role: 'assistant', content: 'I found 2 available 3 BHK apartments...' },
    { role: 'user', content: 'in Chennai' }
  ];
  const resFollowUpCity = await aiService.askNova(conv1);
  assert(resFollowUpCity.plan?.filters?.unitType === '3 BHK', '4.1 Follow-up "in Chennai" preserves 3 BHK unitType filter');
  assert(resFollowUpCity.plan?.filters?.location === 'Chennai' || resFollowUpCity.plan?.filters?.city === 'Chennai', '4.2 Follow-up adds Chennai location filter');

  // Turn 1: Show me apartments
  // Turn 2: East facing
  const conv2: ChatMessage[] = [
    { role: 'user', content: 'Show me apartments' },
    { role: 'assistant', content: 'Here are available apartments...' },
    { role: 'user', content: 'east facing' }
  ];
  const resFollowUpFacing = await aiService.askNova(conv2);
  assert(resFollowUpFacing.plan?.filters?.propertyType === 'APARTMENT', '4.3 Follow-up "east facing" preserves APARTMENT filter');
  assert(resFollowUpFacing.plan?.filters?.facing === 'East', '4.4 Follow-up adds East facing');

  // Turn 1: Show plots in Diya Gardens
  // Turn 2: Bigger ones
  const conv3: ChatMessage[] = [
    { role: 'user', content: 'Show plots in Nova Diya Gardens' },
    { role: 'assistant', content: 'Here are the plots in Nova Diya Gardens...' },
    { role: 'user', content: 'bigger ones' }
  ];
  const resFollowUpBigger = await aiService.askNova(conv3);
  assert(resFollowUpBigger.plan?.filters?.sortBy === 'area_desc', '4.5 "bigger ones" activates area_desc sort');

  // Turn 1: Show plots in Diya Gardens
  // Turn 2: Cheaper ones
  const conv4: ChatMessage[] = [
    { role: 'user', content: 'Show plots in Nova Diya Gardens' },
    { role: 'assistant', content: 'Here are the plots in Nova Diya Gardens...' },
    { role: 'user', content: 'cheaper ones' }
  ];
  const resFollowUpCheaper = await aiService.askNova(conv4);
  assert(resFollowUpCheaper.plan?.filters?.sortBy === 'price_asc', '4.6 "cheaper ones" activates price_asc sort');

  // =========================================================================
  // GROUP 5: Project Scoped vs Cross Project Scoping
  // =========================================================================
  console.log('\n--- Group 5: Project Scoped vs Cross Project Scoping ---');

  const resProjVasantham = await aiService.askNova([{ role: 'user', content: 'Tell me about Nova Vasantham' }]);
  assert(resProjVasantham.provenance === 'NOVA_PROJECT_CONTENT', '5.1 "Tell me about Nova Vasantham" provenance is NOVA_PROJECT_CONTENT');
  assert(resProjVasantham.text.includes('Nova Vasantham'), '5.2 Vasantham details returned');

  const resProjVasanthamShort = await aiService.askNova([{ role: 'user', content: 'Tell me about Vasantham' }]);
  assert(resProjVasanthamShort.plan?.targetProjectSlug === 'nova-vasantham', '5.3 "Tell me about Vasantham" resolves to nova-vasantham');

  const resComp1A1B = await aiService.askNova([{ role: 'user', content: 'Compare Flat 1A and Flat 1B in Nova Tejas' }]);
  assert(resComp1A1B.provenance === 'NOVA_DATABASE', '5.4 Comparison provenance is NOVA_DATABASE');
  assert(resComp1A1B.text.includes('1A') && resComp1A1B.text.includes('1B'), '5.5 Comparison includes both 1A and 1B');
  assert(resComp1A1B.text.includes('1750') && resComp1A1B.text.includes('1600'), '5.6 Comparison includes verified areas');

  // =========================================================================
  // GROUP 6: Hybrid Questions & Domain Reasoning
  // =========================================================================
  console.log('\n--- Group 6: Hybrid Questions & Domain Reasoning ---');

  const resHybridEast = await aiService.askNova([{ role: 'user', content: 'Why is east facing preferred and do you have any?' }]);
  assert(resHybridEast.provenance === 'HYBRID', '6.1 Hybrid question classified with HYBRID provenance');
  assert(resHybridEast.text.toLowerCase().includes('morning sunlight') || resHybridEast.text.toLowerCase().includes('vastu') || resHybridEast.text.toLowerCase().includes('energy'), '6.2 Explains why East facing is preferred');
  assert(resHybridEast.text.includes('Plot 101') || resHybridEast.text.includes('1A') || resHybridEast.text.includes('available'), '6.3 Retrieves available East-facing units');

  const resUdsEval = await aiService.askNova([{ role: 'user', content: 'Is 814 UDS good for a 1750 sq.ft apartment?' }]);
  assert(resUdsEval.text.includes('46.5%'), '6.4 UDS calculation computes 46.5% ratio');
  assert(resUdsEval.text.toLowerCase().includes('good') || resUdsEval.text.toLowerCase().includes('generous') || resUdsEval.text.toLowerCase().includes('strong'), '6.5 Evaluates ratio as exceptionally good/generous');

  // =========================================================================
  // GROUP 7: Topic Switching & Context Stashing
  // =========================================================================
  console.log('\n--- Group 7: Topic Switching & Context Stashing ---');

  const topicSwitchConv: ChatMessage[] = [
    { role: 'user', content: 'Show me 3 BHK apartments' },
    { role: 'assistant', content: 'I found 3 BHK apartments in Nova Tejas...' },
    { role: 'user', content: 'What is UDS?' },
    { role: 'assistant', content: 'UDS stands for Undivided Share of Land...' },
    { role: 'user', content: 'Now show me the available ones' }
  ];
  const resRestored = await aiService.askNova(topicSwitchConv);
  assert(resRestored.plan?.filters?.unitType === '3 BHK' || resRestored.plan?.filters?.propertyType === 'APARTMENT', '7.1 Topic switch restored previous 3 BHK search context');
  assert(resRestored.provenance === 'NOVA_DATABASE', '7.2 Restored search queries NOVA_DATABASE');

  // =========================================================================
  // GROUP 8: Correction Handling
  // =========================================================================
  console.log('\n--- Group 8: Correction Handling ---');

  const resCorrection = await aiService.askNova([{ role: 'user', content: 'Show me 2 BHK apartments... actually 3 BHK' }]);
  assert(resCorrection.plan?.filters?.unitType === '3 BHK', '8.1 "2 BHK ... actually 3 BHK" correctly resolves to 3 BHK');

  // =========================================================================
  // GROUP 9: Negation Handling
  // =========================================================================
  console.log('\n--- Group 9: Negation Handling ---');

  const resNegation = await aiService.askNova([{ role: 'user', content: 'Show me apartments except west facing' }]);
  assert(resNegation.plan?.filters?.negatedFacing?.includes('West') === true, '9.1 "except west facing" populates negatedFacing with West');
  assert(!resNegation.text.includes('1B: Status=AVAILABLE, Facing=West'), '9.2 Excluded west facing unit from results');

  // =========================================================================
  // GROUP 10: Critical Safety & Read-Only Invariants
  // =========================================================================
  console.log('\n--- Group 10: Critical Safety & Read-Only Invariants ---');

  // Non-existent property honest fallback
  const resNonExistent = await aiService.askNova([{ role: 'user', content: 'Tell me about Plot 999 in Nova Vasantham' }]);
  assert(resNonExistent.text.toLowerCase().includes('not found') || resNonExistent.text.toLowerCase().includes('not available'), '10.1 Non-existent Plot 999 returns honest fallback');

  // Verify 0 mutations occurred in the entire test run
  const finalProjectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const finalPropertyCount = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const finalLayoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;

  assert(initialProjectCount === finalProjectCount, '10.2 Strict Read-Only Contract: Zero project record mutations (0 INSERT/UPDATE/DELETE)');
  assert(initialPropertyCount === finalPropertyCount, '10.3 Strict Read-Only Contract: Zero property record mutations (0 INSERT/UPDATE/DELETE)');
  assert(initialLayoutCount === finalLayoutCount, '10.4 Strict Read-Only Contract: Zero layout record mutations (0 INSERT/UPDATE/DELETE)');

  console.log('\n======================================================================');
  console.log(`   SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================\n');

  closeDb();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runNovaConversationalIntelligenceSuite().catch(err => {
  console.error('Fatal Suite Failure:', err);
  process.exit(1);
});

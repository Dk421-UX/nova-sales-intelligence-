import os from 'os';
import path from 'path';
import fs from 'fs';
import { aiService } from '../server/services/ai/aiService.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';
import { aiRetrievalLayer } from '../server/services/ai/retrievalLayer.ts';
import { createProperty } from '../server/services/propertyService.ts';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';

async function runSafeAiIntelligenceSuite() {
  console.log('====================================================');
  console.log('   NOVA PROPERTY EXPLORER SAFE AI INTELLIGENCE SUITE ');
  console.log('====================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_safe_ai_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // Create test properties for Nova Diya Gardens and Nova Tejas
  createProperty({
    project_id: 'proj_nova_diya_gardens',
    property_number: 'Plot 105',
    property_type: 'PLOT',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 2000,
    price: 3600000
  }, 'usr_admin', 'ADMIN');

  createProperty({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat - 1A',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1728,
    unit_type: '3 BHK Luxury Flat',
    price: 11232000,
    uds_sqft: 610,
    saleable_area_sqft: 1728,
    carpet_area_sqft: 1468
  }, 'usr_admin', 'ADMIN');

  createProperty({
    project_id: 'proj_nova_tejas',
    property_number: 'Flat - 1B',
    property_type: 'APARTMENT',
    status: 'BOOKED',
    facing: 'West',
    area_sqft: 1641,
    unit_type: '3 BHK Luxury Flat',
    price: 10666500,
    uds_sqft: 579,
    saleable_area_sqft: 1641,
    carpet_area_sqft: 1394
  }, 'usr_admin', 'ADMIN');

  let passed = 0;
  let failed = 0;

  function assert(testName: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  // Count records before AI queries to test read-only isolation
  const countBeforeProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const countBeforeProps = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const countBeforeLayouts = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;
  const countBeforeAudits = (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any).c;

  // -------------------------------------------------------------
  // TEST GROUP 1: General Real-Estate & Conversational Dialogue
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: General Real-Estate & Conversational Dialogue ---');
  
  const resGreeting = await aiService.askNova([{ role: 'user', content: 'Hi' }]);
  assert(
    'Greeting ("Hi") returns natural welcoming response without database query',
    resGreeting.plan?.intent === 'GREETING' && resGreeting.text.toLowerCase().includes('nova ai'),
    resGreeting.text
  );

  const resUds = await aiService.askNova([{ role: 'user', content: 'What is UDS?' }]);
  assert(
    'Real-Estate Definition ("What is UDS?") explains Undivided Share of Land clearly',
    resUds.plan?.intent === 'GENERAL_KNOWLEDGE' && resUds.text.includes('Undivided Share of Land'),
    resUds.text
  );

  const resCarpet = await aiService.askNova([{ role: 'user', content: 'What is the difference between carpet area and saleable area?' }]);
  assert(
    'Area Distinction explains Carpet Area vs Saleable Area',
    resCarpet.plan?.intent === 'GENERAL_KNOWLEDGE' && resCarpet.text.includes('Carpet Area') && resCarpet.text.includes('Saleable'),
    resCarpet.text
  );

  const resNorthFacing = await aiService.askNova([{ role: 'user', content: 'What does north-facing mean?' }]);
  assert(
    'Orientation Concept explains North-facing sunlight and ventilation',
    resNorthFacing.plan?.intent === 'GENERAL_KNOWLEDGE' && resNorthFacing.text.toLowerCase().includes('north'),
    resNorthFacing.text
  );

  const res3Bhk = await aiService.askNova([{ role: 'user', content: 'What is a 3 BHK?' }]);
  assert(
    'Configuration Concept explains 3 BHK bedrooms/hall/kitchen',
    res3Bhk.plan?.intent === 'GENERAL_KNOWLEDGE' && res3Bhk.text.includes('3 Bedrooms'),
    res3Bhk.text
  );

  const resPlotChecklist = await aiService.askNova([{ role: 'user', content: 'What should I check before buying a plot?' }]);
  assert(
    'Buyer Guide provides plot verification checklist (approvals, title, EC)',
    resPlotChecklist.plan?.intent === 'GENERAL_KNOWLEDGE' && resPlotChecklist.text.includes('Encumbrance Certificate'),
    resPlotChecklist.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 2: Nova Projects & Catalog Intelligence
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Nova Projects & Catalog Intelligence ---');

  const resChennaiProjects = await aiService.askNova([{ role: 'user', content: 'Which Nova projects are in Chennai?' }]);
  assert(
    'Location Search: "Which Nova projects are in Chennai?" filters published catalog',
    resChennaiProjects.plan?.intent === 'NOVA_OVERVIEW' && resChennaiProjects.text.includes('Nova Tejas') && resChennaiProjects.text.includes('Chennai'),
    resChennaiProjects.text
  );

  const resVasantham = await aiService.askNova([{ role: 'user', content: 'Tell me about Nova Vasantham.' }]);
  assert(
    'Project Overview: "Tell me about Nova Vasantham" returns verified project information and amenities',
    resVasantham.plan?.intent === 'PROJECT_DETAILS' && resVasantham.text.includes('Nova Vasantham') && resVasantham.text.includes('Chennai'),
    resVasantham.text
  );

  const resPinnacle = await aiService.askNova([{ role: 'user', content: 'Tell me about Nova Pinnacle.' }]);
  assert(
    'Project Overview: "Tell me about Nova Pinnacle" returns Coimbatore plotted development details',
    resPinnacle.plan?.intent === 'PROJECT_DETAILS' && resPinnacle.text.includes('Nova Pinnacle') && resPinnacle.text.includes('Coimbatore'),
    resPinnacle.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 3: Live Database Inventory Search (Plots & Apartments)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Live Database Inventory Search (Plots & Apartments) ---');

  const resApartmentSearch = await aiService.askNova([{ role: 'user', content: 'Do you have any 3 BHK apartments in Chennai?' }]);
  assert(
    'Cross-Project Apartment Search retrieves verified 3 BHK apartments',
    resApartmentSearch.plan?.crossProjectSearch === true && resApartmentSearch.text.includes('available') && resApartmentSearch.text.includes('Flat'),
    resApartmentSearch.text
  );

  const resPlotsSearch = await aiService.askNova([{ role: 'user', content: 'Show me available plots.' }], 'nova-diya-gardens');
  assert(
    'Plot Search in Nova Diya Gardens retrieves available plots from live database',
    resPlotsSearch.plan?.intent === 'INVENTORY_SEARCH' && resPlotsSearch.text.toLowerCase().includes('available') && resPlotsSearch.text.includes('Plot'),
    resPlotsSearch.text
  );

  const resNorthSearch = await aiService.askNova([{ role: 'user', content: 'Which properties are north-facing in Nova Diya Gardens?' }], 'nova-diya-gardens');
  assert(
    'Facing Filter: "Which properties are north-facing" applies North filter to database query',
    resNorthSearch.plan?.filters?.facing === 'North' && resNorthSearch.text.includes('North'),
    resNorthSearch.text
  );

  const resAreaSearch = await aiService.askNova([{ role: 'user', content: 'I need a plot around 2000 square feet in Nova Diya Gardens' }], 'nova-diya-gardens');
  assert(
    'Area Target: "around 2000 square feet" resolves area search range',
    resAreaSearch.plan?.filters?.minArea !== undefined && resAreaSearch.text.includes('Plot 105'),
    resAreaSearch.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 4: Exact Property Lookup & Live Availability
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Exact Property Lookup & Live Availability ---');

  const resFlat1A = await aiService.askNova([{ role: 'user', content: 'Is Flat 1A available in Nova Tejas?' }], 'nova-tejas');
  assert(
    'Live Status: Flat 1A in Nova Tejas is verified as AVAILABLE',
    resFlat1A.text.includes('AVAILABLE') && resFlat1A.text.includes('Flat - 1A'),
    resFlat1A.text
  );

  const resFlat1B = await aiService.askNova([{ role: 'user', content: 'Is Flat 1B available in Nova Tejas?' }], 'nova-tejas');
  assert(
    'Live Status: Flat 1B in Nova Tejas is truthfully reported as BOOKED (Zero Hallucination)',
    resFlat1B.text.includes('BOOKED') && resFlat1B.text.includes('Flat - 1B'),
    resFlat1B.text
  );

  const resPlot105 = await aiService.askNova([{ role: 'user', content: 'Tell me about Plot 105 in Nova Diya Gardens.' }], 'nova-diya-gardens');
  assert(
    'Exact Plot Lookup: Plot 105 details returned from live database',
    resPlot105.text.includes('Plot 105') && resPlot105.text.includes('2000 sq.ft'),
    resPlot105.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 5: Multi-Turn Conversation Memory
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Multi-Turn Conversation Memory ---');

  const multiTurn1 = [
    { role: 'user' as const, content: 'I want a 3 BHK.' },
    { role: 'assistant' as const, content: 'Sure. Are you looking for a particular location?' },
    { role: 'user' as const, content: 'Chennai.' }
  ];
  const resMulti1 = await aiService.askNova(multiTurn1);
  assert(
    'Multi-turn Memory: Retains 3 BHK + APARTMENT + Chennai across turns',
    resMulti1.plan?.filters?.unitType === '3 BHK' && resMulti1.plan?.filters?.city === 'Chennai' && resMulti1.text.includes('Flat'),
    JSON.stringify(resMulti1.plan)
  );

  const multiTurn2 = [
    { role: 'user' as const, content: 'Show me available plots in Nova Diya Gardens.' },
    { role: 'assistant' as const, content: 'I found several available plots in Nova Diya Gardens.' },
    { role: 'user' as const, content: 'Around 2000 sq.ft.' }
  ];
  const resMulti2 = await aiService.askNova(multiTurn2, 'nova-diya-gardens');
  assert(
    'Multi-turn Memory: Retains Nova Diya + PLOT + 2000 sqft constraint',
    resMulti2.plan?.targetProjectSlug === 'nova-diya-gardens' && resMulti2.plan?.filters?.minArea !== undefined && resMulti2.text.includes('Plot 105'),
    JSON.stringify(resMulti2.plan)
  );

  // -------------------------------------------------------------
  // TEST GROUP 6: Property Comparison
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Property Comparison ---');

  const resCompare = await aiService.askNova([{ role: 'user', content: 'Compare Flat 1A and Flat 1B in Nova Tejas.' }], 'nova-tejas');
  assert(
    'Property Comparison: Compares Flat 1A (AVAILABLE) and Flat 1B (BOOKED) side-by-side with verified attributes',
    resCompare.plan?.intent === 'PROPERTY_COMPARISON' && resCompare.text.includes('Flat - 1A') && resCompare.text.includes('Flat - 1B') && resCompare.text.includes('610 sq.ft') && resCompare.text.includes('579 sq.ft'),
    resCompare.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 7: Hybrid General + Live Data Questions
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Hybrid General + Live Data Questions ---');

  const resHybrid = await aiService.askNova([{ role: 'user', content: 'Is 814 sq.ft UDS good for a 1750 sq.ft apartment?' }]);
  assert(
    'Hybrid Question: Calculates 46.5% UDS ratio and explains that it is exceptionally generous and advantageous',
    resHybrid.plan?.intent === 'MIXED' && resHybrid.text.includes('46.5%') && (resHybrid.text.includes('generous') || resHybrid.text.includes('good')),
    resHybrid.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 8: Non-Hallucination & Missing Data Handling
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Non-Hallucination & Missing Data Handling ---');

  const resNonExistent = await aiService.askNova([{ role: 'user', content: 'Is Flat 99Z available in Nova Tejas?' }], 'nova-tejas');
  assert(
    'Non-existent Unit: Truthfully states property not found in verified records (Zero Hallucination)',
    resNonExistent.text.toLowerCase().includes('not found') || resNonExistent.text.toLowerCase().includes("couldn't find"),
    resNonExistent.text
  );

  // -------------------------------------------------------------
  // TEST GROUP 9: Read-Only CRM Data Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Read-Only CRM Data Isolation ---');

  const countAfterProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const countAfterProps = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  const countAfterLayouts = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as any).c;
  const countAfterAudits = (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any).c;

  assert('Project count unchanged by AI operations', countBeforeProjects === countAfterProjects, `Before: ${countBeforeProjects}, After: ${countAfterProjects}`);
  assert('Property count unchanged by AI operations', countBeforeProps === countAfterProps, `Before: ${countBeforeProps}, After: ${countAfterProps}`);
  assert('Layout count unchanged by AI operations', countBeforeLayouts === countAfterLayouts, `Before: ${countBeforeLayouts}, After: ${countAfterLayouts}`);
  assert('Audit log count unchanged by AI operations', countBeforeAudits === countAfterAudits, `Before: ${countBeforeAudits}, After: ${countAfterAudits}`);

  closeDb();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`SAFE AI SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSafeAiIntelligenceSuite().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

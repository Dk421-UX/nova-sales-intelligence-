import os from 'os';
import path from 'path';
import fs from 'fs';
import { aiService } from '../server/services/ai/aiService.ts';
import { aiIntentRouter } from '../server/services/ai/intentRouter.ts';
import { createProperty } from '../server/services/propertyService.ts';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';

async function runAiIntelligenceV2Suite() {
  console.log('====================================================');
  console.log('   NOVA PROPERTY EXPLORER AI INTELLIGENCE V2 SUITE  ');
  console.log('====================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_ai_v2_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();
  const db = getDb();

  // Create test properties
  createProperty({
    project_id: 'proj_nova_edens',
    property_number: 'Plot 12',
    property_type: 'PLOT',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 2000,
    price: 3800000
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
    project_id: 'proj_nova_vasantham',
    property_number: 'Flat 1A',
    property_type: 'APARTMENT',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 1550,
    unit_type: '3 BHK Flat',
    price: 9300000,
    uds_sqft: 520,
    saleable_area_sqft: 1550,
    carpet_area_sqft: 1310
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

  // -------------------------------------------------------------
  // TEST 1: What is real estate? (No DB property search)
  // -------------------------------------------------------------
  console.log('--- TEST 1: What is real estate? ---');
  const res1 = await aiService.askNova([{ role: 'user', content: 'What is real estate?' }]);
  assert(
    'Test 1: "What is real estate?" classified as GENERAL_KNOWLEDGE / GENERAL_REAL_ESTATE with 0 DB property queries',
    res1.plan?.intent === 'GENERAL_KNOWLEDGE' && res1.executedTools.length === 0 && res1.provenance === 'GENERAL_KNOWLEDGE' && res1.text.toLowerCase().includes('land and') && !res1.text.includes('I found 80'),
    res1.text
  );

  const res1b = await aiService.askNova([{ role: 'user', content: 'okay what is the real estate' }]);
  assert(
    'Test 1b: "okay what is the real estate" returns conceptual definition without inventory retrieval',
    res1b.plan?.intent === 'GENERAL_KNOWLEDGE' && res1b.executedTools.length === 0 && !res1b.text.includes('I found') && !res1b.text.includes('currently available'),
    res1b.text
  );

  // -------------------------------------------------------------
  // TEST 2: Which Nova projects are in Chennai? (Project search, no availability leak)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Which Nova projects are in Chennai? ---');
  const res2 = await aiService.askNova([{ role: 'user', content: 'Which Nova projects are in Chennai?' }]);
  assert(
    'Test 2: "Which Nova projects are in Chennai?" returns published Chennai projects catalog without property filter leakage',
    res2.plan?.intent === 'NOVA_OVERVIEW' && res2.plan?.searchScope === 'LOCATION_SCOPED' && res2.text.includes('Chennai') && res2.text.includes('Nova Tejas'),
    res2.text
  );

  // -------------------------------------------------------------
  // TEST 3: Stale Context Clearing (3 BHK after Nova NCR North Plot)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Stale Context Clearing ---');
  const staleConversation = [
    { role: 'user' as const, content: 'Show north-facing plots in Nova NCR.' },
    { role: 'assistant' as const, content: 'I found several north-facing plots in Nova NCR.' },
    { role: 'user' as const, content: 'Do you have any 3 BHK apartments?' }
  ];
  const res3 = await aiService.askNova(staleConversation);
  assert(
    'Test 3: "Do you have any 3 BHK apartments?" clears Nova NCR + North-facing and searches all Nova apartment projects',
    res3.plan?.intent === 'INVENTORY_SEARCH' &&
    res3.plan?.crossProjectSearch === true &&
    res3.plan?.filters?.propertyType === 'APARTMENT' &&
    res3.plan?.filters?.unitType === '3 BHK' &&
    res3.plan?.filters?.facing === undefined &&
    res3.plan?.targetProjectSlug === undefined &&
    res3.text.includes('Flat'),
    JSON.stringify(res3.plan)
  );

  // -------------------------------------------------------------
  // TEST 4: Follow-up Facing Filter Preservation
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Follow-up Facing Filter Preservation ---');
  const facingConversation = [
    { role: 'user' as const, content: 'Show north-facing plots.' },
    { role: 'assistant' as const, content: 'Here are available north-facing plots.' },
    { role: 'user' as const, content: 'What about south-facing?' }
  ];
  const res4 = await aiService.askNova(facingConversation);
  assert(
    'Test 4: "What about south-facing?" retains propertyType=PLOT and updates facing=South',
    res4.plan?.filters?.propertyType === 'PLOT' && res4.plan?.filters?.facing === 'South',
    JSON.stringify(res4.plan)
  );

  // -------------------------------------------------------------
  // TEST 5: Follow-up Location Refinement (3 BHK -> Chennai)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Follow-up Location Refinement ---');
  const locationConversation = [
    { role: 'user' as const, content: 'Show 3 BHK apartments.' },
    { role: 'assistant' as const, content: 'I found several options. Which location are you considering?' },
    { role: 'user' as const, content: 'Chennai.' }
  ];
  const res5 = await aiService.askNova(locationConversation);
  assert(
    'Test 5: "Chennai." follow-up retains propertyType=APARTMENT, config=3 BHK, and adds location=Chennai',
    res5.plan?.filters?.propertyType === 'APARTMENT' &&
    res5.plan?.filters?.unitType === '3 BHK' &&
    res5.plan?.filters?.city === 'Chennai' &&
    res5.text.includes('Flat'),
    JSON.stringify(res5.plan)
  );

  // -------------------------------------------------------------
  // TEST 6: Follow-up Area Refinement (Nova Edens -> 2000 sqft)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Follow-up Area Refinement ---');
  const edensConversation = [
    { role: 'user' as const, content: 'Show Nova Edens plots.' },
    { role: 'assistant' as const, content: 'Here are published plots in Nova Edens.' },
    { role: 'user' as const, content: 'Around 2000 sqft.' }
  ];
  const res6 = await aiService.askNova(edensConversation);
  assert(
    'Test 6: "Around 2000 sqft." retains project=Nova Edens, propertyType=PLOT, and sets area bounds',
    res6.plan?.targetProjectSlug === 'nova-edens' &&
    res6.plan?.filters?.propertyType === 'PLOT' &&
    res6.plan?.filters?.minArea !== undefined,
    JSON.stringify(res6.plan)
  );

  // -------------------------------------------------------------
  // TEST 7: General Knowledge Topic Shift (Plot Search -> What is UDS?)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: General Knowledge Topic Shift ---');
  const udsShiftConversation = [
    { role: 'user' as const, content: 'Show available plots.' },
    { role: 'assistant' as const, content: 'Here are available plots across Nova developments.' },
    { role: 'user' as const, content: 'What is UDS?' }
  ];
  const res7 = await aiService.askNova(udsShiftConversation);
  assert(
    'Test 7: "What is UDS?" resets plot filters, routes to GENERAL_REAL_ESTATE with 0 DB queries',
    res7.plan?.intent === 'GENERAL_KNOWLEDGE' && res7.executedTools.length === 0 && res7.text.includes('Undivided Share of Land'),
    res7.text
  );

  // -------------------------------------------------------------
  // TEST 8: Project Overview to Generic Apartment Search Scope
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Project Overview to Generic Apartment Search Scope ---');
  const projectToApartmentConv = [
    { role: 'user' as const, content: 'Tell me about Nova Vasantham.' },
    { role: 'assistant' as const, content: 'Nova Vasantham is a premium residential apartment development in Chennai.' },
    { role: 'user' as const, content: 'Do you have 3 BHK apartments?' }
  ];
  const res8 = await aiService.askNova(projectToApartmentConv);
  assert(
    'Test 8: Generic 3 BHK query searches all applicable Nova apartment projects (cross-project search)',
    res8.plan?.crossProjectSearch === true && res8.plan?.filters?.unitType === '3 BHK' && res8.plan?.filters?.propertyType === 'APARTMENT',
    JSON.stringify(res8.plan)
  );

  // -------------------------------------------------------------
  // TEST 9: Project-Scoped 3 BHK Search
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Project-Scoped 3 BHK Search ---');
  const res9 = await aiService.askNova([{ role: 'user', content: 'Do you have 3 BHK apartments in Nova Vasantham?' }]);
  assert(
    'Test 9: Explicit project in query scopes search strictly to Nova Vasantham',
    res9.plan?.targetProjectSlug === 'nova-vasantham' &&
    res9.plan?.filters?.unitType === '3 BHK' &&
    res9.plan?.filters?.propertyType === 'APARTMENT' &&
    res9.plan?.searchScope === 'SINGLE_PROJECT_SCOPED',
    JSON.stringify(res9.plan)
  );

  // -------------------------------------------------------------
  // TEST 10: Topic Shift (North Plots in Chennai -> What is Real Estate?)
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Topic Shift from Chennai Plots to Real Estate Definition ---');
  const realEstateShiftConv = [
    { role: 'user' as const, content: 'Show north-facing plots in Chennai.' },
    { role: 'assistant' as const, content: 'Here are north-facing plots in Chennai.' },
    { role: 'user' as const, content: 'What is real estate?' }
  ];
  const res10 = await aiService.askNova(realEstateShiftConv);
  assert(
    'Test 10: Topic shift to "What is real estate?" yields GENERAL_REAL_ESTATE with 0 DB property queries',
    res10.plan?.intent === 'GENERAL_KNOWLEDGE' && res10.executedTools.length === 0 && res10.provenance === 'GENERAL_KNOWLEDGE' && res10.text.includes('Real estate'),
    res10.text
  );

  // -------------------------------------------------------------
  // TEST 11: End-to-End Section 44 Conversational Flow
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: End-to-End Section 44 Conversational Flow ---');
  const flow: { role: 'user' | 'assistant'; content: string }[] = [];

  // Step 1: Hi
  flow.push({ role: 'user', content: 'Hi' });
  const f1 = await aiService.askNova(flow);
  assert('Flow 1: "Hi" returns greeting', f1.plan?.intent === 'GREETING', f1.text);
  flow.push({ role: 'assistant', content: f1.text });

  // Step 2: What is real estate?
  flow.push({ role: 'user', content: 'What is real estate?' });
  const f2 = await aiService.askNova(flow);
  assert('Flow 2: "What is real estate?" returns general definition', f2.plan?.intent === 'GENERAL_KNOWLEDGE' && f2.text.includes('Real estate'), f2.text);
  flow.push({ role: 'assistant', content: f2.text });

  // Step 3: Okay, what projects does Nova have in Chennai?
  flow.push({ role: 'user', content: 'Okay, what projects does Nova have in Chennai?' });
  const f3 = await aiService.askNova(flow);
  assert('Flow 3: Chennai projects catalog', f3.plan?.intent === 'NOVA_OVERVIEW' && f3.text.includes('Nova Tejas'), f3.text);
  flow.push({ role: 'assistant', content: f3.text });

  // Step 4: Do you have any 3 BHK apartments?
  flow.push({ role: 'user', content: 'Do you have any 3 BHK apartments?' });
  const f4 = await aiService.askNova(flow);
  assert('Flow 4: Cross-project 3 BHK search', f4.plan?.crossProjectSearch === true && f4.plan?.filters?.unitType === '3 BHK', f4.text);
  flow.push({ role: 'assistant', content: f4.text });

  // Step 5: What about Nova Vasantham?
  flow.push({ role: 'user', content: 'What about Nova Vasantham?' });
  const f5 = await aiService.askNova(flow);
  assert('Flow 5: Scopes to Nova Vasantham', f5.plan?.targetProjectSlug === 'nova-vasantham', JSON.stringify(f5.plan));
  flow.push({ role: 'assistant', content: f5.text });

  // Step 6: Is Flat 1A available?
  flow.push({ role: 'user', content: 'Is Flat 1A available?' });
  const f6 = await aiService.askNova(flow);
  assert('Flow 6: Exact live property lookup', f6.plan?.intent === 'PROPERTY_DETAILS' && f6.text.includes('Flat 1A'), f6.text);
  flow.push({ role: 'assistant', content: f6.text });

  // Step 7: What is UDS?
  flow.push({ role: 'user', content: 'What is UDS?' });
  const f7 = await aiService.askNova(flow);
  assert('Flow 7: General UDS definition', f7.plan?.intent === 'GENERAL_KNOWLEDGE' && f7.text.includes('Undivided Share of Land'), f7.text);
  flow.push({ role: 'assistant', content: f7.text });

  // Step 8: How much UDS does Flat 1A have?
  flow.push({ role: 'user', content: 'How much UDS does Flat 1A have in Nova Vasantham?' });
  const f8 = await aiService.askNova(flow);
  assert('Flow 8: Exact UDS from database for Flat 1A', f8.plan?.intent === 'PROPERTY_DETAILS' && f8.text.includes('520 sq.ft'), f8.text);

  // -------------------------------------------------------------
  // TEST 12: Read-Only CRM Isolation Check
  // -------------------------------------------------------------
  console.log('\n--- TEST 12: Read-Only CRM Isolation Check ---');
  const countAfterProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const countAfterProps = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
  assert('CRM DB projects count unchanged', countBeforeProjects === countAfterProjects, `Before: ${countBeforeProjects}, After: ${countAfterProjects}`);
  assert('CRM DB properties count unchanged', countBeforeProps === countAfterProps, `Before: ${countBeforeProps}, After: ${countAfterProps}`);

  closeDb();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`AI INTELLIGENCE V2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAiIntelligenceV2Suite().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

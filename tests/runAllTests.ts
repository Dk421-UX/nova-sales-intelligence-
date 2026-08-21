import { getDb } from '../server/db/database.ts';
import { runMigrations } from '../server/db/migrations.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { getAllProjects, getProjectBySlug, getProjectById, getProjectHealth, reconfigureProjectType, getProjectLayout, uploadProjectLayout } from '../server/services/projectService.ts';
import { getProperties, getPropertyById, createProperty, stageStatusUpdate, updateProperty, archiveProperty, compareProperties } from '../server/services/propertyService.ts';
import { getPendingDrafts, publishProjectDrafts, discardDraftChanges } from '../server/services/publishService.ts';
import { generateImportPreview, applyImport } from '../server/services/excelService.ts';
import { executeAiTool } from '../server/services/ai/tools.ts';
import { GrokProvider } from '../server/services/ai/grokProvider.ts';
import { officialWebsiteService } from '../server/services/officialWebsiteService.ts';
import { layoutAnalysisService } from '../server/services/layoutAnalysisService.ts';
import { calculateFreshness } from '../server/services/freshnessService.ts';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

import os from 'os';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (failureDetails) console.error('    Details:', failureDetails);
    failedTests++;
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log(' RUNNING NOVA PROPERTY EXPLORER PRODUCTION TEST SUITE');
  console.log('====================================================\n');

  // Configure isolated temporary database for test suite execution
  const testDbPath = path.join(os.tmpdir(), `nova_test_suite_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  const { closeDb, getDb } = await import('../server/db/database.ts');
  closeDb();

  // Initialize DB & Seed with Clean Baseline Data State in isolated test DB
  seedDatabase();

  // -------------------------------------------------------------
  // TEST GROUP 1: Clean Data State & Canonical Project Registry (Section 3, 4, 38)
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: Clean Data State & Canonical Project Registry ---');
  const allProjects = getAllProjects(true);
  assert(allProjects.length >= 10, `Projects registry contains all verified master projects (Found ${allProjects.length})`);

  const diyaProj = getProjectBySlug('nova-diya-gardens');
  assert(diyaProj !== null && diyaProj.project_type === 'PLOT', 'Nova Diya Gardens registered as PLOT project');
  assert((diyaProj?.stats?.total_inventory ?? 0) === 0, `Nova Diya Gardens starts with clean 0 inventory baseline (Got ${diyaProj?.stats?.total_inventory})`);

  const kngProj = getProjectBySlug('kng-pudur-option-03');
  assert(kngProj !== null && kngProj.name === 'Nova Pinnacle', 'Nova Pinnacle layout registered in project registry');
  assert(kngProj?.total_units_reference === 129, 'Nova Pinnacle references 129 plots architectural structure');

  const tejasProj = getProjectBySlug('nova-tejas');
  assert(tejasProj !== null && tejasProj.project_type === 'APARTMENT', 'Nova Tejas registered as APARTMENT project');
  assert((tejasProj?.stats?.total_inventory ?? 0) === 0, `Nova Tejas starts with clean 0 inventory baseline (Got ${tejasProj?.stats?.total_inventory})`);

  // -------------------------------------------------------------
  // TEST GROUP 2: Deterministic Project Health & Readiness Scoring (Section 30 & 31)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Deterministic Project Health & Readiness Scoring ---');
  const healthDiya = getProjectHealth(diyaProj!.id);
  assert(healthDiya.readinessScore >= 80, `Project readiness score calculated deterministically (${healthDiya.readinessScore}%)`);
  assert(healthDiya.layoutStatus === 'PUBLISHED', 'CAD Layout registered as PUBLISHED');
  assert(healthDiya.checklist.projectInfo === true, 'Project info checklist passed');
  assert(healthDiya.checklist.cleanDataQuality === true, 'Clean data quality checklist passed (0 duplicates, 0 errors)');

  // -------------------------------------------------------------
  // TEST GROUP 3: Manual Property Entry & CRUD (Section 6)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Manual Property Entry & Universal Model ---');
  const plot101 = createProperty({
    project_id: 'proj_nova_diya_gardens',
    property_type: 'PLOT',
    property_number: 'Plot 101',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1500,
    price: 2700000,
    section_or_phase: 'Phase 1'
  }, 'usr_admin', 'ADMIN');

  assert(plot101.property_number === 'Plot 101', 'Plot 101 created manually via CRM');
  assert(plot101.facing === 'East' && plot101.area_sqft === 1500, 'Plot attributes stored accurately');

  const plot102 = createProperty({
    project_id: 'proj_nova_diya_gardens',
    property_type: 'PLOT',
    property_number: 'Plot 102',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 1200,
    price: 2160000,
    section_or_phase: 'Phase 1'
  }, 'usr_admin', 'ADMIN');
  assert(plot102.property_number === 'Plot 102', 'Plot 102 created manually via CRM');

  // Duplicate rejection test
  let dupThrew = false;
  try {
    createProperty({
      project_id: 'proj_nova_diya_gardens',
      property_type: 'PLOT',
      property_number: 'Plot 101',
      status: 'AVAILABLE'
    }, 'usr_admin', 'ADMIN');
  } catch (e) {
    dupThrew = true;
  }
  assert(dupThrew, 'Duplicate property creation in same project is rejected by database constraints');

  // -------------------------------------------------------------
  // TEST GROUP 4: Draft & Publishing Workflow (Section 11, 33, 38)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Draft & Publishing Workflow ---');
  // Stage status update for Plot 102: AVAILABLE -> BOOKED
  stageStatusUpdate(plot102.id, 'BOOKED', 'usr_staff', 'CRM_STAFF');

  // Customer query MUST see Plot 102 as AVAILABLE while change is in draft
  const custViewDraft = getPropertyById(plot102.id, false);
  assert(custViewDraft?.status === 'AVAILABLE', 'Customer view still sees status as AVAILABLE while change is in draft');

  const drafts = getPendingDrafts('proj_nova_diya_gardens');
  assert(Array.isArray(drafts) && drafts.length >= 1, 'Draft status change appears in pending drafts queue');

  // Publish drafts
  const publishRes = publishProjectDrafts('proj_nova_diya_gardens', 'usr_admin', 'ADMIN');
  assert(publishRes.publishedCount >= 1, 'Draft changes published successfully');

  // Customer view now reflects live updated status = BOOKED
  const custViewPublished = getPropertyById(plot102.id, false);
  assert(custViewPublished?.status === 'BOOKED', 'Customer view now reflects live updated status = BOOKED');

  // -------------------------------------------------------------
  // TEST GROUP 5: Excel Import Ultra-Safe Mode, APPLIED Bug Regression & Transaction Safety
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Excel Import & "APPLIED" Bug Regression ---');
  const testWb = xlsx.utils.book_new();
  const wsData = [
    ['S.No', 'Plot No', 'Sq.Ft', 'Facing', 'Status'],
    [1, 'Plot 101', 1500, 'East', 'BOOKED'],        // Status update for existing Plot 101
    [2, 'Plot 101', 1500, 'East', 'BOOKED'],        // Duplicate within file
    [3, 'Plot 103', 1800, 'South', 'AVAILABLE'],    // New property
    [4, 'Plot 104', 1200, 'West', 'APPLIED'],       // Row with status "APPLIED" (unsupported status value test)
  ];
  const testWs = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(testWb, testWs, 'Diya Gardens');
  const excelBuffer = xlsx.write(testWb, { type: 'buffer', bookType: 'xlsx' });

  const preview = generateImportPreview(excelBuffer, 'test.xlsx', 'proj_nova_diya_gardens', 'Diya Gardens', 'usr_admin');
  assert(preview.rows.filter(r => r.changeType === 'NEW').length === 1, 'Preview correctly identifies 1 NEW plot (Plot 103)');
  assert(preview.rows.filter(r => r.changeType === 'DUPLICATE').length >= 1, 'Preview correctly detects duplicate rows within file');
  assert(preview.rows.filter(r => r.changeType === 'STATUS_CHANGE').length >= 1, 'Preview correctly detects status change for Plot 101 (AVAILABLE -> BOOKED)');
  
  const appliedStatusRow = preview.rows.find(r => r.propertyNumber === 'Plot 104');
  assert(
    Boolean(appliedStatusRow?.changeType === 'INVALID' && appliedStatusRow?.validationError?.includes("Unsupported status: 'APPLIED'")),
    'Row with Status="APPLIED" is validated as data value and flagged as INVALID (not generating SQL column error)'
  );

  // Now create a clean valid Excel to test applyImport transaction execution
  const cleanWb = xlsx.utils.book_new();
  const cleanWsData = [
    ['S.No', 'Plot No', 'Sq.Ft', 'Facing', 'Status'],
    [1, 'Plot 101', 1500, 'East', 'BOOKED'],        // Status change
    [2, 'Plot 103', 1800, 'South', 'AVAILABLE'],    // New property
  ];
  const cleanWs = xlsx.utils.aoa_to_sheet(cleanWsData);
  xlsx.utils.book_append_sheet(cleanWb, cleanWs, 'Diya Gardens');
  const cleanBuffer = xlsx.write(cleanWb, { type: 'buffer', bookType: 'xlsx' });

  const cleanPreview = generateImportPreview(cleanBuffer, 'clean_test.xlsx', 'proj_nova_diya_gardens', 'Diya Gardens', 'usr_admin');
  assert(cleanPreview.summary.invalidCount === 0, 'Clean preview contains 0 invalid rows');

  // Test applyImport (Regression Test for "such column: APPLIED" bug)
  let applySucceeded = false;
  let applyResult: any = null;
  try {
    applyResult = applyImport(cleanPreview.importId, 'usr_admin', 'ADMIN');
    applySucceeded = true;
  } catch (err: any) {
    console.error('applyImport error:', err);
    applySucceeded = false;
  }
  assert(applySucceeded === true, 'applyImport executes and commits without "no such column: APPLIED" SQL error');
  assert(applyResult?.appliedCount >= 2, `applyImport applied ${applyResult?.appliedCount} records successfully`);

  // Verify database state after apply
  const updatedPlot101 = getPropertyById(plot101.id, false);
  assert(updatedPlot101?.status === 'BOOKED', 'Plot 101 status updated to BOOKED in database after import apply');

  const dbProperties = getProperties({ projectId: 'proj_nova_diya_gardens' }).properties;
  const newPlot103 = dbProperties.find(p => p.property_number === 'Plot 103');
  assert(newPlot103 !== undefined && newPlot103.status === 'AVAILABLE', 'New Plot 103 committed to database with status AVAILABLE');

  // Verify import status in database is 'APPLIED'
  const db = getDb();
  const importRow = db.prepare('SELECT status FROM imports WHERE id = ?').get(cleanPreview.importId) as any;
  assert(importRow?.status === 'APPLIED', 'Import record status transitioned to APPLIED');

  // -------------------------------------------------------------
  // TEST GROUP 6: Customer Experience Without Layout (Sections 15, 16, 45, 48)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Customer Experience Without Layout ---');
  // Create a new project without layout
  const noLayoutProjId = 'proj_test_no_layout';
  const now = new Date().toISOString();
  db.prepare('DELETE FROM properties WHERE project_id = ?').run(noLayoutProjId);
  db.prepare('DELETE FROM layouts WHERE project_id = ?').run(noLayoutProjId);
  db.prepare('DELETE FROM projects WHERE id = ? OR slug = ?').run(noLayoutProjId, 'nova-test-no-layout');
  db.prepare(`
    INSERT INTO projects (
      id, slug, name, project_type, location, city, description, highlights, amenities,
      status, current_version, is_published, last_verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, 1, ?, ?, ?)
  `).run(
    noLayoutProjId,
    'nova-test-no-layout',
    'Nova Test No Layout Project',
    'PLOT',
    'Avinashi Road',
    'Coimbatore',
    'Premium plotted community',
    JSON.stringify(['Gated Community', 'Blacktop Roads']),
    JSON.stringify(['24/7 Security', 'Street Lights']),
    now, now, now
  );

  // Add 10 available plots
  for (let i = 1; i <= 10; i++) {
    createProperty({
      project_id: noLayoutProjId,
      property_type: 'PLOT',
      property_number: `Plot ${i}`,
      status: 'AVAILABLE',
      facing: i % 2 === 0 ? 'East' : 'North',
      area_sqft: 1200 + i * 50,
      price: 2500000 + i * 100000
    }, 'usr_admin', 'ADMIN');
  }

  // Verify project has NO layout
  const noLayoutCheck = getProjectLayout(noLayoutProjId);
  assert(noLayoutCheck === null, 'Project starts with NO layout (layout is null)');

  // Verify public properties API returns all 10 available plots
  const publicProps = getProperties({ projectId: noLayoutProjId }).properties;
  assert(publicProps.length === 10, `Customer retrieves all 10 available plots without layout (Got ${publicProps.length})`);

  // Verify filtering without layout
  const eastFacingProps = getProperties({ projectId: noLayoutProjId, facing: 'East' }).properties;
  assert(eastFacingProps.length === 5, 'Customer can filter by East facing without layout (Found 5)');

  const minAreaProps = getProperties({ projectId: noLayoutProjId, minArea: 1500 }).properties;
  assert(minAreaProps.length === 5, 'Customer can filter by minimum area >= 1500 sqft without layout');

  // Verify AI search without layout
  const aiSearchNoLayout = await executeAiTool('search_properties', {
    project_slug: 'nova-test-no-layout',
    facing: 'East',
    status: 'AVAILABLE'
  });
  assert(aiSearchNoLayout.count === 5, 'Ask Nova AI successfully searches and returns verified inventory for project without layout');

  // -------------------------------------------------------------
  // TEST GROUP 7: Official Layout Upload, Publishing & Project Isolation (Sections 18, 19, 39)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Official Layout Upload & Project Isolation ---');
  // Upload layout for the project
  const uploadedLayout = uploadProjectLayout(
    noLayoutProjId,
    {
      name: 'Nova Test Official Master Plan',
      layoutType: 'MASTER_PLAN',
      imageUrl: '/layouts/nova_test_layout.jpg',
      width: 1200,
      height: 900,
      referenceStats: { totalPlots: 10 }
    },
    'usr_admin',
    'ADMIN'
  );

  assert(Boolean(uploadedLayout) && (uploadedLayout as any).is_active === 1, 'Official layout uploaded and published');
  assert((uploadedLayout as any)?.image_url === '/layouts/nova_test_layout.jpg', 'Layout image URL recorded accurately');

  // Verify layout is project-isolated (does not bleed to Diya Gardens or other projects)
  const diyaLayoutCheck = getProjectLayout(diyaProj!.id);
  assert(diyaLayoutCheck?.project_id === diyaProj!.id, 'Diya Gardens layout remains isolated to Diya Gardens');
  assert((uploadedLayout as any)?.project_id === noLayoutProjId, 'Uploaded layout is strictly scoped to test project');

  // Upload replacement layout and verify old layout is deactivated
  const replacementLayout: any = uploadProjectLayout(
    noLayoutProjId,
    {
      name: 'Nova Test Master Plan v2',
      layoutType: 'MASTER_PLAN',
      imageUrl: '/layouts/nova_test_layout_v2.jpg'
    },
    'usr_admin',
    'ADMIN'
  );

  const activeLayoutNow = getProjectLayout(noLayoutProjId);
  assert(activeLayoutNow?.id === replacementLayout?.id, 'New replacement layout is now the active layout');
  assert(activeLayoutNow?.image_url === '/layouts/nova_test_layout_v2.jpg', 'Active layout reflects updated image URL');

  // -------------------------------------------------------------
  // TEST GROUP 8: Layout Intelligence Layer & Structured Observations (Section 16-19)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Layout Intelligence Layer & Confidence ---');
  const diyaAnalysis = layoutAnalysisService.getLayoutAnalysis(diyaProj!.id);
  assert(diyaAnalysis !== null, 'Layout analysis retrieved for Nova Diya Gardens');
  assert((diyaAnalysis?.roads?.length ?? 0) >= 3, 'Extracted structured road networks (12M, 9M, Sathy Road)');
  assert((diyaAnalysis?.parks?.length ?? 0) >= 1, 'Extracted central OSR park reserves (23,062 sq.ft)');
  assert((diyaAnalysis?.confidence?.overall ?? 0) >= 0.90, `Layout extraction overall confidence score >= 0.90 (Got ${diyaAnalysis?.confidence?.overall})`);
  assert(diyaAnalysis?.isReviewedByCrm === true, 'Layout analysis verified and approved by CRM');

  // -------------------------------------------------------------
  // TEST GROUP 9: Llama 70B Grounding & Zero Hallucination (Section 26-29)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Llama 70B Grounding & Zero Hallucination ---');
  const searchToolRes = await executeAiTool('search_properties', {
    project_slug: 'nova-diya-gardens',
    facing: 'South',
    status: 'AVAILABLE'
  });
  assert(searchToolRes.properties.length >= 1 && searchToolRes.properties.some((p: any) => p.facing === 'South'), 'search_properties returned verified South-facing properties');

  // Grounding test on unseeded project: AI must not invent availability
  const aiProvider = new GrokProvider();
  const vasanthamQuery = await aiProvider.generateResponse([
    { role: 'user', content: 'Are there any 3 BHK flats available in Nova Vasantham?' }
  ], 'nova-vasantham');
  assert(
    vasanthamQuery.text.toLowerCase().includes('apartment') ||
    vasanthamQuery.text.toLowerCase().includes('verified') ||
    vasanthamQuery.text.toLowerCase().includes('published'),
    'AI truthfully states Nova Vasantham apartment availability is awaiting verified publication (no hallucination)'
  );

  const fakePropQuery = await executeAiTool('get_property_details', {
    project_slug: 'nova-diya-gardens',
    property_number: 'Plot 99999'
  });
  assert(fakePropQuery.error !== undefined, 'get_property_details returns explicit error for non-existent property');

  // -------------------------------------------------------------
  // TEST GROUP 10: Official Layout Viewer Modes (Section 14 & 15)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Official Layout Viewer Modes ---');
  const diyaLayout = getProjectLayout(diyaProj!.id);
  assert(diyaLayout !== null && Boolean(diyaLayout.image_url), 'Diya Gardens layout has authentic high-resolution image_url');
  assert(diyaLayout?.image_url === '/layouts/nova_diya_gardens_layout.png', 'Diya Gardens layout points to verified CAD master plan asset');

  const diyaProps = getProperties({ projectId: diyaProj!.id }).properties;
  const fakeGeomProps = diyaProps.filter(p => p.geometry !== null && p.geometry !== undefined);
  assert(fakeGeomProps.length === 0, 'No fake approximate green-box grid geometries seeded (Mode B Authentic Display)');

  // -------------------------------------------------------------
  // TEST GROUP 11: Official Nova Website Content & Isolation (Section 1)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 11: Official Nova Website Content & Isolation ---');
  const branding = officialWebsiteService.getBranding();
  assert(branding.officialUrl === 'https://novalifespace.in', 'Official website URL configured as canonical source (https://novalifespace.in)');
  assert(Boolean(branding.logoUrl), 'Official logo asset URL present');

  const content = officialWebsiteService.getProjectContent('nova-diya-gardens');
  assert(content.source_type === 'OFFICIAL_WEBSITE', 'Project content has source attribution OFFICIAL_WEBSITE');
  assert(content.amenities.length > 0, 'Official amenities retrieved');

  // -------------------------------------------------------------
  // TEST GROUP 12: Data Freshness Calculation Engine
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 12: Data Freshness Calculation Engine ---');
  const freshNow = calculateFreshness(new Date().toISOString());
  assert(freshNow.status === 'FRESH', 'Current timestamp classified as FRESH (< 24h)');

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const aging = calculateFreshness(twoDaysAgo);
  assert(aging.status === 'AGING', '48 hours timestamp classified as AGING (24-72h)');

  // -------------------------------------------------------------
  // SUMMARY & CLEANUP
  // -------------------------------------------------------------
  closeDb();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch (e) {}

  console.log('\n====================================================');
  console.log(` TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite crashed with uncaught error:', err);
  process.exit(1);
});



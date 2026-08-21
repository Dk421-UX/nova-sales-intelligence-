import { getSupabaseAdmin } from '../server/db/supabaseClient.ts';
import { createProject, updateProject, getProjectById, uploadProjectLayout, getProjectLayout, deleteProject } from '../server/services/projectService.ts';
import { createProperty, updateProperty, getPropertyById, getProperties } from '../server/services/propertyService.ts';
import { uploadLayoutToStorage } from '../server/services/storageService.ts';
import { generateImportPreview, applyImport } from '../server/services/excelService.ts';
import { closeDb, getDb } from '../server/db/database.ts';
import { initAndSyncFromSupabase } from '../server/db/supabaseSync.ts';
import * as xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config();

async function runStrictEndToEndPersistenceTest() {
  console.log('========================================================================');
  console.log(' SECTION 21: STRICT END-TO-END SUPABASE PERSISTENCE & LIFECYCLE TEST');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: any) {
    if (condition) {
      console.log(`  ✓ PASS: ${title}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${title}`);
      if (details) console.error('    Details:', details);
      failed++;
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase client is not available. Check SUPABASE_URL and SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  }

  // Pre-cleanup in case of previous run
  console.log('--- PHASE 0: PRE-TEST INITIALIZATION & CLEANUP ---');
  const db = getDb();
  db.prepare("DELETE FROM properties WHERE property_number IN ('PERSIST-001', 'PERSIST-002')").run();
  db.prepare("DELETE FROM layouts WHERE name = 'PERSISTENCE_VERIFY_LAYOUT'").run();
  db.prepare("DELETE FROM projects WHERE name = 'PERSISTENCE_VERIFY'").run();

  await supabase.from('properties').delete().eq('property_number', 'PERSIST-001');
  await supabase.from('properties').delete().eq('property_number', 'PERSIST-002');
  await supabase.from('layouts').delete().eq('name', 'PERSISTENCE_VERIFY_LAYOUT');
  await supabase.from('projects').delete().eq('name', 'PERSISTENCE_VERIFY');

  // PHASE 1: CREATE CONTROLLED RECORD

  console.log('\n--- PHASE 1: CREATE CONTROLLED PROJECT & PROPERTY ---');
  const project = createProject({
    name: 'PERSISTENCE_VERIFY',
    project_type: 'PLOT',
    location: 'Coimbatore Growth Hub',
    city: 'Coimbatore',
    description: 'Persistence verification project for Render lifecycle test.',
    is_published: true
  }, 'usr_admin', 'ADMIN');

  assert(Boolean(project && project.id), 'Project PERSISTENCE_VERIFY created in CRM');
  const projectId = project!.id;

  // Small delay to ensure foreign key project record is written to Supabase
  await new Promise(r => setTimeout(r, 600));

  const property = createProperty({
    project_id: projectId,
    property_type: 'PLOT',
    property_number: 'PERSIST-001',
    status: 'AVAILABLE',
    facing: 'East',
    area_sqft: 1500,
    price: 3000000,
    section_or_phase: 'Phase 1'
  }, 'usr_admin', 'ADMIN');

  assert(Boolean(property && property.id), 'Property PERSIST-001 created in CRM with status AVAILABLE');
  const propertyId = property.id;

  // Small delay for property sync settle
  await new Promise(r => setTimeout(r, 600));

  // PHASE 2: UPLOAD LAYOUT TO SUPABASE STORAGE
  console.log('\n--- PHASE 2: UPLOAD LAYOUT TO SUPABASE STORAGE & POSTGRESQL ---');
  const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800"><rect width="1000" height="800" fill="#f0f9ff"/><text x="500" y="400" text-anchor="middle" font-size="24">PERSISTENCE_VERIFY_LAYOUT</text></svg>';
  const svgBuffer = Buffer.from(sampleSvg, 'utf-8');

  const storageRes = await uploadLayoutToStorage(projectId, svgBuffer, 'PERSISTENCE_VERIFY_LAYOUT.svg', 'image/svg+xml');
  assert(storageRes.success && Boolean(storageRes.publicUrl), 'Layout asset uploaded to Supabase Storage with permanent URL', storageRes.error);

  const layout = uploadProjectLayout(
    projectId,
    {
      name: 'PERSISTENCE_VERIFY_LAYOUT',
      layoutType: 'MASTER_PLAN',
      imageUrl: storageRes.publicUrl,
      svgContent: sampleSvg,
      status: 'PUBLISHED'
    },
    'usr_admin',
    'ADMIN'
  );
  assert(Boolean(layout && layout.id), 'Layout metadata committed to PostgreSQL');

  await new Promise(r => setTimeout(r, 600));

  // Direct Supabase PostgreSQL Verification
  const { data: supaProj } = await supabase.from('projects').select('*').eq('id', projectId).single();
  const { data: supaProp } = await supabase.from('properties').select('*').eq('id', propertyId).single();
  const { data: supaLay } = await supabase.from('layouts').select('*').eq('id', layout.id).single();

  assert(Boolean(supaProj && supaProj.name === 'PERSISTENCE_VERIFY'), 'Direct Supabase check: project exists in PostgreSQL');
  assert(Boolean(supaProp && supaProp.property_number === 'PERSIST-001' && supaProp.status === 'AVAILABLE'), 'Direct Supabase check: property exists with status AVAILABLE');
  assert(Boolean(supaLay && supaLay.image_url === storageRes.publicUrl), 'Direct Supabase check: layout metadata points to Supabase Storage');

  // PHASE 3: CRM MUTATIONS (STATUS -> BOOKED, CITY -> Chennai)
  console.log('\n--- PHASE 3: CRM MUTATIONS & CUSTOMER API VERIFICATION ---');
  updateProperty(propertyId, { status: 'BOOKED' }, 'usr_admin', 'ADMIN');
  updateProject(projectId, { city: 'Chennai', location: 'Chennai Growth Hub' }, 'usr_admin', 'ADMIN');

  await new Promise(r => setTimeout(r, 600));

  // Customer API Read Verification
  const customerProj = getProjectById(projectId, false);
  const customerProp = getPropertyById(propertyId, false);

  assert(customerProp?.status === 'BOOKED', 'Customer API returns status BOOKED');
  assert(customerProj?.city === 'Chennai', 'Customer API returns city Chennai');

  // Direct Supabase Verification of Mutations
  const { data: supaPropUpdated } = await supabase.from('properties').select('*').eq('id', propertyId).single();
  const { data: supaProjUpdated } = await supabase.from('projects').select('*').eq('id', projectId).single();
  assert(supaPropUpdated?.status === 'BOOKED', 'Direct Supabase check: status updated to BOOKED in PostgreSQL');
  assert(supaProjUpdated?.city === 'Chennai', 'Direct Supabase check: city updated to Chennai in PostgreSQL');

  // PHASE 4: SIMULATE BACKEND RESTART & RE-HYDRATION
  console.log('\n--- PHASE 4: SIMULATE BACKEND RESTART / SLEEP-WAKE ---');
  closeDb(); // Close connection
  await initAndSyncFromSupabase(); // Hydrate authoritative state on wake-up

  const restartedProj = getProjectById(projectId, false);
  const restartedProp = getPropertyById(propertyId, false);
  const restartedLayout = getProjectLayout(projectId);

  assert(Boolean(restartedProj && restartedProj.city === 'Chennai'), 'After Restart: project still exists with city Chennai');
  assert(Boolean(restartedProp && restartedProp.status === 'BOOKED'), 'After Restart: property still exists with status BOOKED');
  assert(Boolean(restartedLayout && restartedLayout.image_url === storageRes.publicUrl), 'After Restart: layout still exists and loads from Supabase Storage');

  // PHASE 5: EXCEL IMPORT (ADDING PERSIST-002)
  console.log('\n--- PHASE 5: EXCEL IMPORT (ADD PERSIST-002) ---');
  const excelData = [
    ['Plot No', 'Status', 'Facing', 'Area Sq.Ft', 'Section'],
    ['PERSIST-002', 'Available', 'North', 1800, 'Phase 1']
  ];
  const ws = xlsx.utils.aoa_to_sheet(excelData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Inventory');
  const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const preview = generateImportPreview(excelBuffer, 'test_persist_inventory.xlsx', projectId, 'Inventory', 'usr_admin');
  assert(Boolean(preview && preview.importId), 'Excel preview generated for PERSIST-002');

  const applyRes = await applyImport(preview.importId, 'usr_admin', 'ADMIN');
  assert(applyRes.success && applyRes.appliedCount >= 1, `Excel applied ${applyRes.appliedCount} rows successfully`);

  // Verify PERSIST-001 remains BOOKED and PERSIST-002 exists
  const allProps = getProperties({ projectId, limit: 100 }).properties;
  const p1 = allProps.find(p => p.property_number === 'PERSIST-001');
  const p2 = allProps.find(p => p.property_number === 'PERSIST-002');

  assert(Boolean(p1 && p1.status === 'BOOKED'), 'Excel apply preserved existing PERSIST-001 as BOOKED without deletion');
  assert(Boolean(p2 && p2.status === 'AVAILABLE'), 'Excel apply added new property PERSIST-002 as AVAILABLE');

  // Direct Supabase Verification of Excel Import
  const { data: supaPropsAfterExcel } = await supabase.from('properties').select('*').eq('project_id', projectId);
  const supaP1 = (supaPropsAfterExcel || []).find(p => p.property_number === 'PERSIST-001');
  const supaP2 = (supaPropsAfterExcel || []).find(p => p.property_number === 'PERSIST-002');

  assert(Boolean(supaP1 && supaP1.status === 'BOOKED'), 'Supabase PostgreSQL: PERSIST-001 remains BOOKED');
  assert(Boolean(supaP2 && supaP2.status === 'AVAILABLE'), 'Supabase PostgreSQL: PERSIST-002 exists and is AVAILABLE');


  // PHASE 6: SIMULATE REDEPLOYMENT / COLD START
  console.log('\n--- PHASE 6: SIMULATE REDEPLOYMENT / COLD START ---');
  closeDb();
  await initAndSyncFromSupabase();

  const finalProps = getProperties({ projectId, limit: 100 }).properties;
  const finalP1 = finalProps.find(p => p.property_number === 'PERSIST-001');
  const finalP2 = finalProps.find(p => p.property_number === 'PERSIST-002');
  const finalLayout = getProjectLayout(projectId);

  assert(Boolean(finalP1 && finalP1.status === 'BOOKED'), 'After Redeploy: PERSIST-001 remains BOOKED');
  assert(Boolean(finalP2 && finalP2.status === 'AVAILABLE'), 'After Redeploy: PERSIST-002 remains AVAILABLE');
  assert(Boolean(finalLayout && finalLayout.image_url === storageRes.publicUrl), 'After Redeploy: layout remains accessible from Supabase Storage');

  // PHASE 7: CLEANUP TEST RECORDS ONLY
  console.log('\n--- PHASE 7: CLEANUP TEST RECORDS ONLY ---');
  deleteProject(projectId, 'usr_admin', 'ADMIN');
  await supabase.from('properties').delete().eq('project_id', projectId);
  await supabase.from('layouts').delete().eq('project_id', projectId);
  await supabase.from('projects').delete().eq('id', projectId);
  await supabase.storage.from('layouts').remove([storageRes.storagePath]);

  console.log('\n========================================================================');
  console.log(` STRICT PERSISTENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStrictEndToEndPersistenceTest().catch(err => {
  console.error('[Strict Persistence Test FATAL Error]:', err);
  process.exit(1);
});

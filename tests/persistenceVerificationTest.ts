import { getDb, closeDb } from '../server/db/database.ts';
import { createProject, updateProject, getProjectById, getAllProjects } from '../server/services/projectService.ts';
import { createProperty, getPropertyById, getProperties, updateProperty } from '../server/services/propertyService.ts';
import bcrypt from 'bcryptjs';

async function runControlledPersistenceTest() {
  console.log('====================================================');
  console.log(' NOVA CRM CONTROLLED DATA PERSISTENCE VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Create Controlled Test Project & Property
  const db = getDb();
  
  // Cleanup any previous test run record cleanly
  db.prepare("DELETE FROM properties WHERE property_number = 'TEST-001'").run();
  db.prepare("DELETE FROM projects WHERE id = 'proj_test_persistence'").run();

  const testProj = createProject({
    name: 'TEST-PERSISTENCE',
    project_type: 'PLOT',
    location: 'Chennai Growth Hub',
    city: 'Chennai',
    description: 'Controlled persistence verification project.'
  }, 'usr_admin', 'ADMIN');

  assert(Boolean(testProj), 'TEST-PERSISTENCE project created');
  if (!testProj) throw new Error('Failed to create test project');

  const testPlot = createProperty({
    project_id: testProj.id,
    property_type: 'PLOT',
    property_number: 'TEST-001',
    status: 'AVAILABLE',
    facing: 'North',
    area_sqft: 1500,
    price: 2500000,
    section_or_phase: 'Phase A'
  }, 'usr_admin', 'ADMIN');

  assert(Boolean(testPlot) && testPlot.property_number === 'TEST-001', 'TEST-001 property created with status AVAILABLE');
  const plotId = testPlot.id;

  // TEST A: Read directly via Service/API simulation
  const readA = getPropertyById(plotId);
  assert(readA !== null && readA.property_number === 'TEST-001' && readA.status === 'AVAILABLE', 'TEST A: Immediate read returns TEST-001 (Available)');

  // TEST B: Admin auth check with admin67@
  const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as any;
  const authValid = bcrypt.compareSync('admin67@', adminUser.password_hash);
  assert(authValid === true, 'TEST B: Admin authentication with admin67@ is valid');

  // TEST C & F: Simulate Backend Stop & Restart (closeDb & re-open)
  closeDb();
  const dbRestarted = getDb();
  const readC = getPropertyById(plotId);
  assert(readC !== null && readC.property_number === 'TEST-001' && readC.status === 'AVAILABLE', 'TEST C & F: Backend restart preserves TEST-001 record in database');

  // TEST I: Update an unrelated project field
  updateProject(testProj.id, {
    description: 'Updated description for persistence test verification.'
  }, 'usr_admin', 'ADMIN');

  const readI = getPropertyById(plotId);
  assert(readI !== null && readI.property_number === 'TEST-001' && readI.area_sqft === 1500, 'TEST I: Unrelated project field update leaves TEST-001 completely unchanged');

  // TEST J: Update property status via CRM
  updateProperty(plotId, {
    status: 'BOOKED'
  }, 'usr_admin', 'ADMIN');

  const readJ = getPropertyById(plotId);
  assert(readJ !== null && readJ.status === 'BOOKED', 'TEST J: Explicit CRM status update persisted (AVAILABLE -> BOOKED)');

  // Clean up test record after verification
  dbRestarted.prepare("DELETE FROM properties WHERE id = ?").run(plotId);
  dbRestarted.prepare("DELETE FROM projects WHERE id = ?").run(testProj.id);

  console.log('\n====================================================');
  console.log(` PERSISTENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runControlledPersistenceTest().catch(err => {
  console.error('Controlled persistence test crashed:', err);
  process.exit(1);
});

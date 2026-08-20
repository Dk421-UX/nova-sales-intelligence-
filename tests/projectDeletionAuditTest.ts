import { getDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { createProject, deleteProject, getProjectById } from '../server/services/projectService.ts';
import { getAuditLogs } from '../server/services/auditService.ts';

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

async function runTest() {
  console.log('====================================================');
  console.log(' RUNNING PROJECT DELETION & AUDIT LOG VERIFICATION TEST');
  console.log('====================================================\n');

  seedDatabase();
  const db = getDb();

  // Test 1: Create a test project with properties, layout, and enquiries
  console.log('--- TEST 1: Project Setup & Creation ---');
  const newProj = createProject({
    name: 'Nova Deletion Test Project',
    project_type: 'PLOT',
    location: 'Vandalur',
    city: 'Chennai',
    description: 'Temporary project to test clean deletion and audit log recording.'
  }, 'usr_admin', 'ADMIN');

  assert(Boolean(newProj), 'Test project created successfully');
  if (!newProj) throw new Error('Test project was not created');
  const projId = newProj.id;

  // Insert a property for this project
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO properties (
      id, project_id, property_type, property_number, status, area_sqft, last_verified_at, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('prop_test_del_1', projId, 'PLOT', '101', 'AVAILABLE', 1200, now, now, now, now);

  // Insert an enquiry for this project
  db.prepare(`
    INSERT INTO enquiries (
      id, project_id, customer_name, customer_phone, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run('enq_test_del_1', projId, 'Test Customer', '9876543210', now);

  // Test 2: Successful Project Deletion & Foreign Key Integrity
  console.log('\n--- TEST 2: Successful Project Deletion & Foreign Key Integrity ---');
  let deleteResult: any = null;
  try {
    deleteResult = deleteProject(projId, 'usr_admin', 'ADMIN');
  } catch (err: any) {
    console.error('Delete threw error:', err);
    assert(false, `deleteProject threw unexpected error: ${err.message}`);
  }

  assert(deleteResult !== null && deleteResult.success, 'deleteProject completed with success = true');
  const lookupDeleted = getProjectById(projId, true);
  assert(lookupDeleted === null, 'Project row is completely removed from projects table');

  // Verify dependent properties and enquiries were deleted
  const propsRemaining = db.prepare('SELECT COUNT(*) as count FROM properties WHERE project_id = ?').get(projId) as any;
  assert(propsRemaining.count === 0, 'Dependent properties were removed');

  const enqsRemaining = db.prepare('SELECT COUNT(*) as count FROM enquiries WHERE project_id = ?').get(projId) as any;
  assert(enqsRemaining.count === 0, 'Dependent enquiries were removed');

  // Test 3: Audit Log Verification
  console.log('\n--- TEST 3: Audit Log Record Creation & Data Preservation ---');
  const logs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE entity_type = 'PROJECT' AND entity_id = ? AND action = 'DELETE'
  `).all(projId) as any[];

  assert(logs.length === 1, 'Exactly one DELETE audit log was recorded');
  const deleteLog = logs[0];
  assert(deleteLog.project_id === null, 'audit_logs.project_id is safely NULL to satisfy foreign key constraint');
  assert(deleteLog.performed_by === 'usr_admin', 'performed_by recorded correctly');
  assert(deleteLog.user_role === 'ADMIN', 'user_role recorded correctly');

  const oldValues = JSON.parse(deleteLog.old_values);
  assert(oldValues.name === 'Nova Deletion Test Project', 'Deleted project name is preserved in audit log old_values');
  assert(oldValues.location === 'Vandalur', 'Deleted project location is preserved in audit log old_values');
  assert(oldValues.slug.startsWith('nova-deletion-test-project'), 'Deleted project slug is preserved in audit log old_values');

  // Test 4: Failed Deletion Rollback Test
  console.log('\n--- TEST 4: Failed Deletion Rollback Integrity ---');
  let nonExistentFailed = false;
  try {
    deleteProject('proj_non_existent_id_9999', 'usr_admin', 'ADMIN');
  } catch (err) {
    nonExistentFailed = true;
  }
  assert(nonExistentFailed, 'Attempt to delete non-existent project fails cleanly with exception');

  // Test 5: Foreign key constraint enforcement is ACTIVE and functioning
  console.log('\n--- TEST 5: Active Foreign Key Enforcement Verification ---');
  const fkState = db.prepare('PRAGMA foreign_keys').get() as any;
  assert(Boolean(fkState.foreign_keys), 'PRAGMA foreign_keys is strictly ON (1)');

  console.log('\n====================================================');
  console.log(' ALL 5 PROJECT DELETION & AUDIT CHECKS PASSED');
  console.log('====================================================\n');
}

runTest();

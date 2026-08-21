import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { crmRouter } from '../server/routes/crmApi.ts';
import jwt from 'jsonwebtoken';
import { config } from '../server/config.ts';

async function runAuthSuite() {
  console.log('====================================================');
  console.log('    NOVA CRM AUTHENTICATION REGRESSION SUITE        ');
  console.log('====================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_auth_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  // Initialize isolated test database
  closeDb();
  seedDatabase();

  const app = express();
  app.use(express.json());
  app.use('/api/crm', crmRouter);

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/crm`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: any) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}`);
      if (details) console.error('   Details:', details);
      failed++;
    }
  }

  try {
    // 1. Valid Admin Login with Username & New Password (admin67@)
    const res1 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin67@' })
    });
    const body1 = await res1.json();

    assert(res1.status === 200, 'Valid admin login with admin67@ returns 200 OK');
    assert(Boolean(body1.token), 'Valid admin login returns JWT session token');
    assert(body1.user?.role === 'ADMIN', 'Admin user payload has role ADMIN');
    assert(Boolean(body1.user?.fullName), `Admin user has fullName (${body1.user?.fullName})`);
    assert(body1.user?.username === 'admin', 'Admin user has username "admin"');

    const adminToken = body1.token;

    // 2. Valid Admin Login with Email & New Password (admin67@)
    const res2 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@novalifespace.in', password: 'admin67@' })
    });
    const body2 = await res2.json();

    assert(res2.status === 200, 'Admin login with email and admin67@ returns 200 OK');
    assert(body2.user?.email === 'admin@novalifespace.in', 'Admin user email correctly returned');

    // 3. Valid Staff Login (Unchanged)
    const res3 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff', password: 'staff123' })
    });
    const body3 = await res3.json();

    assert(res3.status === 200, 'Valid staff login with staff123 returns 200 OK');
    assert(body3.user?.role === 'CRM_STAFF', 'Staff user payload has role CRM_STAFF');
    assert(Boolean(body3.user?.fullName), `Staff user has fullName (${body3.user?.fullName})`);

    const staffToken = body3.token;

    // 4. Old Admin Password Rejection (admin123)
    const res4Old = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert(res4Old.status === 401, 'Old admin password (admin123) is rejected with 401 Unauthorized');

    // 4b. Invalid Password Rejection
    const res4 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong_password_xyz' })
    });
    const body4 = await res4.json();

    assert(res4.status === 401, 'Invalid password returns 401 Unauthorized');
    assert(body4.error === 'Invalid username or password.', 'Rejection error message is safe and standard');

    // 5. Unknown User Rejection
    const res5 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent_user', password: 'admin67@' })
    });

    assert(res5.status === 401, 'Unknown user returns 401 Unauthorized');

    // 6. Missing Credentials
    const res6 = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '' })
    });

    assert(res6.status === 400, 'Empty credentials returns 400 Bad Request');

    // 7. Token Verification & /auth/me
    const res7 = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const body7 = await res7.json();

    assert(res7.status === 200, 'Valid token allows access to /auth/me');
    assert(body7.user?.id === 'usr_admin', 'Token decodes to usr_admin');
    assert(body7.user?.fullName === 'Nova System Administrator', 'Decoded token contains user fullName');

    // 8. Missing Token on Protected Route
    const res8 = await fetch(`${baseUrl}/auth/me`);
    assert(res8.status === 401, 'Missing token returns 401 on protected route');

    // 9. Forged / Invalid Token on Protected Route
    const res9 = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': 'Bearer forged_token_invalid_signature' }
    });
    assert(res9.status === 403, 'Forged token returns 403 Forbidden');

    // 10. Role-Based Access Control (Admin vs Staff)
    const res10Admin = await fetch(`${baseUrl}/projects/proj_nova_diya_gardens/reconfigure-type`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ newType: 'PLOT', reason: 'Verification' })
    });
    assert(res10Admin.status === 200, 'ADMIN token is authorized for project reconfiguration');

    const res10Staff = await fetch(`${baseUrl}/projects/proj_nova_diya_gardens/reconfigure-type`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
      },
      body: JSON.stringify({ newType: 'PLOT', reason: 'Unauthorized attempt' })
    });
    assert(res10Staff.status === 403, 'CRM_STAFF token is blocked with 403 on ADMIN-only reconfiguration');

    server.close();
  } finally {
    closeDb();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) {}
  }

  console.log('\n====================================================');
  console.log(`AUTH TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthSuite().catch(err => {
  console.error('Auth suite crashed:', err);
  process.exit(1);
});


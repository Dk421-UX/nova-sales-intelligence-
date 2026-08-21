import os from 'os';
import path from 'path';
import fs from 'fs';
import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import app from '../server/index.ts';
import http from 'http';

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

async function runCrmFlowTest() {
  console.log('====================================================');
  console.log(' RUNNING CRM LOGIN & INVENTORY INITIALIZATION TEST');
  console.log('====================================================\n');

  const testDbPath = path.join(os.tmpdir(), `nova_test_crm_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
  process.env.DB_PATH = testDbPath;

  closeDb();
  seedDatabase();

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. CRM Login with updated admin67@
    const loginRes = await fetch(`${baseUrl}/api/crm/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin67@' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.success, 'CRM admin login succeeds with admin67@');
    assert(Boolean(loginData.token), 'CRM login returns valid JWT token');

    const token = loginData.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };

    // 2. Fetch CRM Projects
    const projRes = await fetch(`${baseUrl}/api/crm/projects`, { headers: authHeaders });
    const projData = await projRes.json();
    assert(projRes.ok && projData.success, 'GET /api/crm/projects returns HTTP 200');
    assert(Array.isArray(projData.projects) && projData.projects.length >= 10, `CRM projects list contains verified inventory (${projData.projects.length} projects)`);

    // Verify Nova Pinnacle and Nova City are present with correct location/name
    const pinnacle = projData.projects.find((p: any) => p.slug === 'kng-pudur-option-03');
    assert(pinnacle?.name === 'Nova Pinnacle', 'Nova Pinnacle project name is verified in CRM catalog');

    const city = projData.projects.find((p: any) => p.slug === 'nova-city');
    assert(city?.location === 'Thiruvallur', 'Nova City location is verified as Thiruvallur in CRM catalog');

    // 3. Fetch Inventory for selected project
    const selectedProj = projData.projects[0];
    const propsRes = await fetch(`${baseUrl}/api/crm/properties?projectId=${selectedProj.id}&includeSuperseded=true`, { headers: authHeaders });
    const propsData = await propsRes.json();
    assert(propsRes.ok && propsData.success, 'GET /api/crm/properties returns HTTP 200');
    assert(Array.isArray(propsData.properties), 'Properties list returned properly');

    // 4. Fetch Pending Drafts
    const draftsRes = await fetch(`${baseUrl}/api/crm/drafts?projectId=${selectedProj.id}`, { headers: authHeaders });
    const draftsData = await draftsRes.json();
    assert(draftsRes.ok && draftsData.success, 'GET /api/crm/drafts returns HTTP 200');

    // 5. Fetch Layouts
    const layoutsRes = await fetch(`${baseUrl}/api/crm/projects/${selectedProj.id}/layouts`, { headers: authHeaders });
    const layoutsData = await layoutsRes.json();
    assert(layoutsRes.ok && layoutsData.success, 'GET /api/crm/projects/:id/layouts returns HTTP 200');

    // 6. Fetch Project Health
    const healthRes = await fetch(`${baseUrl}/api/crm/projects/${selectedProj.id}/health`, { headers: authHeaders });
    const healthData = await healthRes.json();
    assert(healthRes.ok && healthData.success, 'GET /api/crm/projects/:id/health returns HTTP 200');

    console.log('\n====================================================');
    console.log(' ALL CRM INITIALIZATION CHECKS PASSED (0 REGRESSIONS)');
    console.log('====================================================\n');
  } finally {
    server.close();
    closeDb();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) {}
  }
}

runCrmFlowTest();


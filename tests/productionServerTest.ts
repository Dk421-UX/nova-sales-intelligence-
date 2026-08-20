import path from 'path';
import fs from 'fs';
import http from 'http';
import { config } from '../server/config.ts';
import app from '../server/index.ts';

async function testProductionServer() {
  console.log('====================================================');
  console.log(' RUNNING PRODUCTION RENDER SERVER VERIFICATION TEST');
  console.log('====================================================\n');

  // Start ephemeral server on random available port to guarantee no collision
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const testPort = typeof address === 'object' && address !== null ? address.port : config.port;
  const baseUrl = `http://127.0.0.1:${testPort}`;

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
    // 1. Root route GET /
    const resRoot = await fetch(`${baseUrl}/`);
    const textRoot = await resRoot.text();
    assert(resRoot.status === 200, 'GET / returns HTTP 200');
    assert(textRoot.includes('<div id="root">') || textRoot.includes('<!doctype html>'), 'GET / returns compiled index.html');
    assert(!textRoot.includes('Cannot GET /'), 'No "Cannot GET /" error on root');

    // 2. Health Endpoint GET /api/health
    const resHealth = await fetch(`${baseUrl}/api/health`);
    const dataHealth = await resHealth.json();
    assert(resHealth.status === 200, 'GET /api/health returns HTTP 200');
    assert(['healthy', 'degraded'].includes(dataHealth.status), `Health check returned valid operational status: ${dataHealth.status}`);
    assert(typeof dataHealth.timestamp === 'string', 'Health check includes valid timestamp');

    // 3. SPA Route 1: Direct navigation to /projects
    const resProjects = await fetch(`${baseUrl}/projects`);
    const textProjects = await resProjects.text();
    assert(resProjects.status === 200, 'GET /projects (SPA route) returns HTTP 200');
    assert(textProjects.includes('<div id="root">') || textProjects.includes('<!doctype html>'), 'GET /projects returns index.html for client-side hydration');

    // 4. SPA Route 2: Direct navigation to /crm/dashboard
    const resCrm = await fetch(`${baseUrl}/crm/dashboard`);
    const textCrm = await resCrm.text();
    assert(resCrm.status === 200, 'GET /crm/dashboard (SPA route) returns HTTP 200');
    assert(textCrm.includes('<div id="root">') || textCrm.includes('<!doctype html>'), 'GET /crm/dashboard returns index.html for client-side hydration');

    // 5. Public API: GET /api/public/projects
    const resApi = await fetch(`${baseUrl}/api/public/projects`);
    const dataApi = await resApi.json();
    assert(resApi.status === 200, 'GET /api/public/projects returns HTTP 200');
    assert(Array.isArray(dataApi.projects), `API returned ${dataApi.projects?.length} projects`);

    // 6. Unknown API Endpoint should return 404 JSON, NOT index.html
    const resUnknownApi = await fetch(`${baseUrl}/api/non_existent_route_test`);
    const dataUnknownApi = await resUnknownApi.json();
    assert(resUnknownApi.status === 404, 'GET /api/non_existent_route_test returns HTTP 404');
    assert(dataUnknownApi.error && dataUnknownApi.error.includes('not found'), 'Unknown API route returns JSON error instead of falling through to HTML');

    const distPath = path.resolve('./dist');
    if (fs.existsSync(path.join(distPath, 'assets'))) {
      const assetFiles = fs.readdirSync(path.join(distPath, 'assets'));
      const jsAsset = assetFiles.find(f => f.endsWith('.js'));
      if (jsAsset) {
        const resAsset = await fetch(`${baseUrl}/assets/${jsAsset}`);
        assert(resAsset.status === 200, `GET /assets/${jsAsset} returns HTTP 200`);
        assert(Boolean(resAsset.headers.get('content-type')?.includes('javascript')), 'Asset served with correct javascript content-type');
      }
    }
  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  console.log('\n====================================================');
  console.log(`PRODUCTION SERVER TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testProductionServer().catch(err => {
  console.error('Production server test failed:', err);
  process.exit(1);
});

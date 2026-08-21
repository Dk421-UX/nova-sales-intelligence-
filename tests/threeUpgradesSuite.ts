import { getDb, closeDb } from '../server/db/database.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { 
  getAllProjects, getProjectBySlug, getProjectById, 
  uploadProjectLayout, getProjectLayout, deleteLayout 
} from '../server/services/projectService.ts';
import { generateImportPreview, applyImport } from '../server/services/excelService.ts';
import { config } from '../server/config.ts';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, details?: any) {
  if (cond) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    if (details) console.error('    Details:', details);
    failed++;
  }
}

async function runThreeUpgradesSuite() {
  console.log('================================================================');
  console.log(' RUNNING 3 CRITICAL UPGRADES VERIFICATION SUITE');
  console.log('================================================================\n');

  // Initialize clean test DB
  closeDb();
  const dbFile = path.resolve('./nova_explorer.db');
  if (fs.existsSync(dbFile)) {
    try { fs.unlinkSync(dbFile); } catch (e) {}
  }
  seedDatabase();

  const allProjects = getAllProjects(true);
  const edensProject = allProjects.find(p => p.slug === 'nova-edens') || allProjects[0];
  const apartmentProject = allProjects.find(p => p.project_type === 'APARTMENT') || allProjects[1];

  // =========================================================================
  // UPGRADE 1: OFFICIAL LAYOUT UPLOAD — PERSISTENCE & STORAGE PIPELINE
  // =========================================================================
  console.log('\n--- UPGRADE 1: OFFICIAL LAYOUT UPLOAD PIPELINE ---');

  // Test 1.1: Upload a real PNG layout buffer to persistent storage
  const samplePngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const pngFilename = `layout_${edensProject.id}_${Date.now()}.png`;
  const persistentPngPath = path.join(config.uploadsDir, 'layouts', pngFilename);
  const publicPngPath = path.join(process.cwd(), 'public', 'layouts', pngFilename);

  fs.mkdirSync(path.dirname(persistentPngPath), { recursive: true });
  fs.mkdirSync(path.dirname(publicPngPath), { recursive: true });
  fs.writeFileSync(persistentPngPath, samplePngBuffer);
  fs.writeFileSync(publicPngPath, samplePngBuffer);

  const uploadedLayout: any = uploadProjectLayout(
    edensProject.id,
    {
      name: 'Nova Edens Official Layout 2026',
      layoutType: 'MASTER_PLAN',
      imageUrl: `/layouts/${pngFilename}`,
      status: 'PUBLISHED'
    },
    'usr_admin',
    'ADMIN'
  );

  assert(uploadedLayout !== null, 'Upload layout returned a valid layout plan record');
  assert(uploadedLayout.image_url.startsWith('/layouts/'), `Layout image_url uses standard persistent path: ${uploadedLayout.image_url}`);
  assert(!uploadedLayout.image_url.includes('blob:') && !uploadedLayout.image_url.includes('undefined'), 'Layout image_url is not temporary or blob URL');
  assert(fs.existsSync(persistentPngPath), `Layout file written to persistent storage directory: ${persistentPngPath}`);

  // Test 1.2: Customer viewer query retrieves layout with valid persistent URL
  const customerLayout = getProjectLayout(edensProject.id);
  assert(customerLayout !== null, 'Customer query retrieves the uploaded project layout');
  assert(customerLayout?.image_url === uploadedLayout.image_url, 'Customer layout URL matches stored persistent asset');

  // Test 1.3: Upload a PDF layout plan
  const samplePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000108 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF', 'utf-8');
  const pdfFilename = `layout_${edensProject.id}_${Date.now()}_blueprint.pdf`;
  const persistentPdfPath = path.join(config.uploadsDir, 'layouts', pdfFilename);
  const publicPdfPath = path.join(process.cwd(), 'public', 'layouts', pdfFilename);
  fs.writeFileSync(persistentPdfPath, samplePdfBuffer);
  fs.writeFileSync(publicPdfPath, samplePdfBuffer);

  const pdfLayout: any = uploadProjectLayout(
    edensProject.id,
    {
      name: 'Nova Edens Master CAD Drawing (PDF)',
      layoutType: 'MASTER_PLAN',
      imageUrl: `/layouts/${pdfFilename}`,
      status: 'PUBLISHED'
    },
    'usr_admin',
    'ADMIN'
  );

  assert(pdfLayout.image_url.toLowerCase().endsWith('.pdf'), `PDF layout uploaded with .pdf extension: ${pdfLayout.image_url}`);
  assert(fs.existsSync(persistentPdfPath), `PDF layout file persisted to disk: ${persistentPdfPath}`);

  // =========================================================================
  // UPGRADE 2: EXCEL INVENTORY IMPORTER — DUPLICATE REVIEW & DEDUPLICATION
  // =========================================================================
  console.log('\n--- UPGRADE 2: EXCEL INVENTORY IMPORTER — DUPLICATE REVIEW ---');

  // Create an in-memory workbook with multi-phase units and duplicates
  const testRows = [
    { 'Plot No': 'Plot 101', 'Section / Phase': 'Phase 1', 'Facing': 'North', 'Area (Sq.ft)': 1200, 'Status': 'AVAILABLE' },
    { 'Plot No': 'Plot 101', 'Section / Phase': 'Phase 2', 'Facing': 'East',  'Area (Sq.ft)': 1500, 'Status': 'AVAILABLE' }, // Distinct multi-phase unit!
    { 'Plot No': 'Plot 101', 'Section / Phase': 'Phase 1', 'Facing': 'North', 'Area (Sq.ft)': 1200, 'Status': 'AVAILABLE' }, // True in-file duplicate of row 1
    { 'Plot No': 'Plot 102', 'Section / Phase': 'Phase 1', 'Facing': 'South', 'Area (Sq.ft)': 1800, 'Status': 'AVAILABLE' },
    { 'Plot No': 'Plot 103', 'Section / Phase': 'Phase 1', 'Facing': 'West',  'Area (Sq.ft)': 2000, 'Status': 'Clubhouse Zone' } // Unsupported status
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(testRows);
  xlsx.utils.book_append_sheet(wb, ws, 'Master Inventory');
  const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Generate preview
  const preview = generateImportPreview(
    excelBuffer,
    'test_inventory.xlsx',
    edensProject.id,
    'Master Inventory',
    'admin_1'
  );

  assert(preview.summary.totalRows === 5, `Preview processed all 5 rows (Got ${preview.summary.totalRows})`);

  // Verify multi-phase Plot 101 Phase 1 vs Plot 101 Phase 2 are NOT falsely flagged as duplicate
  const phase1Unit = preview.rows.find(r => r.propertyNumber === 'Plot 101' && r.sectionOrPhase === 'Phase 1' && r.changeType === 'NEW');
  const phase2Unit = preview.rows.find(r => r.propertyNumber === 'Plot 101' && r.sectionOrPhase === 'Phase 2' && r.changeType === 'NEW');
  assert(phase1Unit !== undefined, 'Plot 101 Phase 1 is classified as legitimate NEW row');
  assert(phase2Unit !== undefined, 'Plot 101 Phase 2 is classified as legitimate NEW row (distinct multi-phase)');

  // Verify true duplicate row is flagged DUPLICATE with duplicateDetails
  const dupRow = preview.rows.find(r => r.changeType === 'DUPLICATE');
  assert(dupRow !== undefined, 'True duplicate row is identified with changeType = DUPLICATE');
  assert(dupRow?.duplicateDetails !== undefined, 'Duplicate row contains structured duplicateDetails');
  assert(dupRow?.duplicateDetails?.conflictingRowIndex === 2, `Duplicate details points to conflicting Row ${dupRow?.duplicateDetails?.conflictingRowIndex}`);

  // Verify invalid row (Clubhouse)
  const invalidRow = preview.rows.find(r => r.changeType === 'INVALID');
  assert(invalidRow !== undefined, 'Unsupported status "Clubhouse Zone" identified as INVALID');

  // Test applyImport with review actions: KEEP legitimate duplicate and skip invalid
  const applyResult = applyImport(
    preview.importId,
    'admin_1',
    'ADMIN',
    {
      skipInvalid: true,
      rowActions: {
        [dupRow!.rowIndex]: { action: 'KEEP' } // CRM explicitly chooses to keep this unit
      }
    }
  );

  assert(applyResult.success === true, 'Import successfully applied with CRM duplicate review decisions');
  assert(applyResult.appliedCount === 4, `Applied exactly 4 rows (2 new phases + 1 kept duplicate + 1 standard new): Got ${applyResult.appliedCount}`);
  assert(applyResult.skippedCount === 1, `Skipped exactly 1 invalid row: Got ${applyResult.skippedCount}`);

  // =========================================================================
  // UPGRADE 3: APARTMENT PROJECTS — CUSTOMER LAYOUT VIEWING
  // =========================================================================
  console.log('\n--- UPGRADE 3: APARTMENT PROJECTS OFFICIAL LAYOUT ---');

  // Test 3.1: Upload layout to apartment project
  const aptFilename = `layout_${apartmentProject.id}_${Date.now()}_apt.png`;
  const persistentAptPath = path.join(config.uploadsDir, 'layouts', aptFilename);
  const publicAptPath = path.join(process.cwd(), 'public', 'layouts', aptFilename);
  fs.writeFileSync(persistentAptPath, samplePngBuffer);
  fs.writeFileSync(publicAptPath, samplePngBuffer);

  const aptLayout: any = uploadProjectLayout(
    apartmentProject.id,
    {
      name: 'Nova Meridian Grand Tower Typical Floor Plan',
      layoutType: 'FLOOR_PLAN',
      imageUrl: `/layouts/${aptFilename}`,
      status: 'PUBLISHED'
    },
    'usr_admin',
    'ADMIN'
  );

  assert(aptLayout !== null, 'Apartment project layout uploaded successfully');
  assert(aptLayout.project_id === apartmentProject.id, 'Layout associated with correct apartment project ID');

  // Test 3.2: Customer query for apartment project layout
  const customerAptLayout = getProjectLayout(apartmentProject.id);
  assert(customerAptLayout !== null, 'Customer can retrieve official layout for apartment project');
  assert(customerAptLayout?.image_url.startsWith('/layouts/'), `Apartment layout serves valid persistent path: ${customerAptLayout?.image_url}`);

  // Test 3.3: Delete layout cleans up storage files
  const layoutToDelete = customerAptLayout!;
  deleteLayout(layoutToDelete.id, 'admin_1', 'ADMIN');
  const deletedQuery = getProjectLayout(apartmentProject.id);
  assert(deletedQuery === null, 'Deleted layout is no longer returned for project');

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runThreeUpgradesSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

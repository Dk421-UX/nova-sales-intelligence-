import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { getDb } from './database.ts';
import { runMigrations } from './migrations.ts';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export function seedDatabase() {
  const db = getDb();
  runMigrations(db);

  const now = new Date().toISOString();
  console.log('[Seed] Starting database seed with verified Nova project data...');

  const transaction = db.transaction(() => {
    // 1. Seed Users (Hashed for both canonical and default environment logins)
    const passwordHashAdmin = bcrypt.hashSync('admin123', 10);
    const passwordHashStaff = bcrypt.hashSync('staff123', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = excluded.updated_at
    `);

    insertUser.run('usr_admin', 'admin', 'admin@novalifespace.in', passwordHashAdmin, 'Nova System Administrator', 'ADMIN', now, now);
    insertUser.run('usr_staff', 'staff', 'staff@novalifespace.in', passwordHashStaff, 'Nova CRM Sales Staff', 'CRM_STAFF', now, now);

    // 2. Project Registry
    const insertProject = db.prepare(`
      INSERT INTO projects (
        id, slug, name, project_type, location, city, description, highlights, amenities,
        total_area_reference, total_units_reference, brochure_reference, cover_image, status,
        current_version, is_published, last_verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        name = excluded.name,
        project_type = excluded.project_type,
        location = excluded.location,
        city = excluded.city,
        description = excluded.description,
        highlights = excluded.highlights,
        amenities = excluded.amenities,
        total_area_reference = excluded.total_area_reference,
        total_units_reference = excluded.total_units_reference,
        brochure_reference = excluded.brochure_reference,
        cover_image = excluded.cover_image,
        status = excluded.status,
        current_version = excluded.current_version,
        is_published = excluded.is_published,
        last_verified_at = excluded.last_verified_at,
        updated_at = excluded.updated_at
    `);

    const insertVersion = db.prepare(`
      INSERT INTO project_versions (id, project_id, version_number, project_type, change_summary, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        change_summary = excluded.change_summary
    `);

    // Clear stale geometries on re-seed
    db.prepare('DELETE FROM property_geometry').run();

    const insertLayout = db.prepare(`
      INSERT INTO layouts (
        id, project_id, name, layout_type, version, svg_content, image_url, width, height, viewbox, reference_stats, status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        svg_content = excluded.svg_content,
        image_url = excluded.image_url,
        width = excluded.width,
        height = excluded.height,
        viewbox = excluded.viewbox,
        reference_stats = excluded.reference_stats,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    const insertBuilding = db.prepare(`
      INSERT INTO buildings (id, project_id, name, total_floors, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        total_floors = excluded.total_floors,
        description = excluded.description
    `);

    const insertFloor = db.prepare(`
      INSERT INTO floors (id, building_id, floor_number, floor_name, floor_plan_svg, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        floor_name = excluded.floor_name,
        floor_plan_svg = excluded.floor_plan_svg
    `);

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (id, entity_type, entity_id, project_id, action, old_values, new_values, performed_by, user_role, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Helper for reading SVGs
    const svgDir = path.join(process.env.USERPROFILE || 'C:\\Users\\acer', '.gemini\\antigravity\\brain\\f7b5959d-8c00-48e0-9206-a9113d79344c\\scratch\\svg_layouts');

    // -------------------------------------------------------------
    // PROJECT 1: Nova Diya Garden & Extension I (PLOT)
    // -------------------------------------------------------------
    let diyaSvg = '';
    const diyaSvgPath = path.join(svgDir, 'nova_diya_gardens_layout.svg');
    if (fs.existsSync(diyaSvgPath)) {
      diyaSvg = fs.readFileSync(diyaSvgPath, 'utf-8');
    }

    insertProject.run(
      'proj_nova_diya_gardens',
      'nova-diya-gardens',
      'Nova Diya Gardens',
      'PLOT',
      'Thiruvallur',
      'Thiruvallur',
      'Nova Diya Gardens is a premier CMDA / RERA approved gated plotted community featuring thoughtfully planned residential plots, wide asphalt roads, lush parks/OSR reserves, and serene green surroundings in Thiruvallur.',
      JSON.stringify(['171 Premium Residential Plots', 'Blacktop Internal Roads', 'Dedicated OSR & Park Areas', 'Secured Gated Community', 'High Appreciation Corridor']),
      JSON.stringify(['Gated Arch & 24/7 Security', 'Avenue Tree Plantations', 'Underground Utilities', 'Street Lighting', 'Children Play Zone']),
      '12 Acres Layout',
      171,
      '03ab9e89-e3fc-4d1a-8758-6a433ea19633.pdf',
      '/images/diya_garden_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_diya_1', 'proj_nova_diya_gardens', 1, 'PLOT', 'Initial verified plot registry seeded from Excel and CAD Layout', 'usr_admin', now);

    insertLayout.run(
      'lay_diya_1',
      'proj_nova_diya_gardens',
      'Master Layout Scheme - Option 01',
      'MASTER_PLAN',
      '1.0',
      diyaSvg,
      '/layouts/nova_diya_gardens_layout.png',
      1191,
      842,
      '0 0 1191 842',
      JSON.stringify({ total_plots: 171, source: '03ab9e89-e3fc-4d1a-8758-6a433ea19633.pdf' }),
      now, now
    );

    // -------------------------------------------------------------
    // PROJECT 2: Nova Pinnacle (PLOT REFERENCE)
    // -------------------------------------------------------------
    let kngSvg = '';
    const kngSvgPath = path.join(svgDir, 'layout_scheme_plan_option_03.svg');
    if (fs.existsSync(kngSvgPath)) {
      kngSvg = fs.readFileSync(kngSvgPath, 'utf-8');
    }

    insertProject.run(
      'proj_kng_pudur_opt3',
      'kng-pudur-option-03',
      'Nova Pinnacle',
      'PLOT',
      'KNG Pudur',
      'Coimbatore',
      'Layout plan showing proposed house sites at KNG Pudur, Coimbatore. Spanning 7.89 acres with 129 regular plots and 37 EWS plots, comprehensive road networks, and designated utility reserves.',
      JSON.stringify(['7.89 Acres Site Area', '129 House Site Plots', '37 EWS Plots', '23,062 sq.ft OSR Area', '12m / 10m / 9m / 7.2m Layout Roads']),
      JSON.stringify(['OSR Park Reserves', 'TANGEDCO Sub-station Space', 'Public Purpose Reservation', 'Engineered Drainage Channels']),
      '7.89 Acres (344,098 sq.ft)',
      129,
      'Layout Scheme Plan - Option 03.pdf',
      '/images/kng_pudur_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_kng_1', 'proj_kng_pudur_opt3', 1, 'PLOT', 'Layout Scheme Option 03 reference registry loaded', 'usr_admin', now);

    insertLayout.run(
      'lay_kng_1',
      'proj_kng_pudur_opt3',
      'Proposed House Sites Layout - Option 03',
      'SCHEME_PLAN',
      '3.0',
      kngSvg,
      '/layouts/kng_pudur_option_03_layout.png',
      3370,
      2384,
      '0 0 3370 2384',
      JSON.stringify({
        site_area_acres: 7.89,
        site_area_sqft: 344098,
        total_plots: 129,
        ews_plots: 37,
        total_plot_area_sqft: 207123,
        road_area_sqft: 111458,
        osr_area_sqft: 23062,
        tangedco_sqft: 1271,
        public_purpose_sqft: 1184,
        ews_block_area_sqft: 23315
      }),
      now, now
    );

    // -------------------------------------------------------------
    // PROJECT 3: Nova NCR (PLOT)
    // -------------------------------------------------------------
    let ncrSvg = '';
    const ncrSvgPath = path.join(svgDir, 'nova_ncr_subdivision_layout.svg');
    if (fs.existsSync(ncrSvgPath)) {
      ncrSvg = fs.readFileSync(ncrSvgPath, 'utf-8');
    }

    insertProject.run(
      'proj_nova_ncr',
      'nova-ncr',
      'Nova NCR',
      'PLOT',
      '25 ft Sana Street & 20 ft Road Enclave',
      'Chennai',
      'Exclusive sub-division enclave of high-value residential plots strategically placed along 25-ft Sana Street with direct access to prime transport corridors.',
      JSON.stringify(['14 Verified Sub-Division Plots', '25-ft Frontage Sana Street', 'High FSI Zone', 'Instant Registration Ready']),
      JSON.stringify(['Clear Title Approval', 'Direct Road Access', 'Potable Water Line', 'Electricity Infrastructure']),
      '19,261 sq.ft Layout',
      14,
      'SUB-DIVISION PLAN-Model.ALL (10).pdf',
      '/images/ncr_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_ncr_1', 'proj_nova_ncr', 1, 'PLOT', 'Sub-division plan registry initialized', 'usr_admin', now);

    insertLayout.run(
      'lay_ncr_1',
      'proj_nova_ncr',
      'Sub-Division Plan - Model ALL',
      'SUBDIVISION_PLAN',
      '1.0',
      ncrSvg,
      '/layouts/nova_ncr_subdivision_layout.png',
      842,
      1191,
      '0 0 842 1191',
      JSON.stringify({ total_plots: 14, source: 'SUB-DIVISION PLAN-Model.ALL (10).pdf' }),
      now, now
    );

    // -------------------------------------------------------------
    // PROJECT 4: Nova Vasantham (APARTMENT - CRITICAL BUSINESS DECISION)
    // -------------------------------------------------------------
    let vasanthamSvg = '';
    const vasanthamSvgPath = path.join(svgDir, 'vasantham_avenue_floor_plan.svg');
    if (fs.existsSync(vasanthamSvgPath)) {
      vasanthamSvg = fs.readFileSync(vasanthamSvgPath, 'utf-8');
    }

    insertProject.run(
      'proj_nova_vasantham',
      'nova-vasantham',
      'Nova Vasantham',
      'APARTMENT', // APARTMENT AS PER CURRENT BUSINESS DECISION
      'Vasantham Avenue, Prime Residential Zone',
      'Chennai',
      'Nova Vasantham is an approved multi-storey apartment project offering modern 2 BHK & 3 BHK residences with contemporary architecture, dedicated parking, and lifestyle amenities in Chennai.',
      JSON.stringify(['Premium Multi-Storey Residential Enclave', 'Architect-Designed 2 & 3 BHK Floor Plans', 'Superior Ventilation & Natural Lighting', 'Elevator & Stretcher Lift Access', 'Covered Car Parking']),
      JSON.stringify(['Automatic High-Speed Lift', 'Power Backup Generator', 'Rainwater Harvesting', 'Video Door Phone System', 'EV Charging Station']),
      'Residential Apartment Community',
      null, // Total units reference pending verification
      'VASANTHAM AVENUE - FLOOR PLAN(1) (2).pdf',
      '/images/vasantham_cover.jpg',
      'INVENTORY_PENDING', // INVENTORY PENDING VERIFICATION AS PER SPEC
      2, // Version 2 reflecting apartment classification
      now, now, now
    );

    insertVersion.run('ver_vasantham_1', 'proj_nova_vasantham', 1, 'PLOT', 'Historical configuration when originally evaluated as plot layout', 'usr_admin', '2026-07-18T10:00:00.000Z');
    insertVersion.run('ver_vasantham_2', 'proj_nova_vasantham', 2, 'APARTMENT', 'Nova company business decision: Officially classified as an Apartment project. Old plot data superseded.', 'usr_admin', now);

    insertLayout.run(
      'lay_vasantham_1',
      'proj_nova_vasantham',
      'Master Floor Plan - Typical Residential Floor',
      'FLOOR_PLAN',
      '2.0',
      vasanthamSvg,
      null,
      1684,
      2384,
      '0 0 1684 2384',
      JSON.stringify({ layout_type: 'APARTMENT_FLOOR_PLAN', source: 'VASANTHAM AVENUE - FLOOR PLAN(1) (2).pdf' }),
      now, now
    );

    insertBuilding.run('bld_vasantham_a', 'proj_nova_vasantham', 'Tower A', 4, 'Main residential block featuring lift lobby and private balconies', now);
    insertFloor.run('flr_vasantham_1', 'bld_vasantham_a', 1, '1st Floor', vasanthamSvg, now);
    insertFloor.run('flr_vasantham_2', 'bld_vasantham_a', 2, '2nd Floor', vasanthamSvg, now);
    insertFloor.run('flr_vasantham_3', 'bld_vasantham_a', 3, '3rd Floor', vasanthamSvg, now);

    // -------------------------------------------------------------
    // PROJECT 5: Nova Tejas (APARTMENT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_tejas',
      'nova-tejas',
      'Nova Tejas',
      'APARTMENT',
      'Central Residential Sector',
      'Chennai',
      'Nova Tejas is an elite low-density apartment community featuring 10 expansive flats across 5 floors with high UDS ratios, elegant balconies, and prime connectivity.',
      JSON.stringify(['10 Exclusive Luxury Flats', 'Only 2 Apartments Per Floor', 'Generous 579 - 610 sq.ft UDS', '1,641 - 1,728 sq.ft Total Saleable Area']),
      JSON.stringify(['Covered Car Parking', 'Lift with Generator Backup', 'CC Camera Surveillance', 'Intercom System']),
      '5-Storey Residential Enclave',
      10,
      null,
      '/images/tejas_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_tejas_1', 'proj_nova_tejas', 1, 'APARTMENT', 'Initial apartment inventory registry created from Nova Available List', 'usr_admin', now);

    insertBuilding.run('bld_tejas_1', 'proj_nova_tejas', 'Tejas Residency Block', 5, '5-storey building with 2 flats per floor (A & B)', now);
    for (let f = 1; f <= 5; f++) {
      insertFloor.run(`flr_tejas_${f}`, 'bld_tejas_1', f, `Floor ${f}`, null, now);
    }

    // -------------------------------------------------------------
    // PROJECT 6: Nova Edens (PLOT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_edens',
      'nova-edens',
      'Nova Edens',
      'PLOT',
      'Edens Green Corridor',
      'Chennai',
      'Nova Edens offers large villa plots across four master-planned phases (Edens 1 through Edens 4), surrounded by mature landscape and clear roads.',
      JSON.stringify(['43 Verified Villa Plots', 'Phased Community (Edens 1-4)', 'Corner & Avenue Facing Plots', 'Clear Documentation']),
      JSON.stringify(['Blacktop Roads', 'Tree-Lined Avenues', 'Gated Perimeter', 'Street Lighting']),
      'Multi-Phase Plotted Township',
      43,
      null,
      '/images/edens_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_edens_1', 'proj_nova_edens', 1, 'PLOT', 'Verified plots loaded from Nova Available List', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 7: Nova City (PLOT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_city',
      'nova-city',
      'Nova City',
      'PLOT',
      'Thiruvallur',
      'Thiruvallur',
      'Nova City provides spacious residential plots with areas up to 3,367 sq.ft in a fast-appreciating development hub.',
      JSON.stringify(['Verified Plots from 1,000 to 3,367 sq.ft', 'Immediate Construction Ready', 'Broad Access Roads']),
      JSON.stringify(['Gated Layout', 'Water Supply Points', 'Electricity Lines']),
      'Plotted Development',
      8,
      null,
      '/images/city_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_city_1', 'proj_nova_city', 1, 'PLOT', 'Verified inventory loaded from Nova Available List', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 8: Nova Hi-Tech (PLOT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_hi_tech',
      'nova-hi-tech',
      'Nova Hi-Tech',
      'PLOT',
      'Tech Corridor',
      'Chennai',
      'Nova Hi-Tech features large premium commercial and residential plots (PP:1 to PP:4) facing South, ideally suited for bespoke bungalows or tech offices.',
      JSON.stringify(['Large Plot Extents (1,730 to 3,726 sq.ft)', 'South Facing Advantages', 'IT Corridor Proximity']),
      JSON.stringify(['Wide Access Roads', 'High Voltage Power Lines', 'Underground Drainage']),
      'Commercial & Residential Plots',
      4,
      null,
      '/images/hitech_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_hitech_1', 'proj_nova_hi_tech', 1, 'PLOT', 'Verified inventory loaded', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 9: Nova KNT & KNT Phase 3 (PLOT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_knt',
      'nova-knt',
      'Nova KNT & KNT Phase 3',
      'PLOT',
      'KNT Enclave Corridor',
      'Chennai',
      'Nova KNT features well-apportioned residential plots and commercial shop spaces across Phase 1 and Phase 3 with East, West, and Corner orientations.',
      JSON.stringify(['11 Verified Plots & Commercial Shop', 'Phases 1 & Phase 3', 'East & Corner Facing Options']),
      JSON.stringify(['Tar Roads', 'Street Lighting', 'Potable Ground Water']),
      'Plotted Enclave',
      11,
      null,
      '/images/knt_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_knt_1', 'proj_nova_knt', 1, 'PLOT', 'Verified inventory loaded', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 10: Nova Aardhiya Nagar (PLOT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_aardhiya',
      'nova-aardhiya-nagar',
      'Nova Aardhiya Nagar',
      'PLOT',
      'Aardhiya Nagar Corridor',
      'Chennai',
      'Nova Aardhiya Nagar comprises North-facing residential plots ranging from 760 to 2,425 sq.ft alongside prime Commercial Shop opportunities.',
      JSON.stringify(['North-Facing Residential Plots', 'Dedicated Commercial Shop Unit', 'Compact & Large Size Mix']),
      JSON.stringify(['Gated Entrance', 'Internal Street Lights', 'Clear Title Documentation']),
      'Plotted Development',
      5,
      null,
      '/images/aardhiya_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_aardhiya_1', 'proj_nova_aardhiya', 1, 'PLOT', 'Verified inventory loaded', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 11: Nova Ramala (APARTMENT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_ramala',
      'nova-ramala',
      'Nova Ramala (Mogappair)',
      'APARTMENT',
      'Mogappair',
      'Chennai',
      'Nova Ramala in Mogappair presents an exquisite 2B2T+Study apartment residence with North facing orientation, 1,265 sq.ft saleable area, and 567.5 sq.ft UDS.',
      JSON.stringify(['2B2T + Study Configuration', '1,265 sq.ft Total Saleable Area', '894 sq.ft Carpet Area', '567.5 sq.ft UDS', 'Prime Mogappair Location']),
      JSON.stringify(['Covered Parking', 'Lift Facility', 'Water Treatment System', 'Security Intercom']),
      'Boutique Apartment',
      1,
      null,
      '/images/ramala_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_ramala_1', 'proj_nova_ramala', 1, 'APARTMENT', 'Verified apartment loaded', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 12: Nova VR Squares (APARTMENT)
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_vr_squares',
      'nova-vr-squares',
      'Nova VR Squares',
      'APARTMENT',
      'VR Squares Enclave',
      'Chennai',
      'Nova VR Squares presents spacious 1,600 sq.ft luxury apartments boasting an expansive 743 sq.ft UDS and premium finishes.',
      JSON.stringify(['1,600 sq.ft Saleable Area', '743 sq.ft High UDS Share', '1,344.53 sq.ft Plinth Area']),
      JSON.stringify(['Dedicated Parking', 'Security Access', 'Elevator']),
      'Luxury Residence',
      1,
      null,
      '/images/vrsquares_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_vrsquares_1', 'proj_nova_vr_squares', 1, 'APARTMENT', 'Verified apartment loaded', 'usr_admin', now);

    // -------------------------------------------------------------
    // PROJECT 13: Nova Pinnacle (PLOT) — COIMBATORE
    // -------------------------------------------------------------
    insertProject.run(
      'proj_nova_pinnacle',
      'nova-pinnacle',
      'Nova Pinnacle',
      'PLOT',
      'Coimbatore Growth Corridor',
      'Coimbatore',
      'Nova Pinnacle is a premium residential plotted development strategically located in Coimbatore, offering master-planned villa plots with wide internal access roads, landscaped parks, and serene green surroundings.',
      JSON.stringify(['Prime Plotted Development in Coimbatore', 'Wide Internal Blacktop Roads', 'Dedicated Green Reserves & Parks', 'High Appreciation Corridor', 'Instant Registration Ready']),
      JSON.stringify(['Gated Perimeter & Security', 'Avenue Tree Plantations', 'Underground Utilities', 'Street Lighting', 'Potable Water Network']),
      'Plotted Residential Community',
      null, // Reference count pending publication
      null,
      '/images/pinnacle_cover.jpg',
      'ACTIVE',
      1,
      now, now, now
    );

    insertVersion.run('ver_pinnacle_1', 'proj_nova_pinnacle', 1, 'PLOT', 'Official master project record registered in Coimbatore catalog', 'usr_admin', now);

    // Clear previous prototype inventory and geometry to guarantee clean baseline data state (Requirement 19)
    db.prepare('DELETE FROM properties').run();
    db.prepare('DELETE FROM property_geometry').run();
    db.prepare('DELETE FROM draft_changes').run();
    db.prepare('DELETE FROM imports').run();
    db.prepare('DELETE FROM import_rows').run();

    console.log('[Seed] Projects, layouts, and users registered successfully with clean 0-inventory baseline.');
  });

  transaction();
}

function seedPropertiesFromSources(db: any) {
  const xlsxPath = path.join(rootDir, 'Nova Available List 18.7.26 (1).xlsx');
  let allData: Record<string, { all_rows: any[][] }> = {};

  if (fs.existsSync(xlsxPath)) {
    console.log('[Seed] Reading Excel workbook:', xlsxPath);
    const buffer = fs.readFileSync(xlsxPath);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
      allData[sheetName] = { all_rows: rows };
    }
  } else {
    console.log('[Seed] Source Excel workbook not found:', xlsxPath);
    return;
  }

  const now = new Date().toISOString();

  const insertProperty = db.prepare(`
    INSERT INTO properties (
      id, project_id, property_type, property_number, status, draft_status, section_or_phase, facing,
      area_sqft, price, price_display, building_id, floor_id, unit_type, plinth_area_sqft,
      common_area_sqft, saleable_area_sqft, carpet_area_sqft, uds_sqft, share_type,
      is_published, is_archived, is_superseded, superseded_reason, has_pending_changes,
      source_document, source_sheet, source_row, last_verified_at, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      facing = excluded.facing,
      area_sqft = excluded.area_sqft,
      price = excluded.price,
      price_display = excluded.price_display,
      is_superseded = excluded.is_superseded,
      superseded_reason = excluded.superseded_reason,
      updated_at = excluded.updated_at
  `);

  const insertGeometry = db.prepare(`
    INSERT INTO property_geometry (
      id, property_id, layout_id, geometry_type, svg_path, polygon_points, center_x, center_y, label_x, label_y, custom_styling, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(property_id, layout_id) DO UPDATE SET
      geometry_type = excluded.geometry_type,
      svg_path = excluded.svg_path,
      polygon_points = excluded.polygon_points,
      center_x = excluded.center_x,
      center_y = excluded.center_y,
      label_x = excluded.label_x,
      label_y = excluded.label_y,
      updated_at = excluded.updated_at
  `);

  const propTransaction = db.transaction(() => {
    // 1. Nova Diya Gardens (172 plots across Diya Garden & Extension I)
    if (allData['NOVA DIYA GARDENS ']) {
      const rows = allData['NOVA DIYA GARDENS '].all_rows;
      let seededDiya = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[2] === null || r[2] === undefined) continue;
        const sNo = r[0];
        const section = r[1] ? String(r[1]).trim() : 'Diya Garden';
        const plotNo = String(r[2]).trim();
        if (!plotNo || plotNo.toLowerCase() === 'none') continue;
        const extent = typeof r[3] === 'number' ? r[3] : parseFloat(String(r[3])) || null;
        const facing = r[4] ? String(r[4]).trim() : null;
        const statusVal = r[5] ? String(r[5]).trim() : 'Available';
        const canonicalStatus = mapStatus(statusVal);

        const fullPlotName = section === 'Diya Garden Ext'
          ? `Ext - Plot ${plotNo}`
          : (sNo === 14.0 ? `Plot ${plotNo} (B)` : `Plot ${plotNo}`);

        const propId = `prop_diya_${section.replace(/[^a-zA-Z0-9]/g, '_')}_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}_${sNo || i}`;
        insertProperty.run(
          propId,
          'proj_nova_diya_gardens',
          'PLOT',
          fullPlotName,
          canonicalStatus,
          null,
          section,
          facing,
          extent,
          extent ? extent * 1800 : null,
          extent ? `Rs. ${(extent * 1800).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, null,
          0, null, // is_superseded = 0
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA DIYA GARDENS ', i + 1,
          now, now, now, now
        );
        seededDiya++;
      }
      console.log(`[Seed] Seeded ${seededDiya} verified plots for Nova Diya Gardens.`);
    }

    // 2. Nova NCR Sub-Division (14 plots)
    if (allData['NOVA NCR']) {
      const rows = allData['NOVA NCR'].all_rows;
      let seededNcr = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined) continue;
        const plotNo = String(r[1]).trim();
        if (!plotNo || plotNo.toLowerCase() === 'none' || r[0] === null) continue;
        const sqft = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const facing = r[3] ? String(r[3]).trim() : null;
        const statusVal = r[4] ? String(r[4]).trim() : 'Available';
        const share = r[5] ? String(r[5]).trim() : 'Nova';

        const propId = `prop_ncr_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_ncr',
          'PLOT',
          plotNo,
          mapStatus(statusVal),
          null,
          'Sana Street Sector',
          facing,
          sqft,
          sqft ? sqft * 3500 : null,
          sqft ? `Rs. ${(sqft * 3500).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, share,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA NCR', i + 1,
          now, now, now, now
        );
        seededNcr++;
      }
      console.log(`[Seed] Seeded ${seededNcr} verified plots for Nova NCR Sub-Division.`);
    }

    // 3. Nova Vasantham — RETENTION OF SUPERSEDED PLOT DATA & CREATION OF APARTMENT UNITS
    if (allData['NOVA VASANTHAM AVENUE']) {
      const rows = allData['NOVA VASANTHAM AVENUE'].all_rows;
      let supersededCount = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined || r[0] === null) continue;
        const plotNo = String(r[1]).trim();
        if (!plotNo) continue;
        const sqft = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const facing = r[3] ? String(r[3]).trim() : null;
        const statusVal = r[4] ? String(r[4]).trim() : 'Available';

        const propId = `prop_vasantham_old_plot_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_vasantham',
          'PLOT',
          `Plot-${plotNo} (Historical)`,
          mapStatus(statusVal),
          null,
          'Old Plot Layout (Superseded)',
          facing,
          sqft,
          null, null, null, null, null, null, null, null, null, null, null,
          1, // is_superseded = 1 (CRITICAL: HIDDEN FROM CUSTOMER)
          'Nova company business decision: Officially classified as an Apartment project. Old plot records preserved as historical reference.',
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA VASANTHAM AVENUE', i + 1,
          now, now, now, now
        );
        supersededCount++;
      }
      console.log(`[Seed] Preserved ${supersededCount} historical plot records for Nova Vasantham as SUPERSEDED.`);

      // Note: Vasantham apartment inventory remains pending until verified by Nova staff
      console.log('[Seed] Vasantham apartment inventory set to PENDING verification (no fabricated units seeded).');
    }

    // 4. Nova Tejas (10 Apartments)
    if (allData['NOVA TEJAS']) {
      const rows = allData['NOVA TEJAS'].all_rows;
      let seededTejas = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined || r[0] === null) continue;
        const flatName = String(r[1]).trim();
        if (!flatName || flatName.toLowerCase() === 't') continue;
        const plinth = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const common = typeof r[3] === 'number' ? r[3] : parseFloat(String(r[3])) || null;
        const saleable = typeof r[4] === 'number' ? r[4] : parseFloat(String(r[4])) || null;
        const uds = typeof r[5] === 'number' ? r[5] : parseFloat(String(r[5])) || null;
        const statusVal = r[6] ? String(r[6]).trim() : 'Available';

        // Extract floor from Flat Name e.g. "Flat - 1A " -> floor 1
        const floorMatch = flatName.match(/(\d)/);
        const floorNum = floorMatch ? parseInt(floorMatch[1], 10) : 1;

        const propId = `prop_tejas_${flatName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_tejas',
          'APARTMENT',
          flatName,
          mapStatus(statusVal),
          null,
          `Floor ${floorNum}`,
          flatName.includes('A') ? 'East' : 'West',
          saleable,
          saleable ? saleable * 6500 : null,
          saleable ? `Rs. ${(saleable * 6500).toLocaleString('en-IN')}` : null,
          'bld_tejas_1',
          `flr_tejas_${floorNum}`,
          '3 BHK Luxury Flat',
          plinth,
          common,
          saleable,
          plinth ? plinth * 0.85 : null,
          uds,
          'Nova',
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA TEJAS', i + 1,
          now, now, now, now
        );
        seededTejas++;
      }
      console.log(`[Seed] Seeded ${seededTejas} verified apartments for Nova Tejas.`);
    }

    // 5. Nova Edens (43 plots)
    if (allData['Nova Edens']) {
      const rows = allData['Nova Edens'].all_rows;
      let seededEdens = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[2] === null || r[2] === undefined || r[0] === null) continue;
        const phase = r[1] ? String(r[1]).trim() : 'Edens';
        const plotNo = String(r[2]).trim();
        if (!plotNo) continue;
        const area = typeof r[3] === 'number' ? r[3] : parseFloat(String(r[3])) || null;
        const facing = r[4] ? String(r[4]).trim() : null;
        const statusVal = r[5] ? String(r[5]).trim() : 'Available';

        const fullPlotName = phase && phase !== 'Edens' ? `${phase} - Plot ${plotNo}` : `Plot ${plotNo}`;
        const propId = `prop_edens_${phase.replace(/[^a-zA-Z0-9]/g, '_')}_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_edens',
          'PLOT',
          fullPlotName,
          mapStatus(statusVal),
          null,
          phase,
          facing,
          area,
          area ? area * 2100 : null,
          area ? `Rs. ${(area * 2100).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, null,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'Nova Edens', i + 1,
          now, now, now, now
        );
        seededEdens++;
      }
      console.log(`[Seed] Seeded ${seededEdens} verified plots for Nova Edens.`);
    }

    // 6. Nova City (8 plots)
    if (allData['NOVA CITY']) {
      const rows = allData['NOVA CITY'].all_rows;
      let seededCity = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined || r[0] === null) continue;
        const plotNo = String(r[1]).trim();
        if (!plotNo) continue;
        const sqft = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const statusVal = r[3] ? String(r[3]).trim() : 'Available';

        const propId = `prop_city_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_city',
          'PLOT',
          plotNo,
          mapStatus(statusVal),
          null,
          'Sector A',
          'North',
          sqft,
          sqft ? sqft * 1650 : null,
          sqft ? `Rs. ${(sqft * 1650).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, null,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA CITY', i + 1,
          now, now, now, now
        );
        seededCity++;
      }
      console.log(`[Seed] Seeded ${seededCity} verified plots for Nova City.`);
    }

    // 7. Nova Hi-Tech (4 plots)
    if (allData['NOVA HI - TECH']) {
      const rows = allData['NOVA HI - TECH'].all_rows;
      let seededHitech = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined || r[0] === null) continue;
        const plotNo = String(r[1]).trim();
        if (!plotNo) continue;
        const sqft = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const facing = r[3] ? String(r[3]).trim() : 'South';
        const statusVal = r[4] ? String(r[4]).trim() : 'Available';

        const propId = `prop_hitech_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_hi_tech',
          'PLOT',
          plotNo,
          mapStatus(statusVal),
          null,
          'Tech Block',
          facing,
          sqft,
          sqft ? sqft * 2400 : null,
          sqft ? `Rs. ${(sqft * 2400).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, null,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA HI - TECH', i + 1,
          now, now, now, now
        );
        seededHitech++;
      }
      console.log(`[Seed] Seeded ${seededHitech} verified plots for Nova Hi-Tech.`);
    }

    // 8. Nova KNT & KNT Phase 3 (11 plots)
    if (allData['KNT']) {
      const rows = allData['KNT'].all_rows;
      let seededKnt = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        // Section 1: Nova KNT
        if (r[1] !== null && r[1] !== undefined && r[0] !== null) {
          const plotNo = String(r[1]).trim();
          const area = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
          const statusVal = r[3] ? String(r[3]).trim() : 'Available';

          const propId = `prop_knt_p1_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
          insertProperty.run(
            propId,
            'proj_nova_knt',
            'PLOT',
            plotNo,
            mapStatus(statusVal),
            null,
            'Phase 1',
            'East',
            area,
            area ? area * 2300 : null,
            area ? `Rs. ${(area * 2300).toLocaleString('en-IN')}` : null,
            null, null, null, null, null, null, null, null, null,
            0, null,
            'Nova Available List 18.7.26 (1).xlsx', 'KNT', i + 1,
            now, now, now, now
          );
          seededKnt++;
        }
        // Section 2: Nova KNT Phase 3
        if (r[6] !== null && r[6] !== undefined && r[5] !== null) {
          const plotNo = String(r[6]).trim();
          const area = typeof r[7] === 'number' ? r[7] : parseFloat(String(r[7])) || null;
          const facing = r[8] ? String(r[8]).trim() : null;
          const statusVal = r[9] ? String(r[9]).trim() : 'Available';

          const propId = `prop_knt_p3_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
          insertProperty.run(
            propId,
            'proj_nova_knt',
            plotNo.toLowerCase().includes('shop') ? 'COMMERCIAL_SHOP' : 'PLOT',
            plotNo,
            mapStatus(statusVal),
            null,
            'Phase 3',
            facing,
            area,
            area ? area * 2600 : null,
            area ? `Rs. ${(area * 2600).toLocaleString('en-IN')}` : null,
            null, null, null, null, null, null, null, null, null,
            0, null,
            'Nova Available List 18.7.26 (1).xlsx', 'KNT Phase 3', i + 1,
            now, now, now, now
          );
          seededKnt++;
        }
      }
      console.log(`[Seed] Seeded ${seededKnt} verified plots for Nova KNT.`);
    }

    // 9. Nova Aardhiya Nagar (5 plots)
    if (allData['NOVA AARDHIYA NAGAR']) {
      const rows = allData['NOVA AARDHIYA NAGAR'].all_rows;
      let seededAardhiya = 0;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[1] === null || r[1] === undefined || r[0] === null) continue;
        const plotNo = String(r[1]).trim();
        if (!plotNo) continue;
        const area = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const facing = r[3] ? String(r[3]).trim() : 'North';
        const statusVal = r[4] ? String(r[4]).trim() : 'Available';

        const propId = `prop_aardhiya_${plotNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
        insertProperty.run(
          propId,
          'proj_nova_aardhiya',
          plotNo.toLowerCase().includes('shop') ? 'COMMERCIAL_SHOP' : 'PLOT',
          plotNo,
          mapStatus(statusVal),
          null,
          'Main Enclave',
          facing,
          area,
          area ? area * 1900 : null,
          area ? `Rs. ${(area * 1900).toLocaleString('en-IN')}` : null,
          null, null, null, null, null, null, null, null, null,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA AARDHIYA NAGAR', i + 1,
          now, now, now, now
        );
        seededAardhiya++;
      }
      console.log(`[Seed] Seeded ${seededAardhiya} verified plots for Nova Aardhiya Nagar.`);
    }

    // 10. Nova Ramala (1 Apartment)
    if (allData['NOVA RAMALA']) {
      const rows = allData['NOVA RAMALA'].all_rows;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1] || r[0] === null) continue;
        const flatName = String(r[1]).trim();
        const type = r[2] ? String(r[2]).trim() : '2B2T+STUDY';
        const facing = r[3] ? String(r[3]).trim() : 'North';
        const plinth = typeof r[4] === 'number' ? r[4] : parseFloat(String(r[4])) || null;
        const common = typeof r[5] === 'number' ? r[5] : parseFloat(String(r[5])) || null;
        const saleable = typeof r[6] === 'number' ? r[6] : parseFloat(String(r[6])) || null;
        const carpet = typeof r[7] === 'number' ? r[7] : parseFloat(String(r[7])) || null;
        const uds = typeof r[8] === 'number' ? r[8] : parseFloat(String(r[8])) || null;
        const statusVal = r[9] ? String(r[9]).trim() : 'Available';

        insertProperty.run(
          'prop_ramala_3b',
          'proj_nova_ramala',
          'APARTMENT',
          flatName,
          'AVAILABLE',
          null,
          '3rd Floor',
          facing,
          saleable,
          saleable ? saleable * 7500 : null,
          saleable ? `Rs. ${(saleable * 7500).toLocaleString('en-IN')}` : null,
          null, null,
          type,
          plinth,
          common,
          saleable,
          carpet,
          uds,
          'Nova',
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'NOVA RAMALA', i + 1,
          now, now, now, now
        );
        console.log('[Seed] Seeded verified apartment for Nova Ramala.');
      }
    }

    // 11. Nova VR Squares (1 Apartment)
    if (allData['VR SQUARE']) {
      const rows = allData['VR SQUARE'].all_rows;
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1] || r[0] === null) continue;
        const flatName = String(r[1]).trim();
        const plinth = typeof r[2] === 'number' ? r[2] : parseFloat(String(r[2])) || null;
        const common = typeof r[3] === 'number' ? r[3] : parseFloat(String(r[3])) || null;
        const saleable = typeof r[4] === 'number' ? r[4] : parseFloat(String(r[4])) || null;
        const uds = typeof r[5] === 'number' ? r[5] : parseFloat(String(r[5])) || null;
        const share = r[6] ? String(r[6]).trim() : 'Available';

        insertProperty.run(
          'prop_vrsquares_1b',
          'proj_nova_vr_squares',
          'APARTMENT',
          flatName,
          'AVAILABLE',
          null,
          '1st Floor',
          'East',
          saleable,
          saleable ? saleable * 7200 : null,
          saleable ? `Rs. ${(saleable * 7200).toLocaleString('en-IN')}` : null,
          null, null,
          '3 BHK Flat',
          plinth,
          common,
          saleable,
          plinth ? plinth * 0.85 : null,
          uds,
          share,
          0, null,
          'Nova Available List 18.7.26 (1).xlsx', 'VR SQUARE', i + 1,
          now, now, now, now
        );
        console.log('[Seed] Seeded verified apartment for Nova VR Squares.');
      }
    }
  });

  propTransaction();
  console.log('[Seed] Complete verified inventory seeded successfully.');
}

function mapStatus(val: string): string {
  const v = (val || '').toUpperCase().trim();
  if (v.includes('BOOKED')) return 'BOOKED';
  if (v.includes('REG') || v.includes('REGISTERED')) return 'REGISTERED';
  if (v.includes('SOLD')) return 'SOLD';
  if (v.includes('RESERVED')) return 'RESERVED';
  if (v.includes('BLOCKED')) return 'BLOCKED';
  return 'AVAILABLE';
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}

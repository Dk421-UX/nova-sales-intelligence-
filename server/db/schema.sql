-- Canonical SQL Schema for Nova Property Explorer
-- Enforces data integrity, foreign keys, uniqueness, versioning, audit logging, and draft/published state

PRAGMA foreign_keys = ON;

-- 1. USERS & AUTHENTICATION
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CRM_STAFF')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. PROJECTS REGISTRY
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL CHECK (project_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL')),
    location TEXT NOT NULL,
    city TEXT NOT NULL,
    description TEXT,
    highlights TEXT, -- JSON Array
    amenities TEXT,  -- JSON Array
    total_area_reference TEXT,
    total_units_reference INTEGER, -- Reference count from brochure/layout (NOT current availability)
    brochure_reference TEXT,
    cover_image TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMING_SOON', 'INVENTORY_PENDING', 'SOLD_OUT', 'COMPLETED', 'ARCHIVED')),
    current_version INTEGER DEFAULT 1,
    is_published INTEGER DEFAULT 1,
    last_verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 3. PROJECT CHANGE MANAGEMENT & VERSIONING
CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    project_type TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 4. PROJECT MEDIA & ASSETS
CREATE TABLE IF NOT EXISTS project_media (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL CHECK (media_type IN ('COVER_IMAGE', 'BROCHURE_PDF', 'LAYOUT_PLAN_PDF', 'GALLERY_IMAGE', 'FLOOR_PLAN_PDF')),
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes INTEGER,
    is_featured INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 5. SPATIAL LAYOUT REGISTRY
CREATE TABLE IF NOT EXISTS layouts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    layout_type TEXT NOT NULL CHECK (layout_type IN ('MASTER_PLAN', 'SUBDIVISION_PLAN', 'FLOOR_PLAN', 'SCHEME_PLAN')),
    version TEXT NOT NULL DEFAULT '1.0',
    svg_content TEXT,
    image_url TEXT,
    width REAL NOT NULL DEFAULT 1000,
    height REAL NOT NULL DEFAULT 800,
    viewbox TEXT NOT NULL DEFAULT '0 0 1000 800',
    reference_stats TEXT, -- JSON stats: { total_plots, ews_plots, osr_sqft, tangedco_sqft, public_purpose_sqft, road_area_sqft }
    status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 6. APARTMENT BUILDING REGISTRY (Hierarchical structure for Apartment Projects)
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "Block A", "Tower 1", "Main Block"
    total_floors INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL
);

-- 7. APARTMENT FLOOR REGISTRY
CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_name TEXT NOT NULL, -- e.g. "Ground Floor", "1st Floor", "3rd Floor"
    floor_plan_svg TEXT,
    created_at TEXT NOT NULL
);

-- 8. UNIVERSAL PROPERTY MODEL (Unified for PLOT & APARTMENT)
CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    property_type TEXT NOT NULL CHECK (property_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL_SHOP')),
    property_number TEXT NOT NULL, -- e.g. '105', 'PP:1', 'Flat - 1A', '109-110A'
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED')),
    draft_status TEXT, -- Temporary status change in draft mode before publishing
    section_or_phase TEXT, -- e.g. 'Phase 1', 'Section B', 'Edens 4', 'KNT Phase 3'
    facing TEXT, -- e.g. 'East', 'North', 'South', 'West', 'Corner - West', 'South East'
    area_sqft REAL,
    price REAL,
    price_display TEXT,
    -- Apartment-specific relational & structural fields
    building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id TEXT REFERENCES floors(id) ON DELETE SET NULL,
    unit_type TEXT, -- e.g. '2B2T+STUDY', '2 BHK', '3 BHK', '4 BHK'
    plinth_area_sqft REAL,
    common_area_sqft REAL,
    saleable_area_sqft REAL,
    carpet_area_sqft REAL,
    uds_sqft REAL,
    share_type TEXT, -- e.g. 'Nova', 'Landowner'
    -- Source Traceability & Versioning
    is_published INTEGER DEFAULT 1,
    is_archived INTEGER DEFAULT 0,
    is_superseded INTEGER DEFAULT 0, -- Set to 1 when project changes type (e.g. Vasantham plot records)
    superseded_reason TEXT,
    has_pending_changes INTEGER DEFAULT 0,
    source_document TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    last_verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT NOT NULL
);

-- Compound index and unique constraint: (project_id, property_number, is_superseded)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_property_num_active 
ON properties(project_id, property_number) 
WHERE is_superseded = 0 AND is_archived = 0;

CREATE INDEX IF NOT EXISTS idx_properties_project_status ON properties(project_id, status, is_published, is_superseded, is_archived);
CREATE INDEX IF NOT EXISTS idx_properties_facing ON properties(facing);
CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area_sqft);

-- 9. SPATIAL GEOMETRY FOR PROPERTIES (Vector & Polygon mapping on layouts)
CREATE TABLE IF NOT EXISTS property_geometry (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    layout_id TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    geometry_type TEXT NOT NULL DEFAULT 'POLYGON' CHECK (geometry_type IN ('POLYGON', 'RECT', 'PATH', 'PIN')),
    svg_path TEXT,
    polygon_points TEXT, -- JSON Array: [[x1,y1], [x2,y2], ...]
    center_x REAL NOT NULL,
    center_y REAL NOT NULL,
    label_x REAL,
    label_y REAL,
    custom_styling TEXT, -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_geometry_prop_layout ON property_geometry(property_id, layout_id);

-- 10. DATA CONFLICTS & ANOMALY TRACKING
CREATE TABLE IF NOT EXISTS data_conflicts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
    field_name TEXT NOT NULL,
    source_a TEXT NOT NULL,
    value_a TEXT NOT NULL,
    source_b TEXT NOT NULL,
    value_b TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
    resolution_note TEXT,
    created_at TEXT NOT NULL
);

-- 11. EXCEL IMPORTS & AUDIT RECORDS
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    detected_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    detected_sheet_name TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    conflict_rows INTEGER NOT NULL DEFAULT 0,
    missing_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'APPLIED', 'REJECTED')),
    change_summary TEXT, -- JSON: { new_count, updated_count, conflict_count, unchanged_count, missing_count }
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_rows (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    raw_data TEXT NOT NULL, -- JSON
    normalized_data TEXT NOT NULL, -- JSON
    validation_status TEXT NOT NULL CHECK (validation_status IN ('VALID', 'INVALID', 'CONFLICT', 'DUPLICATE', 'MISSING')),
    validation_message TEXT
);

-- 12. DRAFT CHANGES QUEUE (Staging before publish)
CREATE TABLE IF NOT EXISTS draft_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('STATUS_UPDATE', 'ATTRIBUTE_UPDATE', 'PROPERTY_CREATE', 'PROPERTY_ARCHIVE')),
    old_data TEXT, -- JSON
    new_data TEXT NOT NULL, -- JSON
    staged_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 13. COMPREHENSIVE OPERATIONAL AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PROPERTY', 'PROJECT', 'LAYOUT', 'IMPORT', 'PUBLISH', 'CONFIG')),
    entity_id TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'STATUS_CHANGE', 'SUPERSEDE', 'ARCHIVE', 'PUBLISH', 'CONFIG_CHANGE'
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    performed_by TEXT NOT NULL,
    user_role TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_project_time ON audit_logs(project_id, created_at);

-- 14. CUSTOMER ENQUIRIES & LEAD CAPTURE
CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'CLOSED')),
    created_at TEXT NOT NULL
);

-- 15. OFFICIAL WEBSITE CONTENT CACHE & ATTRIBUTION
CREATE TABLE IF NOT EXISTS official_content_cache (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    amenities TEXT, -- JSON Array
    media_urls TEXT, -- JSON Array
    retrieved_at TEXT NOT NULL,
    last_verified_at TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE'
);

-- 16. PROJECT SOURCES TRACKING
CREATE TABLE IF NOT EXISTS project_sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('OFFICIAL_WEBSITE', 'BROCHURE_PDF', 'CAD_LAYOUT', 'DAILY_EXCEL', 'CRM_MANUAL')),
    content_version TEXT DEFAULT '1.0',
    retrieved_at TEXT NOT NULL,
    last_verified_at TEXT NOT NULL,
    metadata TEXT -- JSON
);


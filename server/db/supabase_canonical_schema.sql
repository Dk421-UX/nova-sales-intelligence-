-- ==============================================================================
-- NOVA PROPERTY EXPLORER — CANONICAL PRODUCTION POSTGRESQL SCHEMA FOR SUPABASE
-- 100% Compatible with Application String Identifiers (proj_..., prop_..., lay_..., usr_...)
-- ==============================================================================

-- 1. USERS & AUTHENTICATION
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'CRM_STAFF', 'AUDITOR')),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PROJECTS REGISTRY
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(100) PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_type VARCHAR(50) NOT NULL CHECK (project_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL')),
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    description TEXT,
    highlights TEXT DEFAULT '[]',
    amenities TEXT DEFAULT '[]',
    total_area_reference VARCHAR(100),
    total_units_reference INTEGER,
    brochure_reference TEXT,
    cover_image TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMING_SOON', 'INVENTORY_PENDING', 'SOLD_OUT', 'COMPLETED', 'ARCHIVED')),
    source VARCHAR(100) DEFAULT 'OFFICIAL_WEBSITE',
    official_url TEXT,
    current_version INTEGER DEFAULT 1,
    is_published INTEGER DEFAULT 1,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PROJECT VERSIONS
CREATE TABLE IF NOT EXISTS project_versions (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    project_type VARCHAR(50) NOT NULL,
    change_summary TEXT NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROJECT SOURCES
CREATE TABLE IF NOT EXISTS project_sources (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    content_version VARCHAR(50) DEFAULT '1.0',
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata TEXT DEFAULT '{}'
);

-- 5. PROJECT MEDIA & ASSETS
CREATE TABLE IF NOT EXISTS project_media (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    source_type VARCHAR(50) DEFAULT 'CRM_UPLOAD',
    source_url TEXT,
    is_featured INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 1,
    is_published INTEGER DEFAULT 1,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SPATIAL LAYOUT REGISTRY
CREATE TABLE IF NOT EXISTS layouts (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    layout_type VARCHAR(50) NOT NULL CHECK (layout_type IN ('MASTER_PLAN', 'SUBDIVISION_PLAN', 'FLOOR_PLAN', 'SCHEME_PLAN')),
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    svg_content TEXT,
    image_url TEXT,
    width REAL NOT NULL DEFAULT 1000,
    height REAL NOT NULL DEFAULT 800,
    viewbox VARCHAR(100) NOT NULL DEFAULT '0 0 1000 800',
    reference_stats TEXT DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. APARTMENT BUILDINGS & FLOORS
CREATE TABLE IF NOT EXISTS buildings (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    total_floors INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floors (
    id VARCHAR(100) PRIMARY KEY,
    building_id VARCHAR(100) NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_name VARCHAR(100) NOT NULL,
    floor_plan_svg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. PROPERTIES / INVENTORY REGISTRY
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL_SHOP')),
    property_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED')),
    draft_status VARCHAR(50) CHECK (draft_status IN ('AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED')),
    section_or_phase VARCHAR(100),
    facing VARCHAR(50),
    area_sqft NUMERIC(10, 2),
    price NUMERIC(15, 2),
    price_display VARCHAR(100),
    building_id VARCHAR(100) REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id VARCHAR(100) REFERENCES floors(id) ON DELETE SET NULL,
    unit_type VARCHAR(50),
    plinth_area_sqft NUMERIC(10, 2),
    common_area_sqft NUMERIC(10, 2),
    saleable_area_sqft NUMERIC(10, 2),
    carpet_area_sqft NUMERIC(10, 2),
    uds_sqft NUMERIC(10, 2),
    share_type VARCHAR(50),
    is_published INTEGER DEFAULT 1,
    is_archived INTEGER DEFAULT 0,
    is_superseded INTEGER DEFAULT 0,
    superseded_reason TEXT,
    has_pending_changes INTEGER DEFAULT 0,
    source_document VARCHAR(255),
    source_sheet VARCHAR(255),
    source_row INTEGER,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PROPERTY GEOMETRY
CREATE TABLE IF NOT EXISTS property_geometry (
    id VARCHAR(100) PRIMARY KEY,
    property_id VARCHAR(100) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    layout_id VARCHAR(100) NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    geometry_type VARCHAR(50) NOT NULL DEFAULT 'POLYGON',
    svg_path TEXT,
    polygon_points TEXT,
    center_x REAL NOT NULL,
    center_y REAL NOT NULL,
    label_x REAL,
    label_y REAL,
    custom_styling TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. IMPORTS & IMPORT ROWS
CREATE TABLE IF NOT EXISTS imports (
    id VARCHAR(100) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    detected_project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    detected_sheet_name VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL,
    valid_rows INTEGER NOT NULL,
    conflict_rows INTEGER NOT NULL,
    missing_rows INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'APPLIED', 'REJECTED')),
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_rows (
    id VARCHAR(100) PRIMARY KEY,
    import_id VARCHAR(100) NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    raw_data TEXT NOT NULL,
    normalized_data TEXT NOT NULL,
    validation_status VARCHAR(50) NOT NULL CHECK (validation_status IN ('VALID', 'INVALID', 'DUPLICATE', 'CONFLICT', 'MISSING')),
    validation_message TEXT
);

-- 11. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    project_id VARCHAR(100) REFERENCES projects(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    old_values TEXT,
    new_values TEXT,
    performed_by VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. OFFICIAL CONTENT CACHE & ENQUIRIES
CREATE TABLE IF NOT EXISTS official_content_cache (
    id VARCHAR(100) PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    content_data TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiries (
    id VARCHAR(100) PRIMARY KEY,
    project_id VARCHAR(100) REFERENCES projects(id) ON DELETE SET NULL,
    property_id VARCHAR(100) REFERENCES properties(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_properties_project_status ON properties(project_id, status);
CREATE INDEX IF NOT EXISTS idx_properties_published ON properties(is_published, is_archived, is_superseded);
CREATE INDEX IF NOT EXISTS idx_layouts_project_active ON layouts(project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_import_rows_import ON import_rows(import_id);

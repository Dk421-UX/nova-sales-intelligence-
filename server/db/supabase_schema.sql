-- ==============================================================================
-- SUPABASE POSTGRESQL CANONICAL PRODUCTION SCHEMA FOR NOVA PROPERTY EXPLORER
-- Includes Row Level Security (RLS), Audit Logging, Source Attribution & Versioning
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'CRM_STAFF', 'AUDITOR')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PROJECTS REGISTRY
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_type VARCHAR(50) NOT NULL CHECK (project_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL')),
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    description TEXT,
    highlights JSONB DEFAULT '[]'::jsonb,
    amenities JSONB DEFAULT '[]'::jsonb,
    total_area_reference VARCHAR(100),
    total_units_reference INTEGER,
    brochure_reference TEXT,
    cover_image TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMING_SOON', 'INVENTORY_PENDING', 'SOLD_OUT', 'ARCHIVED')),
    source VARCHAR(100) DEFAULT 'OFFICIAL_WEBSITE',
    official_url TEXT,
    current_version INTEGER DEFAULT 1,
    is_published BOOLEAN DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PROJECT SOURCES & VERSIONS
CREATE TABLE IF NOT EXISTS project_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('OFFICIAL_WEBSITE', 'BROCHURE_PDF', 'CAD_LAYOUT', 'DAILY_EXCEL', 'CRM_MANUAL')),
    content_version VARCHAR(50) DEFAULT '1.0',
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS project_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    project_type VARCHAR(50) NOT NULL,
    change_summary TEXT NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROJECT MEDIA & ASSETS
CREATE TABLE IF NOT EXISTS project_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('COVER_IMAGE', 'BROCHURE_PDF', 'LAYOUT_PLAN_PDF', 'GALLERY_IMAGE', 'FLOOR_PLAN_PDF', 'OFFICIAL_LOGO')),
    title VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    source_type VARCHAR(50) DEFAULT 'CRM_UPLOAD' CHECK (source_type IN ('OFFICIAL_WEBSITE', 'CRM_UPLOAD', 'BROCHURE', 'APPROVED_ASSET')),
    source_url TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT TRUE,
    uploaded_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SPATIAL LAYOUT REGISTRY
CREATE TABLE IF NOT EXISTS layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    layout_type VARCHAR(50) NOT NULL CHECK (layout_type IN ('MASTER_PLAN', 'SUBDIVISION_PLAN', 'FLOOR_PLAN', 'SCHEME_PLAN')),
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    svg_content TEXT,
    image_url TEXT,
    width REAL NOT NULL DEFAULT 1000,
    height REAL NOT NULL DEFAULT 800,
    viewbox VARCHAR(100) NOT NULL DEFAULT '0 0 1000 800',
    reference_stats JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    source VARCHAR(100) DEFAULT 'OFFICIAL_BROCHURE',
    uploaded_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. APARTMENT BUILDINGS & FLOORS HIERARCHY
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    total_floors INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_name VARCHAR(100) NOT NULL,
    floor_plan_svg TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. UNIVERSAL PROPERTIES INVENTORY (PLOTS & APARTMENTS)
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('PLOT', 'APARTMENT', 'COMMERCIAL_SHOP')),
    property_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED', 'UNKNOWN')),
    draft_status VARCHAR(50) CHECK (draft_status IN ('AVAILABLE', 'BOOKED', 'REGISTERED', 'SOLD', 'RESERVED', 'BLOCKED', 'UNKNOWN')),
    section_or_phase VARCHAR(100),
    facing VARCHAR(100),
    area_sqft REAL,
    price REAL,
    price_display VARCHAR(100),
    -- Apartment Relational Fields
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
    unit_type VARCHAR(100),
    plinth_area_sqft REAL,
    common_area_sqft REAL,
    saleable_area_sqft REAL,
    carpet_area_sqft REAL,
    uds_sqft REAL,
    share_type VARCHAR(100),
    -- Source Traceability & Versioning
    is_published BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_superseded BOOLEAN DEFAULT FALSE,
    superseded_reason TEXT,
    has_pending_changes BOOLEAN DEFAULT FALSE,
    source_document TEXT,
    source_sheet VARCHAR(100),
    source_row INTEGER,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_prop_num UNIQUE (project_id, property_number)
);

CREATE INDEX IF NOT EXISTS idx_supa_properties_lookup ON properties(project_id, status, is_published, is_superseded, is_archived);
CREATE INDEX IF NOT EXISTS idx_supa_properties_facing ON properties(facing);
CREATE INDEX IF NOT EXISTS idx_supa_properties_area ON properties(area_sqft);

-- 8. PROPERTY SPATIAL GEOMETRY
CREATE TABLE IF NOT EXISTS property_geometry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    layout_id UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    geometry_type VARCHAR(50) NOT NULL DEFAULT 'POLYGON' CHECK (geometry_type IN ('POLYGON', 'RECT', 'PATH', 'PIN')),
    svg_path TEXT,
    polygon_points JSONB,
    center_x REAL NOT NULL,
    center_y REAL NOT NULL,
    label_x REAL,
    label_y REAL,
    custom_styling JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_prop_layout_geom UNIQUE (property_id, layout_id)
);

-- 9. DAILY EXCEL IMPORTS & AUDIT HISTORY
CREATE TABLE IF NOT EXISTS imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    detected_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    detected_sheet_name VARCHAR(100),
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    conflict_rows INTEGER NOT NULL DEFAULT 0,
    missing_rows INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'APPLIED', 'REJECTED')),
    change_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    raw_data JSONB NOT NULL,
    normalized_data JSONB NOT NULL,
    validation_status VARCHAR(50) NOT NULL CHECK (validation_status IN ('VALID', 'INVALID', 'CONFLICT', 'DUPLICATE', 'MISSING')),
    validation_message TEXT
);

-- 10. PUBLISH DRAFT CHANGES
CREATE TABLE IF NOT EXISTS draft_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('STATUS_UPDATE', 'ATTRIBUTE_UPDATE', 'PROPERTY_CREATE', 'PROPERTY_ARCHIVE')),
    old_data JSONB,
    new_data JSONB NOT NULL,
    staged_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('PROPERTY', 'PROJECT', 'LAYOUT', 'IMPORT', 'PUBLISH', 'CONFIG')),
    entity_id VARCHAR(255) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    performed_by VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. CUSTOMER ENQUIRIES
CREATE TABLE IF NOT EXISTS enquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255),
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. OFFICIAL WEBSITE CONTENT CACHE
CREATE TABLE IF NOT EXISTS official_content_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    amenities JSONB DEFAULT '[]'::jsonb,
    media_urls JSONB DEFAULT '[]'::jsonb,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'ACTIVE'
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ POLICIES (Only published, non-archived, non-superseded records)
CREATE POLICY "Public Read Published Projects" 
ON projects FOR SELECT 
USING (is_published = TRUE AND status != 'ARCHIVED');

CREATE POLICY "Public Read Published Properties" 
ON properties FOR SELECT 
USING (is_published = TRUE AND is_archived = FALSE AND is_superseded = FALSE);

CREATE POLICY "Public Read Layouts" 
ON layouts FOR SELECT 
USING (is_active = TRUE);

CREATE POLICY "Public Read Buildings" 
ON buildings FOR SELECT 
USING (TRUE);

CREATE POLICY "Public Read Floors" 
ON floors FOR SELECT 
USING (TRUE);

CREATE POLICY "Public Read Media" 
ON project_media FOR SELECT 
USING (is_published = TRUE);

CREATE POLICY "Public Create Enquiries" 
ON enquiries FOR INSERT 
WITH CHECK (TRUE);

-- STAFF / SERVICE ROLE POLICIES (Full CRUD for authenticated staff and service role)
CREATE POLICY "Service Role Full Access Projects" ON projects TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service Role Full Access Properties" ON properties TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service Role Full Access Drafts" ON draft_changes TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service Role Full Access Audit" ON audit_logs TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service Role Full Access Imports" ON imports TO service_role USING (TRUE) WITH CHECK (TRUE);

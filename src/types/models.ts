export interface FreshnessInfo {
  status: 'FRESH' | 'AGING' | 'STALE';
  label: string;
  last_verified_at: string;
  hours_since_verification: number;
  is_stale: boolean;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  project_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL';
  location: string;
  city: string;
  description: string | null;
  highlights: string[];
  amenities: string[];
  total_area_reference: string | null;
  total_units_reference: number | null;
  brochure_reference: string | null;
  cover_image: string | null;
  status: string;
  current_version: number;
  is_published: number;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
  official_url?: string | null;
  freshness?: FreshnessInfo;
  stats: {
    total_inventory: number;
    available: number;
    booked: number;
    registered: number;
    sold: number;
    reserved: number;
  };
}

export interface Property {
  id: string;
  project_id: string;
  project_name?: string;
  project_slug?: string;
  property_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP';
  property_number: string;
  status: string;
  draft_status: string | null;
  effective_status: string;
  section_or_phase: string | null;
  facing: string | null;
  area_sqft: number | null;
  price: number | null;
  price_display: string | null;
  building_id: string | null;
  building_name?: string | null;
  floor_id: string | null;
  floor_name?: string | null;
  unit_type: string | null;
  plinth_area_sqft: number | null;
  common_area_sqft: number | null;
  saleable_area_sqft: number | null;
  carpet_area_sqft: number | null;
  uds_sqft: number | null;
  share_type: string | null;
  is_published: number;
  is_archived: number;
  is_superseded: number;
  superseded_reason: string | null;
  has_pending_changes: number;
  source_document: string | null;
  source_sheet: string | null;
  source_row: number | null;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  geometry?: {
    geometry_type: string;
    svg_path: string | null;
    polygon_points: number[][] | null;
    center_x: number;
    center_y: number;
  } | null;
}

export interface LayoutPlan {
  id: string;
  project_id: string;
  name: string;
  layout_type: string;
  version: string;
  svg_content: string | null;
  image_url: string | null;
  width: number;
  height: number;
  viewbox: string;
  reference_stats: any;
  is_active: number;
}

export interface Building {
  id: string;
  project_id: string;
  name: string;
  total_floors: number;
  description: string | null;
  floors?: Floor[];
}

export interface Floor {
  id: string;
  building_id: string;
  floor_number: number;
  floor_name: string;
  floor_plan_svg: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'CRM_STAFF';
  fullName: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  action: string;
  old_values: any;
  new_values: any;
  performed_by: string;
  user_role: string;
  ip_address: string | null;
  created_at: string;
}

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function introspect() {
  console.log('[Introspect] Inspecting all tables in Supabase...');
  const tables = [
    'users', 'projects', 'project_versions', 'project_sources', 'project_media',
    'layouts', 'buildings', 'floors', 'properties', 'property_geometry',
    'data_conflicts', 'imports', 'import_rows', 'draft_changes', 'audit_logs',
    'enquiries', 'official_content_cache'
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table [${t}]: ERROR ${error.message}`);
    } else {
      console.log(`Table [${t}]: OK. Columns:`, data && data.length > 0 ? Object.keys(data[0]) : 'Empty table (exists)');
    }
  }
}

introspect();

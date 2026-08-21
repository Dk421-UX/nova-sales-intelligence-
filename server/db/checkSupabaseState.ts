import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

async function check() {
  console.log('[Supabase Check] Checking tables in Supabase...');
  const tables = [
    'users', 'projects', 'project_versions', 'project_sources', 'project_media',
    'layouts', 'buildings', 'floors', 'properties', 'property_geometry',
    'imports', 'import_rows', 'draft_changes', 'audit_logs', 'enquiries',
    'official_content_cache'
  ];
  
  for (const t of tables) {
    try {
      const { data, count, error } = await supabase.from(t).select('*', { count: 'exact' });
      if (error) {
        console.log(`Table: ${t.padEnd(25)} | ERROR: ${error.message} (Code: ${error.code})`);
      } else {
        console.log(`Table: ${t.padEnd(25)} | Count: ${String(count).padStart(5)} | Sample ID: ${data?.[0]?.id || 'None'}`);
      }
    } catch (err: any) {
      console.log(`Table: ${t.padEnd(25)} | Exception: ${err.message}`);
    }
  }

  // Also check buckets
  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      console.log('Storage Buckets ERROR:', bErr.message);
    } else {
      console.log('Storage Buckets:', buckets?.map(b => `${b.name} (public: ${b.public})`));
    }
  } catch (err: any) {
    console.log('Storage Buckets Exception:', err.message);
  }
}

check();

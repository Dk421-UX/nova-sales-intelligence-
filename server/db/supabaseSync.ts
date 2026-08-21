import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient.ts';
import { getDb } from './database.ts';
import { config } from '../config.ts';

const tablesInOrder = [
  'users',
  'projects',
  'project_versions',
  'project_media',
  'project_sources',
  'layouts',
  'buildings',
  'floors',
  'properties',
  'property_geometry',
  'data_conflicts',
  'imports',
  'import_rows',
  'draft_changes',
  'audit_logs',
  'enquiries',
  'official_content_cache'
];

/**
 * Initializes and synchronizes the application state from Supabase PostgreSQL.
 * On server startup (or serverless wake-up), this pulls the permanent production dataset
 * from Supabase so the application always serves authoritative cloud data.
 */
export async function initAndSyncFromSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    if (config.nodeEnv === 'production') {
      throw new Error('[SupabaseSync FATAL] SUPABASE_URL and service keys are missing in production.');
    }
    console.log('[SupabaseSync] Supabase not configured in local environment; using local database.');
    return false;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (config.nodeEnv === 'production') {
      throw new Error('[SupabaseSync FATAL] Supabase admin client initialization failed in production.');
    }
    return false;
  }

  try {
    console.log('[SupabaseSync] Connecting to Supabase PostgreSQL...');
    
    // Check projects count in Supabase
    const { data: supaProjects, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

    if (projErr) {
      console.error('[SupabaseSync] Error querying Supabase projects:', projErr.message);
      if (config.nodeEnv === 'production') throw projErr;
      return false;
    }

    const db = getDb();

    // If Supabase has 0 projects, restore the 12 canonical projects first
    if (!supaProjects || supaProjects.length === 0) {
      console.log('[SupabaseSync] Supabase is unpopulated. Triggering canonical restore...');
      const { restoreAndVerifyOriginal12 } = await import('./restoreOriginal12.ts');
      await restoreAndVerifyOriginal12();
    }

    console.log(`[SupabaseSync] Hydrating application cache from Supabase (${supaProjects?.length || 0} projects found)...`);

    // Clear active tables in reverse dependency order (child tables first) to respect foreign keys
    const tablesInReverse = [...tablesInOrder].reverse();
    for (const table of tablesInReverse) {
      try {
        db.prepare(`DELETE FROM "${table}"`).run();
      } catch (e: any) {
        // Table might not exist or already be empty
      }
    }

    // Hydrate tables in dependency order from Supabase
    for (const table of tablesInOrder) {
      const { data: rows, error: rowErr } = await supabase.from(table).select('*');
      if (!rowErr && rows && rows.length > 0) {
        try {
          const sample = rows[0];
          const cols = Object.keys(sample);
          const placeholders = cols.map(() => '?').join(', ');
          const colNames = cols.map(c => `"${c}"`).join(', ');
          const insertStmt = db.prepare(`INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`);

          const insertMany = db.transaction((items: any[]) => {
            for (const item of items) {
              const vals = cols.map(c => item[c] === undefined ? null : item[c]);
              insertStmt.run(...vals);
            }
          });

          insertMany(rows);
          console.log(`[SupabaseSync] Synced table [${table}]: ${rows.length} records hydrated from Supabase.`);
        } catch (tableSyncErr: any) {
          console.warn(`[SupabaseSync] Note syncing table ${table}:`, tableSyncErr.message);
        }
      }
    }

    console.log('[SupabaseSync] ✓ Permanent Supabase PostgreSQL synchronization complete.');
    return true;
  } catch (err: any) {
    console.error('[SupabaseSync] Synchronization error:', err.message);
    if (config.nodeEnv === 'production') {
      throw err;
    }
    return false;
  }
}

/**
 * Writes an entity directly to Supabase PostgreSQL on CRM mutation.
 */
export async function syncEntityToSupabase(table: string, entity: any): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const cleanEntity = { ...entity };
    const { error } = await supabase.from(table).upsert(cleanEntity, { onConflict: 'id' });
    if (error) {
      console.error(`[SupabaseSync] Failed to push mutation for table ${table}:`, error.message);
    } else {
      console.log(`[SupabaseSync] Mutation successfully committed to Supabase for table ${table}, ID: ${entity.id}`);
    }
  } catch (err: any) {
    console.error(`[SupabaseSync] Exception pushing mutation to Supabase for ${table}:`, err.message);
  }
}

/**
 * Deletes an entity from Supabase PostgreSQL on CRM deletion.
 */
export async function deleteEntityFromSupabase(table: string, id: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error(`[SupabaseSync] Failed to delete record from Supabase table ${table}:`, error.message);
    }
  } catch (err: any) {
    console.error(`[SupabaseSync] Exception deleting record from Supabase ${table}:`, err.message);
  }
}

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
 * Initializes and synchronizes the application cache from Supabase PostgreSQL.
 * On server startup (or serverless wake-up), this pulls the permanent production dataset
 * from Supabase so the application always serves authoritative cloud data.
 * NON-DESTRUCTIVE: Uses INSERT OR REPLACE into local cache without dropping existing records.
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

    console.log(`[SupabaseSync] Hydrating application cache from Supabase (${supaProjects?.length || 0} projects found in authoritative PostgreSQL)...`);

    // Temporarily turn off foreign keys on SQLite local cache during bulk hydration to avoid order-of-insert conflicts
    db.pragma('foreign_keys = OFF');

    try {
      // Non-destructive hydration: hydrate tables in dependency order from Supabase
      for (const table of tablesInOrder) {
        try {
          const { data: rows, error: rowErr } = await supabase.from(table).select('*');
          if (!rowErr && rows && rows.length > 0) {
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
          }
        } catch (tableSyncErr: any) {
          console.warn(`[SupabaseSync] Note syncing table ${table}:`, tableSyncErr.message);
        }
      }
    } finally {
      db.pragma('foreign_keys = ON');
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
export async function syncEntityToSupabase(table: string, entity: any): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const cleanEntity: Record<string, any> = {};
    for (const [k, v] of Object.entries(entity)) {
      cleanEntity[k] = v === undefined ? null : v;
    }
    const { error } = await supabase.from(table).upsert(cleanEntity, { onConflict: 'id' });
    if (error) {
      console.error(`[SupabaseSync] Failed to push mutation for table ${table}:`, error.message);
      return false;
    } else {
      console.log(`[SupabaseSync] Mutation successfully committed to Supabase for table ${table}, ID: ${entity.id}`);
      return true;
    }
  } catch (err: any) {
    console.error(`[SupabaseSync] Exception pushing mutation to Supabase for ${table}:`, err.message);
    return false;
  }
}

/**
 * Writes a batch of entities directly to Supabase PostgreSQL.
 */
export async function syncBatchToSupabase(table: string, entities: any[]): Promise<{ count: number; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { count: 0, error: 'Supabase admin client not available' };
  if (!entities || entities.length === 0) return { count: 0 };

  try {
    let syncedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < entities.length; i += batchSize) {
      const chunk = entities.slice(i, i + batchSize).map(item => {
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(item)) {
          clean[k] = v === undefined ? null : v;
        }
        return clean;
      });

      const { data, error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' }).select();
      if (error) {
        console.error(`[SupabaseSync] Failed to push batch to table ${table}:`, error.message);
        return { count: syncedCount, error: error.message };
      }
      syncedCount += (data?.length || chunk.length);
    }

    console.log(`[SupabaseSync] ✓ Batch of ${syncedCount} records committed to Supabase for table ${table}`);
    return { count: syncedCount };
  } catch (err: any) {
    console.error(`[SupabaseSync] Exception pushing batch to Supabase table ${table}:`, err.message);
    return { count: 0, error: err.message };
  }
}

/**
 * Deletes an entity from Supabase PostgreSQL on CRM deletion.
 */
export async function deleteEntityFromSupabase(table: string, id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error(`[SupabaseSync] Failed to delete record from Supabase table ${table}:`, error.message);
      return false;
    } else {
      console.log(`[SupabaseSync] Record deleted from Supabase table ${table}, ID: ${id}`);
      return true;
    }
  } catch (err: any) {
    console.error(`[SupabaseSync] Exception deleting record from Supabase ${table}:`, err.message);
    return false;
  }
}


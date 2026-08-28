import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient.ts';
import { getDb } from './database.ts';
import { config } from '../config.ts';

// Priority 1 tables: Essential for customer UI and public APIs
const coreTables = [
  'users',
  'projects',
  'project_versions',
  'layouts',
  'buildings',
  'floors',
  'properties',
  'property_geometry'
];

// Priority 2 tables: Operational history, CRM imports, and audit logs
const secondaryTables = [
  'project_media',
  'project_sources',
  'data_conflicts',
  'imports',
  'import_rows',
  'draft_changes',
  'audit_logs',
  'enquiries',
  'official_content_cache'
];

// Startup hydration state tracker
let hydrationPromise: Promise<boolean> | null = null;
let isHydrationComplete = false;

/**
 * Returns true if initial hydration from Supabase has completed.
 */
export function isHydrated(): boolean {
  return isHydrationComplete || !isSupabaseConfigured();
}

/**
 * Awaitable promise that ensures Supabase data has synced before serving requests.
 */
export async function waitForHydration(): Promise<boolean> {
  if (isHydrationComplete || !isSupabaseConfigured()) return true;
  if (hydrationPromise) {
    return hydrationPromise;
  }
  return true;
}

/**
 * Helper to hydrate a list of tables from Supabase into SQLite using batched inserts.
 */
async function hydrateTableBatch(supabase: any, db: any, tables: string[]): Promise<void> {
  const fetchPromises = tables.map(async (table) => {
    try {
      const { data: rows, error: rowErr } = await supabase.from(table).select('*');
      if (rowErr) {
        console.warn(`[SupabaseSync] Warning querying table ${table}:`, rowErr.message);
        return { table, rows: [] };
      }
      return { table, rows: rows || [] };
    } catch (err: any) {
      console.warn(`[SupabaseSync] Exception fetching table ${table}:`, err.message);
      return { table, rows: [] };
    }
  });

  const results = await Promise.all(fetchPromises);

  // Write to SQLite in a single transaction
  db.transaction(() => {
    for (const { table, rows } of results) {
      if (rows && rows.length > 0) {
        const sample = rows[0];
        const cols = Object.keys(sample);
        const placeholders = cols.map(() => '?').join(', ');
        const colNames = cols.map(c => `"${c}"`).join(', ');
        const insertStmt = db.prepare(`INSERT OR REPLACE INTO "${table}" (${colNames}) VALUES (${placeholders})`);

        for (const item of rows) {
          const vals = cols.map(c => item[c] === undefined ? null : item[c]);
          insertStmt.run(...vals);
        }
        console.log(`[SupabaseSync] Synced table [${table}]: ${rows.length} records hydrated from Supabase.`);
      }
    }
  })();
}

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
    isHydrationComplete = true;
    return false;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (config.nodeEnv === 'production') {
      throw new Error('[SupabaseSync FATAL] Supabase admin client initialization failed in production.');
    }
    isHydrationComplete = true;
    return false;
  }

  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    try {
      const syncStartTime = Date.now();
      console.log('[SupabaseSync] Connecting to Supabase PostgreSQL (authoritative source of truth)...');
      
      const db = getDb();
      db.pragma('foreign_keys = OFF');

      try {
        // Step 1: Hydrate core customer-facing tables in parallel for sub-second startup
        console.log('[SupabaseSync] Hydrating Core Catalog (projects, layouts, properties, buildings, floors)...');
        await hydrateTableBatch(supabase, db, coreTables);

        // Step 2: Hydrate secondary operational tables in parallel
        await hydrateTableBatch(supabase, db, secondaryTables);

        // Step 3: Cleanup legacy non-persisted local layout paths in SQLite if authoritative Supabase URLs are loaded
        try {
          const { data: supaLayouts } = await supabase.from('layouts').select('id, project_id, image_url, status, is_active');
          if (supaLayouts && supaLayouts.length > 0) {
            for (const sl of supaLayouts) {
              if (sl.image_url && (sl.image_url.startsWith('http://') || sl.image_url.startsWith('https://'))) {
                db.prepare(`
                  UPDATE layouts 
                  SET image_url = ?, status = ?, is_active = ?, updated_at = datetime('now')
                  WHERE id = ?
                `).run(sl.image_url, sl.status || 'PUBLISHED', sl.is_active ?? 1, sl.id);
              }
            }
          }
        } catch (layoutCleanErr: any) {
          console.warn('[SupabaseSync] Note during layout URL alignment:', layoutCleanErr.message);
        }

      } finally {
        db.pragma('foreign_keys = ON');
      }

      isHydrationComplete = true;
      console.log(`[SupabaseSync] ✓ Permanent Supabase synchronization completed in ${Date.now() - syncStartTime}ms.`);
      return true;

    } catch (err: any) {
      console.error('[SupabaseSync] Synchronization error:', err.message);
      if (config.nodeEnv === 'production') {
        throw err;
      }
      isHydrationComplete = true;
      return false;
    }
  })();

  return hydrationPromise;
}

/**
 * Writes an entity directly to Supabase PostgreSQL on CRM mutation.
 */
export async function syncEntityToSupabase(table: string, entity: any): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') return true;
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
  if (process.env.NODE_ENV === 'test') return { count: entities?.length || 0 };
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
  if (process.env.NODE_ENV === 'test') return true;
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


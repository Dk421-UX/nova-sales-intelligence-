import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient.ts';
import { getDb } from './database.ts';
import { config } from '../config.ts';

export type HydrationState = 'STARTING' | 'HYDRATING' | 'READY' | 'DEGRADED' | 'FAILED';

// Priority 1 tables: Essential for customer UI, layout viewing, and public catalog APIs
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

// Deletion order respecting foreign key constraints
const deletionOrder = [
  'property_geometry',
  'properties',
  'draft_changes',
  'import_rows',
  'imports',
  'floors',
  'buildings',
  'layouts',
  'project_media',
  'project_sources',
  'project_versions',
  'projects'
];

// Hydration State Tracker
let currentHydrationState: HydrationState = 'STARTING';
let hydrationPromise: Promise<boolean> | null = null;
let lastHydrationTime: string | null = null;
let lastHydrationError: string | null = null;
let activeSnapshotCounts: Record<string, number> = {};

/**
 * Returns current hydration state machine status
 */
export function getHydrationState(): HydrationState {
  return currentHydrationState;
}

/**
 * Returns true if database is fully hydrated and READY to serve production traffic
 */
export function isDatabaseReady(): boolean {
  if (!isSupabaseConfigured()) {
    return config.nodeEnv !== 'production';
  }
  return currentHydrationState === 'READY';
}

/**
 * Backward compatibility alias for isDatabaseReady
 */
export function isHydrated(): boolean {
  return isDatabaseReady();
}

/**
 * Returns the last hydration error, if any.
 */
export function getHydrationError(): string | null {
  return lastHydrationError;
}

/**
 * Returns diagnostic metadata about current hydration state
 */
export function getHydrationStats() {
  return {
    state: currentHydrationState,
    isReady: isDatabaseReady(),
    lastHydrationTime,
    error: lastHydrationError,
    tableCounts: { ...activeSnapshotCounts }
  };
}

/**
 * Awaitable promise that ensures Supabase data has synced before serving requests.
 * If hydration fails in production mode, this promise throws rather than returning false success.
 */
export async function waitForHydration(): Promise<boolean> {
  if (currentHydrationState === 'READY') return true;

  if (!isSupabaseConfigured()) {
    if (config.nodeEnv === 'production') {
      const msg = '[SupabaseSync FATAL] Production mode requires Supabase PostgreSQL. Missing configuration.';
      currentHydrationState = 'FAILED';
      lastHydrationError = msg;
      throw new Error(msg);
    }
    currentHydrationState = 'READY';
    return true;
  }

  if (hydrationPromise) {
    return hydrationPromise;
  }

  return initAndSyncFromSupabase();
}

/**
 * Helper to fetch all records from a Supabase table with robust pagination and retries.
 */
async function fetchAllRowsFromSupabase(supabase: any, table: string, isCoreTable: boolean): Promise<any[]> {
  const pageSize = table === 'layouts' ? 10 : (table === 'property_geometry' ? 100 : 250);
  let allRows: any[] = [];
  let page = 0;
  let hasMore = true;

  const maxRetries = isCoreTable ? 4 : 2;

  while (hasMore) {
    let success = false;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(from, to);

        if (error) {
          lastErr = error;
          console.warn(`[SupabaseSync] Query error for table '${table}' [range ${from}-${to}] (attempt ${attempt}/${maxRetries}): ${error.message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
            continue;
          }
        } else {
          const rows = data || [];
          allRows = allRows.concat(rows);
          if (rows.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
          success = true;
          break;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`[SupabaseSync] Query exception for table '${table}' (attempt ${attempt}/${maxRetries}): ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
        }
      }
    }

    if (!success) {
      if (isCoreTable) {
        throw new Error(`Failed to fetch required core table '${table}' from Supabase after ${maxRetries} attempts: ${lastErr?.message || 'Unknown network error'}`);
      } else {
        console.warn(`[SupabaseSync] Secondary table '${table}' could not be fetched. Continuing with empty set.`);
        return allRows;
      }
    }
  }

  return allRows;
}

/**
 * Helper to hydrate a list of tables from Supabase into SQLite using batched inserts and exact mirror cleanup.
 */
async function hydrateTableBatch(supabase: any, db: any, tables: string[], isCore: boolean): Promise<Record<string, number>> {
  const results: { table: string; rows: any[] }[] = [];
  for (const table of tables) {
    const rows = await fetchAllRowsFromSupabase(supabase, table, isCore);
    results.push({ table, rows });
  }
  const counts: Record<string, number> = {};

  // Write to SQLite in a single transaction
  db.transaction(() => {
    for (const { table, rows } of results) {
      counts[table] = rows.length;

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

        // For core catalog tables, clean up any orphaned records not present in authoritative Supabase dataset
        if (isCore && ['projects', 'layouts', 'buildings', 'floors', 'properties'].includes(table)) {
          const validIds = rows.map(r => r.id).filter(Boolean);
          if (validIds.length > 0) {
            const placeholdersIds = validIds.map(() => '?').join(', ');
            try {
              db.prepare(`DELETE FROM "${table}" WHERE id NOT IN (${placeholdersIds})`).run(...validIds);
            } catch (delErr: any) {
              console.warn(`[SupabaseSync] Mirror cleanup notice for ${table}:`, delErr.message);
            }
          }
        }

        console.log(`[SupabaseSync] Synced table [${table}]: ${rows.length} records hydrated from Supabase.`);
      } else {
        // When Supabase table is legitimately empty (e.g. after Delete All), clean SQLite table for exact parity
        try {
          db.prepare(`DELETE FROM "${table}"`).run();
          console.log(`[SupabaseSync] Synced empty table [${table}] (0 records in Supabase).`);
        } catch (e: any) {
          console.warn(`[SupabaseSync] Empty sync notice for ${table}:`, e.message);
        }
      }
    }
  })();

  return counts;
}

/**
 * Initializes and synchronizes the application cache from Supabase PostgreSQL.
 * On server startup (or Render wake-up), this pulls the permanent production dataset
 * from Supabase so the application always serves authoritative cloud data.
 */
export async function initAndSyncFromSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    if (config.nodeEnv === 'production') {
      const msg = '[SupabaseSync FATAL] SUPABASE_URL and service keys are missing in production.';
      lastHydrationError = msg;
      currentHydrationState = 'FAILED';
      throw new Error(msg);
    }
    console.log('[SupabaseSync] Supabase not configured in local environment; using local database.');
    currentHydrationState = 'READY';
    lastHydrationError = null;
    return false;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const msg = '[SupabaseSync FATAL] Supabase admin client initialization failed.';
    lastHydrationError = msg;
    currentHydrationState = 'FAILED';
    if (config.nodeEnv === 'production') {
      throw new Error(msg);
    }
    return false;
  }

  if (hydrationPromise) {
    return hydrationPromise;
  }

  currentHydrationState = 'HYDRATING';

  hydrationPromise = (async () => {
    try {
      const syncStartTime = Date.now();
      console.log('[SupabaseSync] Connecting to Supabase PostgreSQL (authoritative source of truth)...');
      
      const db = getDb();
      db.pragma('foreign_keys = OFF');

      try {
        // Step 1: Hydrate core customer-facing tables with fail-closed guarantee
        console.log('[SupabaseSync] Hydrating Core Catalog (projects, layouts, properties, buildings, floors)...');
        const coreCounts = await hydrateTableBatch(supabase, db, coreTables, true);

        // Step 2: Hydrate secondary operational tables
        console.log('[SupabaseSync] Hydrating Operational Tables...');
        const secondaryCounts = await hydrateTableBatch(supabase, db, secondaryTables, false);

        activeSnapshotCounts = { ...coreCounts, ...secondaryCounts };

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

      currentHydrationState = 'READY';
      lastHydrationError = null;
      lastHydrationTime = new Date().toISOString();
      console.log(`[SupabaseSync] ✓ Permanent Supabase synchronization completed in ${Date.now() - syncStartTime}ms. State: READY.`);
      return true;

    } catch (err: any) {
      currentHydrationState = activeSnapshotCounts.projects ? 'DEGRADED' : 'FAILED';
      lastHydrationError = err.message;
      console.error('[SupabaseSync] Synchronization error:', err.message);
      hydrationPromise = null;
      if (config.nodeEnv === 'production') {
        throw err;
      }
      return false;
    }
  })();

  return hydrationPromise;
}

/**
 * CONTROLLED CRM OPERATION: Transactionally Delete All Data from Supabase and local cache.
 * Must be explicitly authorized by an ADMIN and verified with confirmation string 'DELETE ALL DATA'.
 */
export async function deleteAllProductionData(
  userId: string,
  userRole: string,
  confirmation: string,
  testMode = false
): Promise<{ success: boolean; message: string; deletedTables: Record<string, number> }> {
  if (userRole !== 'ADMIN') {
    throw new Error('Unauthorized: Only administrators with ADMIN role can perform Delete All Data.');
  }

  if (confirmation !== 'DELETE ALL DATA') {
    throw new Error('Invalid confirmation: You must provide exact confirmation text "DELETE ALL DATA".');
  }

  console.warn(`[SupabaseSync DANGER ZONE] Delete All Data requested by user [${userId}] (Role: ${userRole}).`);

  const supabase = getSupabaseAdmin();
  const db = getDb();
  const deletedCounts: Record<string, number> = {};

  // 1. Delete from Supabase PostgreSQL in strict foreign-key order
  if (supabase && isSupabaseConfigured() && process.env.NODE_ENV !== 'test') {
    console.log('[SupabaseSync] Deleting records from Supabase PostgreSQL tables in dependency order...');
    for (const table of deletionOrder) {
      try {
        const { error } = await supabase.from(table).delete().not('id', 'is', null);
        if (error) {
          console.error(`[SupabaseSync] Supabase deletion error on table '${table}':`, error.message);
          throw new Error(`Failed to delete records from Supabase table '${table}': ${error.message}`);
        }
        console.log(`[SupabaseSync] ✓ Cleared Supabase table: ${table}`);
      } catch (err: any) {
        console.error(`[SupabaseSync] Exception deleting from Supabase ${table}:`, err.message);
        throw err;
      }
    }
  }

  // 2. Delete from local SQLite in strict atomic transaction
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const table of deletionOrder) {
        try {
          const countRow = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as any;
          const count = countRow?.c || 0;
          db.prepare(`DELETE FROM "${table}"`).run();
          deletedCounts[table] = count;
        } catch (e: any) {
          console.warn(`[SupabaseSync] Local delete notice for table ${table}:`, e.message);
          deletedCounts[table] = 0;
        }
      }

    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  // Record Audit Log for the Delete All action
  try {
    const auditId = `aud_${Date.now()}_delall`;
    const now = new Date().toISOString();
    const insRes = db.prepare(`
      INSERT INTO audit_logs (id, entity_type, entity_id, project_id, action, old_values, new_values, performed_by, user_role, ip_address, created_at)
      VALUES (?, 'PROJECT', 'ALL', NULL, 'DELETE_ALL_DATA', NULL, ?, ?, ?, NULL, ?)
    `).run(auditId, JSON.stringify(deletedCounts), userId, userRole, now);
    console.log('[SupabaseSync] Inserted DELETE_ALL_DATA audit log:', insRes);
  } catch (audErr: any) {
    console.error('[SupabaseSync] Audit log insert error:', audErr.message);
  }

  // Invalidate in-memory snapshots and mark state as READY with 0 records
  activeSnapshotCounts = {};
  for (const t of deletionOrder) {
    activeSnapshotCounts[t] = 0;
  }
  currentHydrationState = 'READY';
  lastHydrationTime = new Date().toISOString();
  lastHydrationError = null;

  console.log('[SupabaseSync] ✓ Delete All Data completed successfully. Production dataset is now clean.');
  return {
    success: true,
    message: 'All projects, properties, layouts, and inventory data have been permanently removed.',
    deletedTables: deletedCounts
  };
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


import { getDb } from '../db/database.ts';
import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from '../db/supabaseClient.ts';
import { config } from '../config.ts';

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'error';
  timestamp: string;
  database: {
    provider: 'supabase' | 'local-relational';
    connected: boolean;
    error?: string;
    supabaseConfigured: boolean;
    supabaseReachable: boolean;
    supabaseTablesReady: boolean;
  };
  inventory: {
    projectCount: number;
    publishedPropertyCount: number;
    totalPropertiesInDatabase: number;
  };
  ai: {
    provider: string;
    model: string;
    configured: boolean;
    status: 'online' | 'unconfigured' | 'fallback';
  };
  officialWebsite: {
    url: string;
    configured: boolean;
    brandingReady: boolean;
  };
}

export async function getSystemHealth(): Promise<HealthReport> {
  const db = getDb();
  let dbConnected = true;
  let dbError: string | undefined;

  let projectCount = 0;
  let publishedPropertyCount = 0;
  let totalPropertiesInDatabase = 0;

  try {
    const projRow = db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;
    projectCount = projRow?.count || 0;

    const pubRow = db.prepare('SELECT COUNT(*) as count FROM properties WHERE is_published = 1 AND is_archived = 0 AND is_superseded = 0').get() as any;
    publishedPropertyCount = pubRow?.count || 0;

    const allPropRow = db.prepare('SELECT COUNT(*) as count FROM properties').get() as any;
    totalPropertiesInDatabase = allPropRow?.count || 0;
  } catch (err: any) {
    dbConnected = false;
    dbError = err.message;
  }

  // Check Supabase reachability
  let supabaseReachable = false;
  let supabaseTablesReady = false;
  const supaClient = getSupabaseAdmin() || getSupabase();

  if (supaClient) {
    try {
      const { data, error } = await supaClient.from('projects').select('id').limit(1);
      if (!error) {
        supabaseReachable = true;
        supabaseTablesReady = true;
      } else if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        supabaseReachable = true;
        supabaseTablesReady = false; // Supabase project exists but schema DDL not yet executed in Postgres
      }
    } catch (e) {
      supabaseReachable = false;
    }
  }

  const aiConfigured = Boolean(config.aiApiKey);

  return {
    status: dbConnected ? (publishedPropertyCount > 0 ? 'healthy' : 'degraded') : 'error',
    timestamp: new Date().toISOString(),
    database: {
      provider: isSupabaseConfigured() && supabaseTablesReady ? 'supabase' : 'local-relational',
      connected: dbConnected,
      error: dbError,
      supabaseConfigured: isSupabaseConfigured(),
      supabaseReachable,
      supabaseTablesReady
    },
    inventory: {
      projectCount,
      publishedPropertyCount,
      totalPropertiesInDatabase
    },
    ai: {
      provider: 'Groq',
      model: config.aiModel,
      configured: aiConfigured,
      status: aiConfigured ? 'online' : 'fallback'
    },
    officialWebsite: {
      url: config.officialWebsiteUrl,
      configured: Boolean(config.officialWebsiteUrl),
      brandingReady: true
    }
  };
}

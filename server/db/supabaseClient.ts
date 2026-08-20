import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.ts';

let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

// Helper to get effective Supabase URL (supports both legacy and new env key names)
function getEffectiveUrl(): string {
  return config.supabaseUrl 
    || process.env.SUPABASE_URL 
    || '';
}

// Helper to get effective anon key (supports both SUPABASE_ANON_KEY and SUPABASE_PUBLISHABLE_KEY)
function getEffectiveAnonKey(): string {
  return config.supabaseAnonKey 
    || process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY 
    || '';
}

// Helper to get effective service role key (supports both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEY)
function getEffectiveServiceKey(): string {
  return config.supabaseServiceRoleKey 
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY 
    || '';
}

export function getSupabase(): SupabaseClient | null {
  const url = getEffectiveUrl();
  const anonKey = getEffectiveAnonKey();
  if (!url || !anonKey) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(url, anonKey);
  }
  return supabaseClient;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = getEffectiveUrl();
  const serviceKey = getEffectiveServiceKey();
  if (!url || !serviceKey) {
    return null;
  }
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseAdminClient;
}

export function isSupabaseConfigured(): boolean {
  const url = getEffectiveUrl();
  const anonKey = getEffectiveAnonKey();
  const serviceKey = getEffectiveServiceKey();
  return Boolean(url && (anonKey || serviceKey));
}

import { config } from '../config.ts';

export interface EnvValidationResult {
  isValid: boolean;
  databaseProvider: 'supabase' | 'local-relational';
  configuredItems: {
    supabaseUrl: boolean;
    supabaseAnonKey: boolean;
    supabaseServiceRoleKey: boolean;
    groqApiKey: boolean;
    officialWebsiteUrl: boolean;
  };
  warnings: string[];
  errors: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const hasSupabaseUrl = Boolean(config.supabaseUrl && config.supabaseUrl.startsWith('http'));
  const hasSupabaseAnon = Boolean(config.supabaseAnonKey);
  const hasSupabaseService = Boolean(config.supabaseServiceRoleKey);
  const hasGroqKey = Boolean(config.aiApiKey);
  const hasOfficialUrl = Boolean(config.officialWebsiteUrl);

  const isSupabaseFullyConfigured = hasSupabaseUrl && (hasSupabaseAnon || hasSupabaseService);
  const isProduction = config.nodeEnv === 'production';

  if (!hasGroqKey) {
    warnings.push('GROQ_API_KEY is not configured. AI assistant will operate using verified deterministic rule-based tool execution.');
  }

  if (!hasOfficialUrl) {
    warnings.push('NOVA_OFFICIAL_WEBSITE_URL is not set. Defaulting to https://novalifespace.in');
  }

  if (isProduction && !isSupabaseFullyConfigured) {
    errors.push('SUPABASE_URL and service/anon keys are required in production mode. Set SUPABASE_URL, SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in environment.');
  }

  const databaseProvider: 'supabase' | 'local-relational' = isSupabaseFullyConfigured ? 'supabase' : 'local-relational';

  return {
    isValid: errors.length === 0,
    databaseProvider,
    configuredItems: {
      supabaseUrl: hasSupabaseUrl,
      supabaseAnonKey: hasSupabaseAnon,
      supabaseServiceRoleKey: hasSupabaseService,
      groqApiKey: hasGroqKey,
      officialWebsiteUrl: hasOfficialUrl
    },
    warnings,
    errors
  };
}

export function printStartupStatus(validation: EnvValidationResult) {
  console.log(`====================================================`);
  console.log(` NOVA PROPERTY EXPLORER — RUNTIME CONFIGURATION AUDIT`);
  console.log(`====================================================`);
  console.log(` Port:                     ${config.port}`);
  console.log(` Environment:              ${config.nodeEnv}`);
  console.log(` Primary Database Target:  ${validation.databaseProvider.toUpperCase()}`);
  console.log(` Supabase URL:             ${validation.configuredItems.supabaseUrl ? '✓ Configured' : '✗ Missing'}`);
  console.log(` Supabase Anon/Public Key: ${validation.configuredItems.supabaseAnonKey ? '✓ Configured' : '✗ Missing'}`);
  console.log(` Supabase Service Key:     ${validation.configuredItems.supabaseServiceRoleKey ? '✓ Configured' : '✗ Missing'}`);
  console.log(` Groq AI Runtime Engine:   ${validation.configuredItems.groqApiKey ? '✓ Configured (' + config.aiModel + ')' : '⚠ Fallback Deterministic'}`);
  console.log(` Official Nova Website:    ✓ ${config.officialWebsiteUrl}`);
  console.log(` Local Storage Fallback:   ${config.dbPath}`);
  
  if (validation.warnings.length > 0) {
    console.log(`----------------------------------------------------`);
    validation.warnings.forEach(w => console.log(` ⚠ WARNING: ${w}`));
  }
  if (validation.errors.length > 0) {
    console.log(`----------------------------------------------------`);
    validation.errors.forEach(e => console.error(` ✗ CONFIGURATION ERROR: ${e}`));
  }
  console.log(`====================================================`);
}

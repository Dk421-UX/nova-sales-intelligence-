import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
const defaultDbPath = isServerless 
  ? path.join('/tmp', 'nova_explorer.db') 
  : path.join(rootDir, 'nova_explorer.db');
const defaultUploadsDir = isServerless 
  ? path.join('/tmp', 'uploads') 
  : path.join(rootDir, 'uploads');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'nova-property-explorer-super-secure-jwt-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: process.env.DB_PATH || defaultDbPath,
  uploadsDir: defaultUploadsDir,
  nodeEnv: process.env.NODE_ENV || 'development',
  isServerless,
  
  // Supabase PostgreSQL & Cloud Configuration
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',

  // Runtime Customer-Facing AI (Groq Llama 3.3 70B & Grok)
  aiApiKey: process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY || '',
  aiApiUrl: process.env.GROQ_API_URL || (process.env.GROK_API_URL ? process.env.GROK_API_URL : 'https://api.groq.com/openai/v1'),
  aiModel: process.env.GROQ_MODEL || process.env.GROK_MODEL || 'llama-3.3-70b-versatile',

  // Official Nova Website Configuration
  officialWebsiteUrl: process.env.NOVA_OFFICIAL_WEBSITE_URL || 'https://novalifespace.in',

  // Data Freshness Engine Thresholds (in Hours)
  freshness: {
    freshHours: 24,
    agingHours: 72,
  }
};

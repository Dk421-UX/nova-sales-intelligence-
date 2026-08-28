import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.ts';
import { getDb } from './db/database.ts';
import { runMigrations } from './db/migrations.ts';
import { seedDatabase } from './db/seed.ts';
import { validateEnvironment, printStartupStatus } from './utils/envValidator.ts';
import { getSystemHealth } from './services/healthService.ts';
import { isSupabaseConfigured } from './db/supabaseClient.ts';
import { initAndSyncFromSupabase, waitForHydration, isDatabaseReady, getHydrationStats } from './db/supabaseSync.ts';
import { publicRouter } from './routes/publicApi.ts';
import { crmRouter } from './routes/crmApi.ts';
import { aiRouter } from './routes/aiApi.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();

// Validate Environment on Startup
const envValidation = validateEnvironment();
printStartupStatus(envValidation);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads & layouts directory
const persistentUploadsDir = config.uploadsDir;
const persistentLayoutsDir = path.join(persistentUploadsDir, 'layouts');
const publicLayoutsDir = path.join(rootDir, 'public', 'layouts');

try {
  if (!fs.existsSync(persistentUploadsDir)) {
    fs.mkdirSync(persistentUploadsDir, { recursive: true });
  }
  if (!fs.existsSync(persistentLayoutsDir)) {
    fs.mkdirSync(persistentLayoutsDir, { recursive: true });
  }
  if (!fs.existsSync(publicLayoutsDir)) {
    fs.mkdirSync(publicLayoutsDir, { recursive: true });
  }
} catch (e) {}

app.use('/uploads', express.static(persistentUploadsDir));
app.use('/layouts', express.static(persistentLayoutsDir));
app.use('/layouts', express.static(publicLayoutsDir));

// Initialize Database & Startup Safety Check
try {
  if (config.nodeEnv === 'production' || isSupabaseConfigured()) {
    if (config.nodeEnv === 'production' && !isSupabaseConfigured()) {
      const errMsg = '[Startup FATAL] Production mode requires Supabase PostgreSQL. SUPABASE_URL and Service/Anon keys are missing.';
      console.error(errMsg);
      throw new Error(errMsg);
    }
    console.log('[Startup] Production Database: Supabase PostgreSQL is the permanent authoritative source of truth.');
    // Hydrate state from Supabase PostgreSQL asynchronously
    initAndSyncFromSupabase().catch(err => {
      console.error('[Startup] Supabase hydration error:', err.message);
      if (config.nodeEnv === 'production') process.exit(1);
    });
  } else {
    // Local Development Mode
    const db = getDb();
    runMigrations(db);

    // Initialize baseline project catalog ONLY in local development if projects table is completely uninitialized
    const projectCountRow = db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;
    if (!projectCountRow || projectCountRow.count === 0) {
      console.log('[Startup] Local projects catalog is empty. Initializing baseline project catalog in local dev...');
      seedDatabase();
    }
  }
} catch (e: any) {
  console.error('[Startup] Database initialization exception:', e.message);
  if (config.nodeEnv === 'production') {
    throw e;
  }
}

// Dynamic Health check endpoint (Liveness)
app.get(['/api/health', '/health', '/api/liveness', '/liveness'], async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Explicit Database Readiness Probe (Readiness)
app.get(['/api/ready', '/ready', '/api/readiness', '/readiness'], (req, res) => {
  const stats = getHydrationStats();
  if (stats.isReady) {
    return res.json({
      status: 'ready',
      hydration: stats,
      timestamp: new Date().toISOString()
    });
  } else {
    return res.status(503).json({
      status: 'not_ready',
      hydration: stats,
      timestamp: new Date().toISOString()
    });
  }
});

// Startup Readiness Gate: Guarantees full data hydration before serving customer API requests
const readinessMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    await waitForHydration();
    if (!isDatabaseReady()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_NOT_READY',
          message: 'Nova property data is temporarily synchronizing or unavailable. Please retry shortly.'
        }
      });
    }
    next();
  } catch (err: any) {
    console.error('[Readiness Middleware Error]:', err.message);
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_NOT_READY',
        message: 'Nova property data is temporarily synchronizing or unavailable. Please retry shortly.'
      }
    });
  }
};

app.use(['/api/public', '/public', '/api/crm', '/crm', '/api/ai', '/ai'], readinessMiddleware);


// API Routers (mounted with and without /api prefix to support all proxy/Vercel rewrites)
app.use('/api/public', publicRouter);
app.use('/public', publicRouter);

app.use('/api/crm', crmRouter);
app.use('/crm', crmRouter);

app.use('/api/ai', aiRouter);
app.use('/ai', aiRouter);

// Strict 404 for unhandled API routes (prevents accidental HTML fallback for missing API endpoints)
app.use(['/api', '/public', '/crm/api', '/ai'], (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.originalUrl || req.url}' not found` });
});

// Production Client serving (Serve dist static assets & SPA index.html fallback in standalone server mode)
if (!process.env.VERCEL) {
  const distPath = path.join(rootDir, 'dist');
  const indexHtmlPath = path.join(distPath, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(distPath));
    // Universal SPA fallback for GET requests that didn't match static files or API
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/layouts')) {
        return res.sendFile(indexHtmlPath);
      }
      next();
    });
  }
}

// Global Error Handler (guarantees clean JSON output on all errors)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'An unexpected internal error occurred. Please try again later.' 
  });
});

// Start Server (Binds to 0.0.0.0 for cloud/Render compatibility, skipped in Vercel Serverless)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Server] Live on http://0.0.0.0:${config.port}`);
  });
}

export default app;


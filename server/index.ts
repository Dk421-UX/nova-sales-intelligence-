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

// Static uploads directory
try {
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }
} catch (e) {}
app.use('/uploads', express.static(config.uploadsDir));

// Initialize Database & Run Migrations
try {
  const db = getDb();
  runMigrations(db);

  // Auto-seed database if empty (guarantees properties are never 0 on clean start)
  const countRow = db.prepare('SELECT COUNT(*) as count FROM properties').get() as any;
  if (!countRow || countRow.count === 0) {
    console.log('[Startup] Properties table is empty. Seeding verified Nova project inventory...');
    seedDatabase();
  }
} catch (e: any) {
  console.warn('[Startup] Database initialization / seed check exception:', e.message);
}

// Dynamic Health check endpoint
app.get(['/api/health', '/health'], async (req, res) => {
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
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
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


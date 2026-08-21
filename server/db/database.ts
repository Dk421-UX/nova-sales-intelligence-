import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.ts';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');

export function getEffectiveDbPath(): string {
  return process.env.DB_PATH || config.dbPath;
}

// Ensure directories exist safely
function ensureDirectories(dbFilePath: string) {
  try {
    const dbDir = path.dirname(dbFilePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (e) {}

  try {
    if (!fs.existsSync(config.uploadsDir)) {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
    }
  } catch (e) {}
}

let dbInstance: DatabaseType | null = null;
let currentOpenedPath: string | null = null;

export function getDb(): DatabaseType {
  const effectivePath = getEffectiveDbPath();

  if (dbInstance && currentOpenedPath !== effectivePath) {
    try {
      dbInstance.close();
    } catch (e) {}
    dbInstance = null;
    currentOpenedPath = null;
  }

  if (!dbInstance) {
    ensureDirectories(effectivePath);

    // In serverless, if template DB exists in project root, copy it to /tmp if not already present
    if (config.isServerless && !fs.existsSync(effectivePath)) {
      const templateDb = path.join(rootDir, 'nova_explorer.db');
      if (fs.existsSync(templateDb)) {
        try {
          fs.copyFileSync(templateDb, effectivePath);
        } catch (e) {
          console.warn('[DB] Could not copy template DB to destination:', e);
        }
      }
    }

    dbInstance = new Database(effectivePath, {
      verbose: config.nodeEnv === 'development' ? undefined : undefined,
    });
    currentOpenedPath = effectivePath;
    
    try {
      dbInstance.pragma('journal_mode = WAL');
    } catch (e) {
      try {
        dbInstance.pragma('journal_mode = DELETE');
      } catch (err) {}
    }
    
    dbInstance.pragma('foreign_keys = ON');
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function initSchema(db: DatabaseType) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schemaSql);
  }
}

export function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {}
    dbInstance = null;
    currentOpenedPath = null;
  }
}


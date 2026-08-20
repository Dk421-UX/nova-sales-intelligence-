import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.ts';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../..');

// Ensure directories exist safely
function ensureDirectories() {
  try {
    const dbDir = path.dirname(config.dbPath);
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

ensureDirectories();

let dbInstance: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (!dbInstance) {
    ensureDirectories();

    // In serverless, if template DB exists in project root, copy it to /tmp if not already present
    if (config.isServerless && !fs.existsSync(config.dbPath)) {
      const templateDb = path.join(rootDir, 'nova_explorer.db');
      if (fs.existsSync(templateDb)) {
        try {
          fs.copyFileSync(templateDb, config.dbPath);
        } catch (e) {
          console.warn('[DB] Could not copy template DB to /tmp:', e);
        }
      }
    }

    dbInstance = new Database(config.dbPath, {
      verbose: config.nodeEnv === 'development' ? undefined : undefined,
    });
    
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
    dbInstance.close();
    dbInstance = null;
  }
}

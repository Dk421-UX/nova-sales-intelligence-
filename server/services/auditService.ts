import { getDb } from '../db/database.ts';
import { syncEntityToSupabase } from '../db/supabaseSync.ts';

export interface AuditLogEntry {
  entity_type: 'PROPERTY' | 'PROJECT' | 'LAYOUT' | 'IMPORT' | 'PUBLISH' | 'CONFIG';
  entity_id: string;
  project_id?: string | null;
  action: string;
  old_values?: any;
  new_values?: any;
  performed_by: string;
  user_role: string;
  ip_address?: string | null;
}

export function recordAuditLog(entry: AuditLogEntry) {
  try {
    const db = getDb();
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // Verify project_id exists if provided, otherwise safely store null to prevent FK violations
    let targetProjectId = entry.project_id || null;
    if (targetProjectId) {
      const projExists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(targetProjectId);
      if (!projExists) {
        targetProjectId = null;
      }
    }

    const auditPayload = {
      id,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      project_id: targetProjectId,
      action: entry.action,
      old_values: entry.old_values ? JSON.stringify(entry.old_values) : null,
      new_values: entry.new_values ? JSON.stringify(entry.new_values) : null,
      performed_by: entry.performed_by,
      user_role: entry.user_role,
      ip_address: entry.ip_address || null,
      created_at: now
    };

    db.prepare(`
      INSERT INTO audit_logs (
        id, entity_type, entity_id, project_id, action, old_values, new_values, performed_by, user_role, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditPayload.id,
      auditPayload.entity_type,
      auditPayload.entity_id,
      auditPayload.project_id,
      auditPayload.action,
      auditPayload.old_values,
      auditPayload.new_values,
      auditPayload.performed_by,
      auditPayload.user_role,
      auditPayload.ip_address,
      auditPayload.created_at
    );

    // Asynchronously sync audit entry to Supabase PostgreSQL
    syncEntityToSupabase('audit_logs', auditPayload).catch(() => {});

  } catch (err) {
    console.error('[AuditService] Failed to record audit log:', err);
    throw err;
  }
}

export function getAuditLogs(projectId?: string, limit = 50, offset = 0) {
  const db = getDb();
  let query = 'SELECT * FROM audit_logs';
  const params: any[] = [];

  if (projectId) {
    query += ' WHERE project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(r => ({
    ...r,
    old_values: r.old_values ? JSON.parse(r.old_values) : null,
    new_values: r.new_values ? JSON.parse(r.new_values) : null,
  }));
}

import { getDb } from '../db/database.ts';

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

    db.prepare(`
      INSERT INTO audit_logs (
        id, entity_type, entity_id, project_id, action, old_values, new_values, performed_by, user_role, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.entity_type,
      entry.entity_id,
      targetProjectId,
      entry.action,
      entry.old_values ? JSON.stringify(entry.old_values) : null,
      entry.new_values ? JSON.stringify(entry.new_values) : null,
      entry.performed_by,
      entry.user_role,
      entry.ip_address || null,
      now
    );
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

import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';
import { syncEntityToSupabase, syncBatchToSupabase } from '../db/supabaseSync.ts';

export function getPendingDrafts(projectId?: string) {
  const db = getDb();
  let query = `
    SELECT p.*, pr.name as project_name
    FROM properties p
    JOIN projects pr ON p.project_id = pr.id
    WHERE (p.has_pending_changes = 1 OR p.draft_status IS NOT NULL) AND p.is_archived = 0
  `;
  const params: any[] = [];

  if (projectId) {
    query += ' AND p.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY p.updated_at DESC';
  return db.prepare(query).all(...params);
}

export function publishProjectDrafts(projectId: string, userId: string, userRole: string) {
  const db = getDb();
  const now = new Date().toISOString();

  // Find all pending properties
  const pendingProps = db.prepare(`
    SELECT * FROM properties
    WHERE project_id = ? AND (has_pending_changes = 1 OR draft_status IS NOT NULL) AND is_archived = 0
  `).all(projectId) as any[];

  if (pendingProps.length === 0) {
    return { publishedCount: 0, message: 'No pending draft changes found.' };
  }

  const transaction = db.transaction(() => {
    for (const prop of pendingProps) {
      const finalStatus = prop.draft_status || prop.status;
      db.prepare(`
        UPDATE properties
        SET 
          status = ?,
          draft_status = NULL,
          has_pending_changes = 0,
          is_published = 1,
          last_verified_at = ?,
          published_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(finalStatus, now, now, now, prop.id);

      recordAuditLog({
        entity_type: 'PROPERTY',
        entity_id: prop.id,
        project_id: projectId,
        action: 'PUBLISH',
        old_values: { status: prop.status },
        new_values: { status: finalStatus },
        performed_by: userId,
        user_role: userRole
      });
    }

    // Update project last_verified_at
    db.prepare(`
      UPDATE projects SET last_verified_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, projectId);

    recordAuditLog({
      entity_type: 'PUBLISH',
      entity_id: projectId,
      project_id: projectId,
      action: 'PUBLISH_BATCH',
      new_values: { count: pendingProps.length, published_at: now },
      performed_by: userId,
      user_role: userRole
    });
  });

  transaction();

  // Authoritative Supabase persistence
  try {
    const updatedProps = db.prepare(`
      SELECT * FROM properties WHERE project_id = ? AND is_archived = 0
    `).all(projectId) as any[];
    if (updatedProps.length > 0) {
      syncBatchToSupabase('properties', updatedProps).catch(() => {});
    }
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (updatedProject) {
      syncEntityToSupabase('projects', updatedProject).catch(() => {});
    }
  } catch (e) {}

  return { publishedCount: pendingProps.length, message: `Successfully published ${pendingProps.length} inventory updates to live site.` };
}

export function discardDraftChanges(projectId: string, userId: string, userRole: string) {
  const db = getDb();
  const now = new Date().toISOString();

  const count = db.prepare(`
    UPDATE properties
    SET draft_status = NULL, has_pending_changes = 0, updated_at = ?
    WHERE project_id = ? AND (has_pending_changes = 1 OR draft_status IS NOT NULL)
  `).run(now, projectId);

  recordAuditLog({
    entity_type: 'PUBLISH',
    entity_id: projectId,
    project_id: projectId,
    action: 'DISCARD_DRAFTS',
    new_values: { discarded_count: count.changes },
    performed_by: userId,
    user_role: userRole
  });

  try {
    const updatedProps = db.prepare(`
      SELECT * FROM properties WHERE project_id = ? AND is_archived = 0
    `).all(projectId) as any[];
    if (updatedProps.length > 0) {
      syncBatchToSupabase('properties', updatedProps).catch(() => {});
    }
  } catch (e) {}

  return { discardedCount: count.changes };
}


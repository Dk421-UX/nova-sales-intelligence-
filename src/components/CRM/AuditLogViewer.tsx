import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../types/models.ts';
import { api } from '../../services/api.ts';
import { ShieldCheck, History, Search, ArrowRight } from 'lucide-react';

interface AuditLogViewerProps {
  projectId?: string;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ projectId }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [projectId]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs(projectId);
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      l.action.toLowerCase().includes(term) ||
      l.entity_type.toLowerCase().includes(term) ||
      l.performed_by.toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>Operational Audit Trail</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Tamper-evident logs of all inventory modifications, imports, and status updates
          </span>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search action or staff member..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.3rem' }}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Performed By</th>
              <th>Details / Diff</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No audit entries found.
                </td>
              </tr>
            ) : (
              filteredLogs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>

                  <td>
                    <span 
                      className="badge"
                      style={{
                        background: l.action.includes('IMPORT') ? 'rgba(56, 189, 248, 0.15)' : (l.action.includes('PUBLISH') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(212, 175, 55, 0.15)'),
                        color: l.action.includes('IMPORT') ? 'var(--accent-cyan)' : (l.action.includes('PUBLISH') ? 'var(--status-available)' : 'var(--brand-gold)'),
                        fontSize: '0.7rem'
                      }}
                    >
                      {l.action}
                    </span>
                  </td>

                  <td style={{ fontWeight: 600, color: '#fff' }}>
                    {l.entity_type} {l.entity_id ? `(${l.entity_id})` : ''}
                  </td>

                  <td>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {l.performed_by} ({l.user_role})
                    </span>
                  </td>

                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                    {l.old_values && l.new_values ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: '#ef4444' }}>{JSON.stringify(l.old_values)}</span>
                        <ArrowRight size={12} />
                        <span style={{ color: 'var(--status-available)' }}>{JSON.stringify(l.new_values)}</span>
                      </div>
                    ) : (
                      <span>{JSON.stringify(l.new_values || l.old_values || {})}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

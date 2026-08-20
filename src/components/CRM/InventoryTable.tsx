import React, { useState } from 'react';
import { Property, Project } from '../../types/models.ts';
import { Search, Plus, Edit2, Archive, Map, Clock, AlertCircle, Check } from 'lucide-react';

interface InventoryTableProps {
  properties: Property[];
  project: Project;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onStageStatus: (propertyId: string, status: string) => Promise<void>;
  onArchiveProperty: (propertyId: string) => Promise<void>;
  onOpenMapper: (property: Property) => void;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  properties,
  project,
  onAddProperty,
  onEditProperty,
  onStageStatus,
  onArchiveProperty,
  onOpenMapper
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'SUPERSEDED'>('ACTIVE');

  const isApartment = project.project_type === 'APARTMENT';

  const filteredProperties = properties.filter(p => {
    // Tab filter
    if (activeTab === 'ACTIVE' && p.is_superseded === 1) return false;
    if (activeTab === 'SUPERSEDED' && p.is_superseded === 0) return false;

    // Status filter
    if (statusFilter !== 'ALL' && p.effective_status !== statusFilter) return false;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const numMatch = p.property_number.toLowerCase().includes(term);
      const phaseMatch = (p.section_or_phase || '').toLowerCase().includes(term);
      const facingMatch = (p.facing || '').toLowerCase().includes(term);
      return numMatch || phaseMatch || facingMatch;
    }

    return true;
  });

  const supersededCount = properties.filter(p => p.is_superseded === 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Tab Selector if superseded data exists */}
      {supersededCount > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('ACTIVE')}
          >
            Current Active Inventory ({properties.filter(p => p.is_superseded === 0).length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'SUPERSEDED' ? 'btn-outline-gold' : 'btn-secondary'}`}
            onClick={() => setActiveTab('SUPERSEDED')}
          >
            Historical / Superseded Data ({supersededCount})
          </button>
        </div>
      )}

      {/* Action Bar & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder={`Search ${isApartment ? 'flat / unit' : 'plot'} number, facing, phase...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.4rem' }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '160px' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="BOOKED">Booked</option>
            <option value="REGISTERED">Registered</option>
            <option value="SOLD">Sold</option>
            <option value="RESERVED">Reserved</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={onAddProperty}>
          <Plus size={16} /> Add {isApartment ? 'Apartment' : 'Plot'}
        </button>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{isApartment ? 'Flat / Unit' : 'Plot No'}</th>
              <th>Status (1-Click Update)</th>
              <th>Facing</th>
              <th>{isApartment ? 'Saleable Area' : 'Extent'}</th>
              {isApartment && <th>Unit Type</th>}
              {isApartment && <th>UDS</th>}
              <th>Location / Phase</th>
              <th>Geometry</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProperties.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  No properties found matching the selected filters.
                </td>
              </tr>
            ) : (
              filteredProperties.map(prop => {
                const hasPendingDraft = prop.draft_status !== null && prop.draft_status !== prop.status;

                return (
                  <tr key={prop.id} style={{ background: hasPendingDraft ? 'rgba(212, 175, 55, 0.05)' : undefined }}>
                    <td style={{ fontWeight: 700, color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>{prop.property_number}</span>
                        {hasPendingDraft && (
                          <span title="Status staged in draft mode" style={{ color: 'var(--brand-gold)' }}>
                            <Clock size={13} />
                          </span>
                        )}
                        {prop.is_superseded === 1 && (
                          <span className="badge" style={{ background: 'rgba(100, 116, 139, 0.2)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                            Superseded
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {prop.is_superseded === 1 ? (
                        <span className="badge badge-sold">Historical</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <select
                            value={prop.effective_status}
                            onChange={e => onStageStatus(prop.id, e.target.value)}
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.25rem 0.6rem',
                              fontWeight: 600,
                              borderColor: hasPendingDraft ? 'var(--brand-gold)' : undefined,
                              background: hasPendingDraft ? 'var(--brand-gold-subtle)' : undefined
                            }}
                          >
                            <option value="AVAILABLE">AVAILABLE</option>
                            <option value="BOOKED">BOOKED</option>
                            <option value="REGISTERED">REGISTERED</option>
                            <option value="SOLD">SOLD</option>
                            <option value="RESERVED">RESERVED</option>
                            <option value="BLOCKED">BLOCKED</option>
                          </select>

                          {hasPendingDraft && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--brand-gold)', fontWeight: 600 }}>
                              (Draft)
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td>{prop.facing || '—'}</td>

                    <td style={{ fontWeight: 600, color: '#fff' }}>
                      {prop.saleable_area_sqft || prop.area_sqft || '—'} sq.ft
                    </td>

                    {isApartment && <td>{prop.unit_type || '—'}</td>}
                    {isApartment && <td>{prop.uds_sqft ? `${prop.uds_sqft} sq.ft` : '—'}</td>}

                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {prop.section_or_phase || 'Main Section'}
                      </span>
                    </td>

                    <td>
                      {prop.geometry ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-available)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Check size={12} /> Mapped
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Unmapped
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onEditProperty(prop)}
                          title="Edit Attributes"
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onOpenMapper(prop)}
                          title="Map / Calibrate Layout Coordinates"
                        >
                          <Map size={13} />
                        </button>

                        {prop.is_superseded === 0 && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to archive ${prop.property_number}?`)) {
                                onArchiveProperty(prop.id);
                              }
                            }}
                            title="Safe Archive"
                            style={{ color: '#ef4444' }}
                          >
                            <Archive size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React from 'react';
import { Property } from '../../types/models.ts';
import { X, Scale, Check, Trash2, PhoneCall } from 'lucide-react';

interface PropertyComparisonModalProps {
  properties: Property[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onEnquire: (prop: Property) => void;
}

export const PropertyComparisonModal: React.FC<PropertyComparisonModalProps> = ({
  properties,
  onClose,
  onRemove,
  onClear,
  onEnquire
}) => {
  if (properties.length === 0) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Scale size={20} color="var(--brand-gold)" />
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>
              Verified Property Comparison ({properties.length})
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={onClear}>
              <Trash2 size={14} /> Clear All
            </button>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="data-table" style={{ minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ width: '200px' }}>Attribute</th>
                {properties.map(p => (
                  <th key={p.id} style={{ minWidth: '180px', color: '#fff', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{p.property_number}</span>
                      <button 
                        onClick={() => onRemove(p.id)}
                        style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Project</td>
                {properties.map(p => (
                  <td key={p.id} style={{ fontWeight: 600, color: 'var(--brand-gold)' }}>
                    {p.project_name || 'Nova Project'}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Property Type</td>
                {properties.map(p => (
                  <td key={p.id}>
                    <span className={`badge ${p.property_type === 'APARTMENT' ? 'badge-apartment' : 'badge-plot'}`}>
                      {p.property_type}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Status</td>
                {properties.map(p => (
                  <td key={p.id}>
                    <span className={`badge badge-${p.status.toLowerCase()}`}>
                      {p.status}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Facing Orientation</td>
                {properties.map(p => (
                  <td key={p.id} style={{ fontWeight: 600 }}>
                    {p.facing || 'Standard'}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total Area</td>
                {properties.map(p => (
                  <td key={p.id} style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                    {p.saleable_area_sqft || p.area_sqft || 'N/A'} sq.ft
                  </td>
                ))}
              </tr>
              {properties.some(p => p.unit_type) && (
                <tr>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Unit Configuration</td>
                  {properties.map(p => (
                    <td key={p.id}>{p.unit_type || '—'}</td>
                  ))}
                </tr>
              )}
              {properties.some(p => p.uds_sqft) && (
                <tr>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>UDS (Undivided Share)</td>
                  {properties.map(p => (
                    <td key={p.id} style={{ color: 'var(--brand-gold)' }}>
                      {p.uds_sqft ? `${p.uds_sqft} sq.ft` : '—'}
                    </td>
                  ))}
                </tr>
              )}
              {properties.some(p => p.price_display) && (
                <tr>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Estimated Price</td>
                  {properties.map(p => (
                    <td key={p.id} style={{ fontWeight: 700, color: 'var(--brand-gold)' }}>
                      {p.price_display || '—'}
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Enquiry Action</td>
                {properties.map(p => (
                  <td key={p.id}>
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        onClose();
                        onEnquire(p);
                      }}
                      style={{ width: '100%' }}
                    >
                      <PhoneCall size={14} /> Enquire
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

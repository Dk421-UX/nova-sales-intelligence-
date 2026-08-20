import React from 'react';
import { Property } from '../../types/models.ts';
import { X, ShieldCheck, Compass, Maximize, Building, Scale, PhoneCall, Check } from 'lucide-react';

interface PropertyDetailSheetProps {
  property: Property | null;
  onClose: () => void;
  onEnquire: (property: Property) => void;
  onToggleCompare: (propertyId: string) => void;
  isComparing: boolean;
}

export const PropertyDetailSheet: React.FC<PropertyDetailSheetProps> = ({
  property,
  onClose,
  onEnquire,
  onToggleCompare,
  isComparing
}) => {
  if (!property) return null;

  const isApartment = property.property_type === 'APARTMENT';

  return (
    <div className="property-sheet">
      {/* Header */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.7rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isApartment ? 'Apartment Unit' : 'Plotted House Site'}
          </span>
          <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: 0 }}>
            {property.property_number}
          </h3>
        </div>

        <button 
          onClick={onClose}
          style={{ width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
        {/* Status Badge & Freshness Indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-raised)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`badge badge-${property.status.toLowerCase()}`}>
              {property.status}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--status-available)' }}>
            <ShieldCheck size={14} />
            <span>Verified Database Record</span>
          </div>
        </div>

        {/* Core Attributes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {isApartment ? 'Total Saleable Area' : 'Plot Extent'}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
              {property.saleable_area_sqft || property.area_sqft || 'N/A'} sq.ft
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Orientation / Facing</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
              {property.facing || 'Standard'}
            </div>
          </div>
        </div>

        {/* Apartment Specific Breakdown */}
        {isApartment && (
          <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--brand-gold)', marginBottom: '0.65rem' }}>
              Apartment Specifications
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {property.unit_type && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Unit Configuration:</span>
                  <strong style={{ color: '#fff' }}>{property.unit_type}</strong>
                </div>
              )}
              {property.plinth_area_sqft && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Plinth Area:</span>
                  <span style={{ color: '#fff' }}>{property.plinth_area_sqft} sq.ft</span>
                </div>
              )}
              {property.common_area_sqft && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Common Area Share:</span>
                  <span style={{ color: '#fff' }}>{property.common_area_sqft} sq.ft</span>
                </div>
              )}
              {property.carpet_area_sqft && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Carpet Area:</span>
                  <span style={{ color: '#fff' }}>{property.carpet_area_sqft} sq.ft</span>
                </div>
              )}
              {property.uds_sqft && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>UDS (Undivided Share):</span>
                  <strong style={{ color: 'var(--brand-gold)' }}>{property.uds_sqft} sq.ft</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section / Phase */}
        {property.section_or_phase && (
          <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Location / Enclave: </span>
            <strong style={{ color: 'var(--brand-gold)' }}>{property.section_or_phase}</strong>
          </div>
        )}

        {/* Estimated Price */}
        {property.price_display && (
          <div style={{ background: 'rgba(212, 175, 55, 0.08)', border: '1px solid rgba(212, 175, 55, 0.25)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', textTransform: 'uppercase', fontWeight: 600 }}>
              Estimated Price
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.2rem' }}>
              {property.price_display}
            </div>
          </div>
        )}

        {/* Source Traceability & Freshness */}
        <div style={{ marginTop: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          <div>Source: {property.source_document || 'Nova Available List'}</div>
          <div>Last Verified: {new Date(property.last_verified_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => onEnquire(property)}
          style={{ width: '100%' }}
        >
          <PhoneCall size={16} /> Enquire About This Property
        </button>

        <button
          className={`btn ${isComparing ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onToggleCompare(property.id)}
          style={{ width: '100%' }}
        >
          <Scale size={16} /> {isComparing ? 'Remove from Comparison' : 'Add to Comparison'}
        </button>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Property, Building, Floor, LayoutPlan } from '../../types/models.ts';
import { Building2, Layers, CheckCircle2, ArrowRight, ShieldCheck, Maximize2, Compass } from 'lucide-react';

interface ApartmentExplorerProps {
  buildings: Building[];
  properties: Property[];
  layout: LayoutPlan | null;
  selectedProperty: Property | null;
  onSelectProperty: (prop: Property) => void;
  comparisonIds: string[];
  onToggleCompare: (propId: string) => void;
}

export const ApartmentExplorer: React.FC<ApartmentExplorerProps> = ({
  buildings,
  properties,
  layout,
  selectedProperty,
  onSelectProperty,
  comparisonIds,
  onToggleCompare
}) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(buildings[0]?.id || '');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('ALL');

  const currentBuilding = buildings.find(b => b.id === selectedBuildingId) || buildings[0];
  const floors = currentBuilding?.floors || [];

  // Filter properties by building and floor
  const displayedProperties = properties.filter(p => {
    if (selectedBuildingId && p.building_id && p.building_id !== selectedBuildingId) return false;
    if (selectedFloorId !== 'ALL' && p.floor_id && p.floor_id !== selectedFloorId) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Building & Floor Selector Navigation */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Apartment Navigation
            </span>
            <h3 style={{ fontSize: '1.2rem', color: '#fff' }}>Building & Floor Selection</h3>
          </div>

          {buildings.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {buildings.map(b => (
                <button
                  key={b.id}
                  className={`btn btn-sm ${selectedBuildingId === b.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setSelectedBuildingId(b.id);
                    setSelectedFloorId('ALL');
                  }}
                >
                  <Building2 size={14} /> {b.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Floor Selection Tabs */}
        {floors.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
            <button
              className={`btn btn-sm ${selectedFloorId === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedFloorId('ALL')}
            >
              All Floors
            </button>
            {floors.map(f => (
              <button
                key={f.id}
                className={`btn btn-sm ${selectedFloorId === f.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedFloorId(f.id)}
              >
                <Layers size={14} /> {f.floor_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floor Plan Master Layout Preview if SVG available */}
      {layout?.svg_content && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Compass size={18} color="var(--brand-gold)" />
              <h4 style={{ fontSize: '1rem', color: '#fff' }}>Typical Architectural Floor Plan</h4>
            </div>
            <span className="badge badge-apartment">Verified CAD Layout</span>
          </div>

          <div style={{ background: '#0b0f17', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem', display: 'flex', justifyContent: 'center', maxHeight: '450px', overflow: 'auto' }}>
            <svg
              viewBox={layout.viewbox || '0 0 1684 2384'}
              style={{ width: '100%', maxHeight: '420px', display: 'block' }}
              dangerouslySetInnerHTML={{ __html: layout.svg_content.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '') }}
            />
          </div>
        </div>
      )}

      {/* Apartment Units Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.25rem', color: '#fff' }}>
            Verified Apartment Residences ({displayedProperties.length})
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing published current inventory
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {displayedProperties.length === 0 ? (
            <div 
              style={{ 
                gridColumn: '1 / -1', 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border-subtle)', 
                borderRadius: 'var(--radius-md)', 
                padding: '3.5rem 1.5rem', 
                textAlign: 'center' 
              }}
            >
              <div 
                style={{ 
                  width: '3.5rem', 
                  height: '3.5rem', 
                  borderRadius: '50%', 
                  background: 'rgba(212, 175, 55, 0.1)', 
                  border: '1px solid rgba(212, 175, 55, 0.3)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 1.25rem',
                  color: 'var(--brand-gold)'
                }}
              >
                <Building2 size={26} />
              </div>
              <h4 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '0.65rem' }}>
                Current Apartment Inventory is Being Prepared
              </h4>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                Nova's verified apartment availability, unit configurations, and pricing will appear here once published. You can enquire with Nova sales specialists for priority updates.
              </p>
            </div>
          ) : (
            displayedProperties.map(prop => {
              const isSelected = selectedProperty?.id === prop.id;
              const isComparing = comparisonIds.includes(prop.id);
              const isAvailable = prop.status === 'AVAILABLE';

              return (
                <div
                  key={prop.id}
                  style={{
                  background: isSelected ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
                  border: isSelected ? '2px solid var(--brand-gold)' : (isComparing ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)'),
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  transition: 'all var(--transition-fast)',
                  boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600 }}>
                      {prop.unit_type || 'Apartment Unit'}
                    </span>
                    <h4 style={{ fontSize: '1.25rem', color: '#fff', marginTop: '0.15rem' }}>
                      {prop.property_number}
                    </h4>
                    {prop.section_or_phase && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {prop.section_or_phase}
                      </span>
                    )}
                  </div>

                  <span className={`badge badge-${prop.status.toLowerCase()}`}>
                    {prop.status}
                  </span>
                </div>

                {/* Architectural Specs Table */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem', background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Saleable Area</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                      {prop.saleable_area_sqft || prop.area_sqft || 'N/A'} sq.ft
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Facing</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                      {prop.facing || 'East'}
                    </div>
                  </div>
                  {prop.carpet_area_sqft && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Carpet Area</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {prop.carpet_area_sqft} sq.ft
                      </div>
                    </div>
                  )}
                  {prop.uds_sqft && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>UDS Share</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--brand-gold)' }}>
                        {prop.uds_sqft} sq.ft
                      </div>
                    </div>
                  )}
                </div>

                {prop.price_display && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estimated Price:</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-gold)' }}>
                      {prop.price_display}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onSelectProperty(prop)}
                    style={{ flex: 1 }}
                  >
                    View Details
                  </button>

                  <button
                    className={`btn btn-sm ${isComparing ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => onToggleCompare(prop.id)}
                    title="Compare with another unit"
                  >
                    {isComparing ? 'Comparing' : 'Compare'}
                  </button>
                </div>
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Property, Building, Floor, LayoutPlan } from '../../types/models.ts';
import { 
  Building2, Layers, CheckCircle2, ArrowRight, ShieldCheck, 
  Maximize2, Minimize2, Compass, ZoomIn, ZoomOut, RotateCcw, 
  ExternalLink, AlertTriangle, FileText 
} from 'lucide-react';

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
  
  // Layout viewer states
  const [layoutScale, setLayoutScale] = useState(1);
  const [layoutPos, setLayoutPos] = useState({ x: 0, y: 0 });
  const [isDraggingLayout, setIsDraggingLayout] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreenLayout, setIsFullscreenLayout] = useState(false);
  const [imageError, setImageError] = useState(false);

  const layoutContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImageError(false);
  }, [layout?.id, layout?.image_url]);

  const isPdf = Boolean(layout?.image_url && layout.image_url.toLowerCase().endsWith('.pdf'));
  const hasLayoutAsset = Boolean(layout && (layout.image_url || layout.svg_content));

  const handleZoomIn = () => setLayoutScale(s => Math.min(s * 1.3, 5.0));
  const handleZoomOut = () => setLayoutScale(s => Math.max(s / 1.3, 0.4));
  const handleResetZoom = () => {
    setLayoutScale(1);
    setLayoutPos({ x: 0, y: 0 });
  };

  const handleToggleFullscreen = () => {
    if (!layoutContainerRef.current) return;
    if (!document.fullscreenElement) {
      layoutContainerRef.current.requestFullscreen().then(() => setIsFullscreenLayout(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreenLayout(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenLayout(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDraggingLayout(true);
    setDragStart({ x: e.clientX - layoutPos.x, y: e.clientY - layoutPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingLayout) {
      setLayoutPos({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDraggingLayout(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setLayoutScale(s => Math.min(Math.max(s * factor, 0.4), 5.0));
  };

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
      {/* Official Master Architectural Layout Section */}
      <div 
        ref={layoutContainerRef}
        style={{ 
          background: '#0a0e17', 
          border: isFullscreenLayout ? 'none' : '1px solid var(--border-subtle)', 
          borderRadius: isFullscreenLayout ? 0 : 'var(--radius-md)', 
          overflow: 'hidden',
          position: isFullscreenLayout ? 'fixed' : 'relative',
          top: isFullscreenLayout ? 0 : 'auto',
          left: isFullscreenLayout ? 0 : 'auto',
          width: isFullscreenLayout ? '100vw' : '100%',
          height: isFullscreenLayout ? '100vh' : 'auto',
          zIndex: isFullscreenLayout ? 9999 : 'auto',
          boxShadow: isFullscreenLayout ? 'none' : 'var(--shadow-md)'
        }}
      >
        {/* Layout Header Toolbar */}
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '0.85rem 1.25rem',
            background: 'linear-gradient(180deg, #131b28 0%, #0d131f 100%)',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Compass size={18} color="var(--brand-gold)" />
            <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              {layout?.name || 'Official Architectural Floor Plan'}
            </h4>
            <span className="badge badge-apartment" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }}>
              {hasLayoutAsset ? 'Official Apartment Layout' : 'Floor Plan Specification'}
            </span>
          </div>

          {hasLayoutAsset && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <button 
                className="layout-ctrl-btn" 
                onClick={handleZoomIn} 
                title="Zoom In"
                style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ZoomIn size={15} />
              </button>
              <button 
                className="layout-ctrl-btn" 
                onClick={handleZoomOut} 
                title="Zoom Out"
                style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ZoomOut size={15} />
              </button>
              <button 
                className="layout-ctrl-btn" 
                onClick={handleResetZoom} 
                title="Reset View"
                style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <RotateCcw size={14} />
              </button>
              {layout?.image_url && (
                <a
                  href={layout.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="layout-ctrl-btn"
                  title="Open / Download Original File"
                  style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
                >
                  <ExternalLink size={14} />
                </a>
              )}
              <button 
                className="layout-ctrl-btn" 
                onClick={handleToggleFullscreen} 
                title={isFullscreenLayout ? 'Exit Fullscreen' : 'Open Fullscreen'}
                style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)' }}
              >
                {isFullscreenLayout ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          )}
        </div>

        {/* Layout Content Canvas */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ 
            background: 'radial-gradient(circle at 50% 50%, #131a26 0%, #080c14 100%)', 
            height: isFullscreenLayout ? 'calc(100vh - 65px)' : '480px', 
            overflow: 'hidden',
            position: 'relative',
            cursor: isDraggingLayout ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none'
          }}
        >
          {/* Blueprint Grid Lines */}
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              pointerEvents: 'none'
            }}
          />

          {!hasLayoutAsset ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--brand-gold)' }}>
                <Layers size={22} />
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '0.35rem' }}>
                Apartment Layout Will Be Available Once Published
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto' }}>
                The official floor plan drawing is being finalized. You can explore verified unit availability and configurations below.
              </div>
            </div>
          ) : isPdf ? (
            <div style={{ width: '100%', height: '100%' }}>
              <iframe
                src={`${layout!.image_url}#toolbar=1&navpanes=0`}
                title={layout!.name || 'Official Floor Plan'}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          ) : imageError ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)', maxWidth: '480px' }}>
              <AlertTriangle size={32} color="var(--brand-gold)" style={{ margin: '0 auto 0.75rem' }} />
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.35rem' }}>
                Official Layout Asset Updating
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                The apartment layout asset is being synchronized. You can review available unit residences below.
              </div>
            </div>
          ) : layout?.image_url ? (
            <div 
              style={{
                transform: `translate(${layoutPos.x}px, ${layoutPos.y}px) scale(${layoutScale})`,
                transformOrigin: 'center center',
                transition: isDraggingLayout ? 'none' : 'transform 0.12s cubic-bezier(0, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem'
              }}
            >
              <img
                src={layout.image_url}
                alt={layout.name || 'Official Master Floor Plan'}
                onError={() => {
                  console.warn('[Apartment Layout Viewer]: Image asset load failed:', layout.image_url);
                  setImageError(true);
                }}
                draggable={false}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: isFullscreenLayout ? 'calc(100vh - 120px)' : '420px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  filter: 'contrast(1.05) brightness(1.02)'
                }}
              />
            </div>
          ) : layout?.svg_content ? (
            <div 
              style={{
                transform: `translate(${layoutPos.x}px, ${layoutPos.y}px) scale(${layoutScale})`,
                transformOrigin: 'center center',
                transition: isDraggingLayout ? 'none' : 'transform 0.12s cubic-bezier(0, 0, 0.2, 1)',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg
                viewBox={layout.viewbox || '0 0 1684 2384'}
                style={{ width: '90%', maxHeight: isFullscreenLayout ? 'calc(100vh - 120px)' : '420px', display: 'block' }}
                dangerouslySetInnerHTML={{ __html: layout.svg_content.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '') }}
              />
            </div>
          ) : null}

          {/* Quick pan/zoom hint */}
          {hasLayoutAsset && !isPdf && (
            <div 
              style={{
                position: 'absolute',
                bottom: '0.75rem',
                right: '0.75rem',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                pointerEvents: 'none'
              }}
            >
              Scroll to zoom • Drag to pan
            </div>
          )}
        </div>
      </div>

      {/* Building & Floor Selector Navigation */}
      {(buildings.length > 1 || floors.length > 0) && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: floors.length > 0 ? '1rem' : 0 }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Apartment Navigation
              </span>
              <h3 style={{ fontSize: '1.15rem', color: '#fff', margin: '0.2rem 0 0' }}>Tower & Level Filter</h3>
            </div>

            {buildings.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

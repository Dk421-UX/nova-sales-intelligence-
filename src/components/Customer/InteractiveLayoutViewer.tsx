import React, { useState, useRef, useEffect } from 'react';
import { Property, LayoutPlan } from '../../types/models.ts';
import { 
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, 
  Search, Eye, ShieldCheck, FileText, CheckCircle2, 
  MapPin, Layers, Compass, ArrowRight, Sparkles,
  ExternalLink, Download, AlertTriangle, ChevronLeft, ChevronRight,
  LayoutGrid, List
} from 'lucide-react';

interface LayoutViewerProps {
  layout: LayoutPlan | null;
  properties: Property[];
  selectedProperty: Property | null;
  onSelectProperty: (property: Property) => void;
  filteredPropertyIds: Set<string>;
  comparisonIds: string[];
  onToggleCompare: (propertyId: string) => void;
}

export const InteractiveLayoutViewer: React.FC<LayoutViewerProps> = ({
  layout,
  properties,
  selectedProperty,
  onSelectProperty,
  filteredPropertyIds,
  comparisonIds,
  onToggleCompare
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredProperty, setHoveredProperty] = useState<Property | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'LAYOUT' | 'DIRECTORY'>('LAYOUT');
  const [imageError, setImageError] = useState(false);
  const [directoryMode, setDirectoryMode] = useState<'SHELF' | 'GRID'>('SHELF');

  const shelfScrollRef = useRef<HTMLDivElement>(null);
  const plotCardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setImageError(false);
  }, [layout?.id, layout?.image_url]);

  // Auto-scroll selected plot into view in the directory
  useEffect(() => {
    if (selectedProperty && plotCardRefs.current[selectedProperty.id]) {
      plotCardRefs.current[selectedProperty.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedProperty?.id]);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  // Check if layout asset exists and determine format
  const isPdf = Boolean(layout?.image_url && layout.image_url.toLowerCase().endsWith('.pdf'));
  const verifiedProperties = properties.filter(p => p.geometry && p.geometry.svg_path);
  const hasVerifiedGeometry = verifiedProperties.length > 0;
  const hasLayoutAsset = Boolean(layout && (layout.image_url || layout.svg_content));

  // Determine Viewer Mode (Section 3)
  // MODE A: Verified Interactive Spatial Layout
  // MODE B: Official Master Layout Plan (without synthetic green-box overlays)
  // MODE C: Layout Not Available Yet
  const viewerMode: 'MODE_A' | 'MODE_B' | 'MODE_C' = !hasLayoutAsset
    ? 'MODE_C'
    : hasVerifiedGeometry
    ? 'MODE_A'
    : 'MODE_B';

  // Zoom controls
  const handleZoomIn = () => setScale(s => Math.min(s * 1.3, 5.0));
  const handleZoomOut = () => setScale(s => Math.max(s / 1.3, 0.4));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale(s => Math.min(Math.max(s * zoomFactor, 0.4), 5.0));
  };

  // Pan dragging & Touch handling
  const [touchDistance, setTouchDistance] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left + 15,
        y: e.clientY - rect.top + 15
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchDistance(dist);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    } else if (e.touches.length === 2 && touchDistance !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistance;
      setScale(s => Math.min(Math.max(s * (factor > 1 ? 1.03 : 0.97), 0.4), 5.0));
      setTouchDistance(dist);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTouchDistance(null);
  };

  // Status mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return '#10b981';
      case 'BOOKED': return '#f59e0b';
      case 'REGISTERED': return '#ef4444';
      case 'SOLD': return '#64748b';
      case 'RESERVED': return '#8b5cf6';
      default: return '#475569';
    }
  };

  const viewBox = layout?.viewbox || '0 0 1191 842';

  // Filtered properties matching search query
  const searchedProperties = properties.filter(p => {
    if (!filteredPropertyIds.has(p.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.property_number.toLowerCase().includes(q) ||
      (p.facing && p.facing.toLowerCase().includes(q)) ||
      (p.section_or_phase && p.section_or_phase.toLowerCase().includes(q)) ||
      p.status.toLowerCase().includes(q)
    );
  });

  // MODE C: No Layout Available Yet — Rich Inventory Discovery View
  if (viewerMode === 'MODE_C') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Layout Status Banner */}
        <div 
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: 'var(--radius-full)', background: 'var(--brand-gold-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)', flexShrink: 0 }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                Project layout will be available once published.
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Official CAD drawing is being finalized. You can search, filter, compare, and enquire about all verified properties below.
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search plot / facing / area..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                fontSize: '0.85rem',
                width: '240px',
                background: 'var(--bg-surface-raised)',
                borderColor: 'var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: '#fff'
              }}
            />
          </div>
        </div>

        {/* Responsive Grid of Verified Property Cards */}
        {searchedProperties.length === 0 ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No properties match your current search/filter criteria. Try adjusting the filters above.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {searchedProperties.map(p => {
              const isSelected = selectedProperty?.id === p.id;
              const isComparing = comparisonIds.includes(p.id);
              const statusColor = getStatusColor(p.status);

              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProperty(p)}
                  style={{
                    background: isSelected ? 'rgba(212, 175, 55, 0.08)' : 'var(--bg-surface)',
                    border: `1.5px solid ${isSelected ? 'var(--brand-gold)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 12px rgba(212, 175, 55, 0.2)' : 'none'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-medium)';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                        {p.property_number}
                      </div>
                      <span
                        className="badge"
                        style={{
                          background: `${statusColor}20`,
                          color: statusColor,
                          border: `1px solid ${statusColor}40`,
                          fontSize: '0.7rem',
                          fontWeight: 700
                        }}
                      >
                        {p.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {p.area_sqft && (
                        <div>
                          Area: <strong style={{ color: '#fff' }}>{p.area_sqft.toLocaleString('en-IN')} sq.ft</strong>
                        </div>
                      )}
                      {p.facing && (
                        <div>
                          Facing: <strong style={{ color: '#fff' }}>{p.facing}</strong>
                        </div>
                      )}
                      {p.section_or_phase && (
                        <div>
                          Section: <span style={{ color: 'var(--brand-gold)' }}>{p.section_or_phase}</span>
                        </div>
                      )}
                      {p.price_display && (
                        <div style={{ marginTop: '0.25rem', color: 'var(--brand-gold)', fontWeight: 700 }}>
                          {p.price_display}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, fontSize: '0.78rem', padding: '0.35rem' }}
                      onClick={e => {
                        e.stopPropagation();
                        onSelectProperty(p);
                      }}
                    >
                      View Details
                    </button>
                    <button
                      className={`btn btn-sm ${isComparing ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
                      onClick={e => {
                        e.stopPropagation();
                        onToggleCompare(p.id);
                      }}
                      title="Compare Property"
                    >
                      {isComparing ? 'Comparing' : 'Compare'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`layout-viewer-container ${isFullscreen ? 'fullscreen-mode' : ''}`} 
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        width: isFullscreen ? '100vw' : '100%',
        height: isFullscreen ? '100vh' : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        background: '#0a0e17',
        border: isFullscreen ? 'none' : '1px solid var(--border-medium)',
        borderRadius: isFullscreen ? 0 : 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      {/* Top Interactive Toolbar */}
      <div 
        style={{
          padding: '0.75rem 1.25rem',
          background: 'linear-gradient(180deg, #131b28 0%, #0d131f 100%)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          zIndex: 10
        }}
      >
        {/* Title & Mode Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FileText size={16} color="var(--brand-gold)" />
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
              {layout?.name || 'Official Master Layout Scheme'}
            </span>
          </div>

          <span 
            className="badge" 
            style={{ 
              fontSize: '0.68rem', 
              padding: '0.15rem 0.5rem',
              background: viewerMode === 'MODE_A' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(212, 175, 55, 0.15)',
              color: viewerMode === 'MODE_A' ? 'var(--status-available)' : 'var(--brand-gold)',
              border: `1px solid ${viewerMode === 'MODE_A' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(212, 175, 55, 0.3)'}`
            }}
          >
            {viewerMode === 'MODE_A' ? 'Verified Interactive Polygons' : 'Official Architectural Layout'}
          </span>
        </div>

        {/* Search Input & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Quick Plot Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Find Plot / Unit..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '0.35rem 0.65rem 0.35rem 2rem',
                fontSize: '0.8rem',
                width: '150px',
                background: 'rgba(255, 255, 255, 0.06)',
                borderColor: 'var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: '#fff'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Zoom & View Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <button 
              className="layout-ctrl-btn" 
              onClick={handleZoomIn} 
              title="Zoom In (Scroll Up)"
              style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ZoomIn size={15} />
            </button>
            <button 
              className="layout-ctrl-btn" 
              onClick={handleZoomOut} 
              title="Zoom Out (Scroll Down)"
              style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ZoomOut size={15} />
            </button>
            <button 
              className="layout-ctrl-btn" 
              onClick={handleResetZoom} 
              title="Reset View to Default"
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
                title="Open / Download Original File in New Tab"
                style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button 
              className="layout-ctrl-btn" 
              onClick={handleToggleFullscreen} 
              title={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
              style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-gold)' }}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        className="layout-canvas-area"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          position: 'relative',
          height: isFullscreen ? 'calc(100vh - 120px)' : '620px',
          width: '100%',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'radial-gradient(circle at 50% 50%, #131a26 0%, #080c14 100%)',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        {/* Subtle Architectural Blueprint Grid */}
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            pointerEvents: 'none'
          }}
        />

        {/* Transformed Layout Container */}
        <div 
          ref={svgWrapperRef}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0, 0, 0.2, 1)',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          {/* Authentic Layout Presentation */}
          {layout?.image_url ? (
            isPdf ? (
              <div 
                style={{ 
                  width: '100%', 
                  height: isFullscreen ? 'calc(100vh - 160px)' : '560px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  background: '#0a0e17', 
                  borderRadius: '6px', 
                  overflow: 'hidden', 
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
                }}
              >
                <iframe
                  src={`${layout.image_url}#toolbar=1&navpanes=0`}
                  title={layout.name || 'Official Layout Plan'}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            ) : imageError ? (
              <div 
                style={{ 
                  padding: '3rem 2rem', 
                  textAlign: 'center', 
                  background: 'rgba(212, 175, 55, 0.05)', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: 'var(--radius-md)', 
                  color: 'var(--text-secondary)', 
                  maxWidth: '500px' 
                }}
              >
                <AlertTriangle size={36} color="var(--brand-gold)" style={{ margin: '0 auto 0.75rem' }} />
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                  Official Layout Being Updated
                </div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  The architectural drawing for {layout.name} is being refreshed. You can explore and filter all verified inventory in the directory below.
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }}>
                <img
                  src={layout.image_url}
                  alt={layout.name}
                  onError={() => {
                    console.warn('[Layout Viewer]: Image asset load failed for URL:', layout.image_url);
                    setImageError(true);
                  }}
                  draggable={false}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: isFullscreen ? 'calc(100vh - 160px)' : '560px',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    filter: 'contrast(1.05) brightness(1.02)'
                  }}
                />

                {/* Mode A: Overlay Verified Polygons with subtle restrained styling (Section 7) */}
                {viewerMode === 'MODE_A' && (
                  <svg
                    viewBox={viewBox}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'auto'
                    }}
                  >
                    {verifiedProperties.map(p => {
                      const isSelected = selectedProperty?.id === p.id;
                      const isMatchingFilter = filteredPropertyIds.has(p.id);
                      const isComparing = comparisonIds.includes(p.id);
                      const isHovered = hoveredProperty?.id === p.id;

                      const statusColor = getStatusColor(p.status);
                      const strokeColor = isSelected ? '#d4af37' : (isHovered ? '#ffffff' : statusColor);
                      const strokeWidth = isSelected ? 3 : (isHovered ? 2.2 : 1.2);
                      // Restrained translucent fill — never covers layout (Section 7)
                      const fillOpacity = isSelected ? 0.35 : (isHovered ? 0.25 : 0.08);

                      return (
                        <g key={p.id}>
                          <path
                            d={p.geometry!.svg_path!}
                            fill={statusColor}
                            fillOpacity={isMatchingFilter ? fillOpacity : 0.02}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={isSelected ? 'none' : (p.status === 'AVAILABLE' ? 'none' : '3 2')}
                            style={{
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectProperty(p);
                            }}
                            onMouseEnter={() => setHoveredProperty(p)}
                            onMouseLeave={() => setHoveredProperty(null)}
                          />

                          {/* Progressive Label: show number only on hover or when zoomed in */}
                          {(scale > 1.4 || isSelected || isHovered) && (
                            <text
                              x={p.geometry!.center_x}
                              y={p.geometry!.center_y}
                              fill="#ffffff"
                              fontSize="11"
                              fontWeight="700"
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                            >
                              {p.property_number.replace(/plot\s*/i, '')}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            )
          ) : layout?.svg_content ? (
            /* Direct SVG Vector Plan with native CAD strokes */
            <svg
              viewBox={viewBox}
              style={{
                width: '95%',
                height: '95%',
                maxHeight: isFullscreen ? 'calc(100vh - 160px)' : '560px'
              }}
            >
              <g 
                dangerouslySetInnerHTML={{ __html: layout.svg_content.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '') }}
                style={{ opacity: 0.95 }}
              />
            </svg>
          ) : null}
        </div>

        {/* Hover Tooltip for Interactive Polygons */}
        {hoveredProperty && (
          <div 
            className="layout-tooltip"
            style={{
              position: 'absolute',
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              pointerEvents: 'none',
              zIndex: 30,
              background: 'rgba(15, 23, 42, 0.95)',
              border: `1.5px solid ${getStatusColor(hoveredProperty.status)}`,
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem' }}>
                {hoveredProperty.property_number}
              </span>
              <span className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: `${getStatusColor(hoveredProperty.status)}22`, color: getStatusColor(hoveredProperty.status) }}>
                {hoveredProperty.status}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {hoveredProperty.area_sqft && <div>Area: <strong style={{ color: '#fff' }}>{hoveredProperty.area_sqft.toLocaleString('en-IN')} sq.ft</strong></div>}
              {hoveredProperty.facing && <div>Facing: <strong style={{ color: '#fff' }}>{hoveredProperty.facing}</strong></div>}
              {hoveredProperty.section_or_phase && <div>Section: <span style={{ color: 'var(--brand-gold)' }}>{hoveredProperty.section_or_phase}</span></div>}
            </div>
          </div>
        )}

        {/* Floating Quick Legend */}
        <div 
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            background: 'rgba(13, 19, 31, 0.88)',
            border: '1px solid var(--border-subtle)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius-md)',
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            fontSize: '0.75rem',
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-available)', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-available)', display: 'inline-block' }}></span>
            Available
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-booked)', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-booked)', display: 'inline-block' }}></span>
            Booked
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--status-registered)', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-registered)', display: 'inline-block' }}></span>
            Registered / Sold
          </div>
        </div>

        {/* Zoom Hint Overlay */}
        <div 
          style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            background: 'rgba(0, 0, 0, 0.5)',
            padding: '0.3rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            pointerEvents: 'none'
          }}
        >
          Scroll to zoom • Drag to pan
        </div>
      </div>

      {/* Accessible Property Directory & Complete Inventory Browser (Section 9, 28) */}
      <div 
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '1rem 1.25rem'
        }}
      >
        {/* Directory Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Compass size={16} color="var(--brand-gold)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                Verified Property Directory
              </span>
            </div>

            {/* Exact Inventory Status Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
              <span style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', color: '#fff', fontWeight: 600 }}>
                {searchedProperties.length} {searchedProperties.length === 1 ? 'Plot' : 'Plots'}
              </span>
              <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--status-available)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                {searchedProperties.filter(p => p.status === 'AVAILABLE').length} Available
              </span>
              <span style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--status-booked)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                {searchedProperties.filter(p => p.status === 'BOOKED').length} Booked
              </span>
              {searchedProperties.some(p => p.status === 'REGISTERED' || p.status === 'SOLD') && (
                <span style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  {searchedProperties.filter(p => p.status === 'REGISTERED' || p.status === 'SOLD').length} Sold
                </span>
              )}
            </div>
          </div>

          {/* View Mode Toggle & Shelf Scroll Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {directoryMode === 'SHELF' && searchedProperties.length > 5 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => shelfScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                  title="Scroll Left"
                  style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => shelfScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                  title="Scroll Right"
                  style={{ width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            <button
              className={`btn btn-sm ${directoryMode === 'GRID' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDirectoryMode(m => m === 'SHELF' ? 'GRID' : 'SHELF')}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
            >
              {directoryMode === 'SHELF' ? (
                <>
                  <LayoutGrid size={13} /> View All ({searchedProperties.length}) Grid
                </>
              ) : (
                <>
                  <List size={13} /> Compact Shelf
                </>
              )}
            </button>
          </div>
        </div>

        {/* Complete Inventory Rendering — Every plot is accessible and clickable */}
        {searchedProperties.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No properties match the current search or filters.
          </div>
        ) : directoryMode === 'SHELF' ? (
          /* Horizontal Scroll Shelf with ALL Plots */
          <div 
            ref={shelfScrollRef}
            style={{
              display: 'flex',
              gap: '0.5rem',
              overflowX: 'auto',
              paddingBottom: '0.65rem',
              scrollbarWidth: 'thin'
            }}
          >
            {searchedProperties.map(p => {
              const isSelected = selectedProperty?.id === p.id;
              const isComparing = comparisonIds.includes(p.id);
              const statusColor = getStatusColor(p.status);

              return (
                <button
                  key={p.id}
                  ref={el => { plotCardRefs.current[p.id] = el; }}
                  onClick={() => onSelectProperty(p)}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.8rem',
                    background: isSelected ? 'rgba(212, 175, 55, 0.18)' : 'var(--bg-surface-raised)',
                    border: `1.5px solid ${isSelected ? 'var(--brand-gold)' : (isComparing ? 'var(--accent-cyan)' : 'var(--border-subtle)')}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--brand-gold)' : '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 12px rgba(212, 175, 55, 0.3)' : 'none'
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, flexShrink: 0 }}></span>
                  <span>{p.property_number}</span>
                  {p.section_or_phase && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--brand-gold)', background: 'rgba(212, 175, 55, 0.1)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                      {p.section_or_phase}
                    </span>
                  )}
                  {p.area_sqft && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      {p.area_sqft} sqft
                    </span>
                  )}
                  {p.facing && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {p.facing}
                    </span>
                  )}
                  <span 
                    style={{ 
                      fontSize: '0.68rem', 
                      color: statusColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      fontWeight: 700
                    }}
                  >
                    {p.status}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Expandable Grid View with ALL Plots */
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: '0.65rem',
              maxHeight: '380px',
              overflowY: 'auto',
              paddingRight: '0.35rem',
              paddingBottom: '0.5rem',
              scrollbarWidth: 'thin'
            }}
          >
            {searchedProperties.map(p => {
              const isSelected = selectedProperty?.id === p.id;
              const isComparing = comparisonIds.includes(p.id);
              const statusColor = getStatusColor(p.status);

              return (
                <button
                  key={p.id}
                  ref={el => { plotCardRefs.current[p.id] = el; }}
                  onClick={() => onSelectProperty(p)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.35rem',
                    padding: '0.65rem 0.85rem',
                    background: isSelected ? 'rgba(212, 175, 55, 0.18)' : 'var(--bg-surface-raised)',
                    border: `1.5px solid ${isSelected ? 'var(--brand-gold)' : (isComparing ? 'var(--accent-cyan)' : 'var(--border-subtle)')}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--brand-gold)' : '#fff',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 12px rgba(212, 175, 55, 0.3)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isSelected ? 'var(--brand-gold)' : '#fff' }}>
                      {p.property_number}
                    </span>
                    <span 
                      style={{ 
                        fontSize: '0.68rem', 
                        color: statusColor, 
                        fontWeight: 700,
                        background: `${statusColor}1a`,
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px',
                        border: `1px solid ${statusColor}40`
                      }}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {p.area_sqft && <span>{p.area_sqft} sq.ft</span>}
                    {p.facing && <span>• {p.facing}</span>}
                    {p.section_or_phase && (
                      <span style={{ color: 'var(--brand-gold)' }}>• {p.section_or_phase}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Project, Property, LayoutPlan, Building } from '../types/models.ts';
import { api } from '../services/api.ts';
import { InteractiveLayoutViewer } from '../components/Customer/InteractiveLayoutViewer.tsx';
import { ApartmentExplorer } from '../components/Customer/ApartmentExplorer.tsx';
import { PropertyDetailSheet } from '../components/Customer/PropertyDetailSheet.tsx';
import { PropertyComparisonModal } from '../components/Customer/PropertyComparisonModal.tsx';
import { EnquiryModal } from '../components/Customer/EnquiryModal.tsx';
import { AskNovaAI } from '../components/Customer/AskNovaAI.tsx';
import { ArrowLeft, MapPin, Layers, Building as BuildingIcon, CheckCircle2, Filter, Scale, Sparkles, PhoneCall, Clock } from 'lucide-react';

interface CustomerProjectViewProps {
  projectSlug: string;
  onBack: () => void;
}

export const CustomerProjectView: React.FC<CustomerProjectViewProps> = ({ projectSlug, onBack }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [layout, setLayout] = useState<LayoutPlan | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [layoutAnalysis, setLayoutAnalysis] = useState<any>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isComparingOpen, setIsComparingOpen] = useState(false);
  const [enquiryProperty, setEnquiryProperty] = useState<Property | null>(null);
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [facingFilter, setFacingFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [minArea, setMinArea] = useState<number | ''>('');
  const [maxArea, setMaxArea] = useState<number | ''>('');
  const [sectionFilter, setSectionFilter] = useState('ALL');

  useEffect(() => {
    loadProjectData();
  }, [projectSlug]);

  const loadProjectData = async () => {
    setIsLoading(true);
    try {
      const [projData, layoutData, buildingsData, propsData, analysisData] = await Promise.all([
        api.getPublicProject(projectSlug),
        api.getProjectLayout(projectSlug),
        api.getProjectBuildings(projectSlug),
        api.getPublicProperties({ project_slug: projectSlug }),
        api.getProjectLayoutAnalysis(projectSlug).catch(() => null)
      ]);

      setProject(projData);
      setLayout(layoutData);
      setBuildings(buildingsData || []);
      setProperties(propsData.properties || []);
      setLayoutAnalysis(analysisData);
    } catch (err) {
      console.error('Failed to load project details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isApartment = project?.project_type === 'APARTMENT';

  // Compute filtered properties
  const filteredProperties = properties.filter(p => {
    if (facingFilter !== 'ALL' && (!p.facing || !p.facing.toLowerCase().includes(facingFilter.toLowerCase()))) return false;
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'SOLD') {
        if (p.status !== 'SOLD' && p.status !== 'REGISTERED') return false;
      } else if (p.status !== statusFilter) {
        return false;
      }
    }
    if (minArea !== '' && ((p.area_sqft || p.saleable_area_sqft || 0) < minArea)) return false;
    if (maxArea !== '' && ((p.area_sqft || p.saleable_area_sqft || 0) > maxArea)) return false;
    if (sectionFilter !== 'ALL' && p.section_or_phase !== sectionFilter) return false;
    return true;
  });

  const filteredPropertyIds = new Set(filteredProperties.map(p => p.id));

  // Toggle comparison
  const handleToggleCompare = (propertyId: string) => {
    setComparisonIds(prev => {
      if (prev.includes(propertyId)) {
        return prev.filter(id => id !== propertyId);
      }
      if (prev.length >= 4) {
        alert('You can compare up to 4 properties simultaneously.');
        return prev;
      }
      return [...prev, propertyId];
    });
  };

  const comparedProperties = properties.filter(p => comparisonIds.includes(p.id));

  // Extract unique phases/sections
  const uniqueSections = Array.from(new Set(properties.map(p => p.section_or_phase).filter(Boolean))) as string[];

  if (isLoading || !project) {
    return (
      <div className="max-w-7xl" style={{ padding: '6rem 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading verified project layout and properties...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '4rem' }}>
      {/* Project Navigation Header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '1.5rem 0' }}>
        <div className="max-w-7xl">
          <button 
            onClick={onBack}
            className="btn btn-secondary btn-sm"
            style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ArrowLeft size={15} /> Back to Projects Directory
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
                <span className={`badge ${isApartment ? 'badge-apartment' : 'badge-plot'}`}>
                  {isApartment ? <BuildingIcon size={13} /> : <Layers size={13} />}
                  {project.project_type}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--brand-gold)', fontWeight: 600 }}>
                  {project.city}
                </span>
              </div>

              <h1 style={{ fontSize: '2.25rem', color: '#fff', marginBottom: '0.5rem' }}>
                {project.name}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                <MapPin size={16} color="var(--brand-gold)" />
                <span>{project.location}, {project.city}</span>
              </div>
            </div>

            {/* Live Inventory Stats & AI CTA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="inventory-pill-grid" style={{ marginBottom: 0, minWidth: '280px' }}>
                <div className="inventory-pill-item">
                  <div className="inventory-pill-val" style={{ color: 'var(--status-available)' }}>
                    {project.stats.available}
                  </div>
                  <div className="inventory-pill-lbl">Available</div>
                </div>
                <div className="inventory-pill-item">
                  <div className="inventory-pill-val" style={{ color: 'var(--status-booked)' }}>
                    {project.stats.booked}
                  </div>
                  <div className="inventory-pill-lbl">Booked</div>
                </div>
                <div className="inventory-pill-item">
                  <div className="inventory-pill-val" style={{ color: '#fff' }}>
                    {project.stats.total_inventory}
                  </div>
                  <div className="inventory-pill-lbl">Total Units</div>
                </div>
              </div>

              <button className="btn btn-outline-gold" onClick={() => setIsAiOpen(true)}>
                <Sparkles size={16} /> Ask Nova AI
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Exploration Container */}
      <div className="max-w-7xl" style={{ width: '100%' }}>
        {/* Adaptive Deterministic Filter Bar */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
            <Filter size={16} color="var(--brand-gold)" />
            <span>Filter Inventory:</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="BOOKED">Booked</option>
              <option value="REGISTERED">Registered</option>
              <option value="SOLD">Sold</option>
            </select>

            <select 
              value={facingFilter} 
              onChange={e => setFacingFilter(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
            >
              <option value="ALL">All Facing Orientations</option>
              <option value="East">East</option>
              <option value="North">North</option>
              <option value="West">West</option>
              <option value="South">South</option>
            </select>

            {uniqueSections.length > 0 && (
              <select 
                value={sectionFilter} 
                onChange={e => setSectionFilter(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
              >
                <option value="ALL">All Sections / Enclaves</option>
                {uniqueSections.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="number"
                placeholder="Min Sq.Ft"
                value={minArea}
                onChange={e => setMinArea(e.target.value ? parseInt(e.target.value, 10) : '')}
                style={{ width: '100px', fontSize: '0.85rem', padding: '0.45rem 0.65rem' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>-</span>
              <input
                type="number"
                placeholder="Max Sq.Ft"
                value={maxArea}
                onChange={e => setMaxArea(e.target.value ? parseInt(e.target.value, 10) : '')}
                style={{ width: '100px', fontSize: '0.85rem', padding: '0.45rem 0.65rem' }}
              />
            </div>
          </div>

          {/* Comparison Bar Trigger if items selected */}
          {comparisonIds.length > 0 && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => setIsComparingOpen(true)}
            >
              <Scale size={15} /> Compare ({comparisonIds.length}) Properties
            </button>
          )}
        </div>

        {/* Empty Inventory State Notice (Data-Honest) */}
        {properties.length === 0 && (
          <div 
            style={{
              background: 'rgba(212, 175, 55, 0.06)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem 2rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <Clock size={24} color="var(--brand-gold)" />
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  Availability will appear here once inventory is published.
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Nova sales staff is currently preparing verified inventory for this project. Explore the official layout plan below.
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setIsEnquiryOpen(true)}>
              Register Early Interest
            </button>
          </div>
        )}

        {/* Spatial / Layout View depending on Project Type */}
        {!isApartment ? (
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InteractiveLayoutViewer
                layout={layout}
                properties={properties}
                selectedProperty={selectedProperty}
                onSelectProperty={setSelectedProperty}
                filteredPropertyIds={filteredPropertyIds}
                comparisonIds={comparisonIds}
                onToggleCompare={handleToggleCompare}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            </div>

            {selectedProperty && (
              <PropertyDetailSheet
                property={selectedProperty}
                onClose={() => setSelectedProperty(null)}
                onEnquire={p => {
                  setEnquiryProperty(p);
                  setIsEnquiryOpen(true);
                }}
                onToggleCompare={handleToggleCompare}
                isComparing={comparisonIds.includes(selectedProperty.id)}
              />
            )}
          </div>
        ) : (
          <div>
            <ApartmentExplorer
              buildings={buildings}
              properties={filteredProperties}
              layout={layout}
              selectedProperty={selectedProperty}
              onSelectProperty={p => {
                setSelectedProperty(p);
                setEnquiryProperty(p);
              }}
              comparisonIds={comparisonIds}
              onToggleCompare={handleToggleCompare}
            />

            {selectedProperty && (
              <div style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 60, height: '100vh', width: '380px', maxWidth: '100vw' }}>
                <PropertyDetailSheet
                  property={selectedProperty}
                  onClose={() => setSelectedProperty(null)}
                  onEnquire={p => {
                    setEnquiryProperty(p);
                    setIsEnquiryOpen(true);
                  }}
                  onToggleCompare={handleToggleCompare}
                  isComparing={comparisonIds.includes(selectedProperty.id)}
                />
              </div>
            )}
          </div>
        )}

        {/* Project Highlights & Approved Amenities */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
          {project.highlights && project.highlights.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#fff', marginBottom: '1rem' }}>Project Highlights</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {project.highlights.map((h, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={16} color="var(--brand-gold)" style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {project.amenities && project.amenities.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#fff', marginBottom: '1rem' }}>Approved Amenities & Infrastructure</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                {project.amenities.map((a, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--brand-gold)' }} />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {layoutAnalysis && (
            <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', margin: 0 }}>Official Layout Intelligence</h3>
                <span className="badge badge-available" style={{ fontSize: '0.72rem' }}>
                  Confidence: {(layoutAnalysis.confidence?.overall * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.2rem' }}>Road Network</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{layoutAnalysis.roads?.join(' • ') || 'Main Access Road'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.2rem' }}>Parks & Open Spaces</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{layoutAnalysis.parks?.join(' • ') || 'Designated Green Reserve'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.2rem' }}>Planning Status</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{layoutAnalysis.notes?.[0] || 'Sanctioned Layout Plan'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Modal */}
      {isComparingOpen && (
        <PropertyComparisonModal
          properties={comparedProperties}
          onClose={() => setIsComparingOpen(false)}
          onRemove={id => handleToggleCompare(id)}
          onClear={() => setComparisonIds([])}
          onEnquire={p => {
            setEnquiryProperty(p);
            setIsEnquiryOpen(true);
          }}
        />
      )}

      {/* Enquiry Modal */}
      {isEnquiryOpen && (
        <EnquiryModal
          project={project}
          property={enquiryProperty}
          onClose={() => setIsEnquiryOpen(false)}
        />
      )}

      {/* Ask Nova AI Drawer */}
      <AskNovaAI
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        currentProjectSlug={project.slug}
        projectName={project.name}
      />
    </div>
  );
};

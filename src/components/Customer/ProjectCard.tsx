import React from 'react';
import { Project } from '../../types/models.ts';
import { MapPin, ArrowRight, Layers, Building, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
  onSelect: (slug: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onSelect }) => {
  const isApartment = project.project_type === 'APARTMENT';
  const isInventoryPending = (!project.stats || project.stats.total_inventory === 0);

  return (
    <div className="project-card">
      <div className="project-card-header">
        <div className="project-card-badge">
          <span className={`badge ${isApartment ? 'badge-apartment' : 'badge-plot'}`}>
            {isApartment ? <Building size={13} /> : <Layers size={13} />}
            {project.project_type}
          </span>
        </div>

        {/* Ambient Project Icon Graphic */}
        <div style={{ opacity: 0.15, transform: 'scale(1.8)' }}>
          {isApartment ? <Building size={120} /> : <Layers size={120} />}
        </div>

        <div style={{ position: 'absolute', bottom: '0.75rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {project.city}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            v{project.current_version}.0
          </span>
        </div>
      </div>

      <div className="project-card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <h3 className="project-title">{project.name}</h3>
        </div>

        <div className="project-location">
          <MapPin size={15} color="var(--brand-gold)" />
          <span>{project.location}</span>
        </div>

        {project.description && (
          <p className="project-description">{project.description}</p>
        )}

        {/* Inventory Availability Section (Data-Honest) */}
        {isInventoryPending ? (
          <div 
            style={{
              background: 'rgba(212, 175, 55, 0.08)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}
          >
            <Clock size={16} color="var(--brand-gold)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--brand-gold)' }}>
                Inventory Awaiting Verification
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Apartment availability being finalized by Nova
              </div>
            </div>
          </div>
        ) : (
          <div className="inventory-pill-grid">
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
              <div className="inventory-pill-lbl">{isApartment ? 'Apartments' : 'Total Plots'}</div>
            </div>
          </div>
        )}

        {/* Freshness Timestamp */}
        {project.freshness && !isInventoryPending && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.85rem' }}>
            <Clock size={11} color="var(--brand-gold)" />
            <span>{project.freshness.label}</span>
          </div>
        )}

        {/* Highlights */}
        {project.highlights && project.highlights.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.25rem' }}>
            {project.highlights.slice(0, 2).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={13} color="var(--brand-gold)" style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          <button 
            className="btn btn-primary"
            onClick={() => onSelect(project.slug)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              {isInventoryPending ? 'Explore Project' : (isApartment ? 'Explore Apartments' : 'Explore Layout')}
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

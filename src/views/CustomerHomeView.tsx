import React, { useState } from 'react';
import { Project } from '../types/models.ts';
import { ProjectCard } from '../components/Customer/ProjectCard.tsx';
import { Search, Compass, Sparkles, Building, Layers, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw, MapPin, Bot } from 'lucide-react';

interface CustomerHomeViewProps {
  projects: Project[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectProject: (slug: string) => void;
  onOpenAi: () => void;
}

export const CustomerHomeView: React.FC<CustomerHomeViewProps> = ({
  projects,
  isLoading = false,
  error = null,
  onRetry,
  onSelectProject,
  onOpenAi
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PLOT' | 'APARTMENT'>('ALL');
  const [cityFilter, setCityFilter] = useState<'ALL' | 'Chennai' | 'Coimbatore' | 'Thiruvallur'>('ALL');

  const filteredProjects = projects.filter(p => {
    if (typeFilter !== 'ALL' && p.project_type !== typeFilter) return false;
    if (cityFilter !== 'ALL' && p.city.toLowerCase() !== cityFilter.toLowerCase() && p.location.toLowerCase() !== cityFilter.toLowerCase()) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(term) ||
        p.location.toLowerCase().includes(term) ||
        p.city.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalAvailableAcrossProjects = projects.reduce((sum, p) => sum + (p.stats?.available || 0), 0);
  const totalProjectsCount = projects.length;
  const plotProjects = projects.filter(p => p.project_type === 'PLOT').length;
  const aptProjects = projects.filter(p => p.project_type === 'APARTMENT').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '4rem' }}>
      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: '5rem 0 4rem',
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #1a2640 0%, #0a0d12 65%)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Decorative background grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(212,175,55,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, transparent 75%)',
          }}
        />

        <div className="max-w-7xl" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center' }}>
            {/* Trust badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--brand-gold-subtle)',
                border: '1px solid rgba(212, 175, 55, 0.3)',
                padding: '0.4rem 1rem',
                borderRadius: 'var(--radius-full)',
                color: 'var(--brand-gold)',
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: '1.5rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <ShieldCheck size={14} />
              <span>Official Project Catalog</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                lineHeight: 1.12,
                marginBottom: '1.25rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #ffffff 0%, #e0e8f0 60%, #d4af37 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Discover Nova Properties
            </h1>

            <p
              style={{
                fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                marginBottom: '2.25rem',
                maxWidth: '640px',
                margin: '0 auto 2.25rem',
              }}
            >
              Explore Nova projects, discover available properties, view official layouts, and find the right property for you.
            </p>

            {/* Stats row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 'clamp(1rem, 4vw, 2.5rem)',
                flexWrap: 'wrap',
                fontSize: '0.87rem',
                color: 'var(--text-secondary)',
                marginBottom: '2rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <CheckCircle2 size={15} color="var(--brand-gold)" />
                <span><strong style={{ color: '#fff' }}>{totalProjectsCount}</strong> Projects</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <CheckCircle2 size={15} color="var(--status-available)" />
                <span><strong style={{ color: 'var(--status-available)' }}>{totalAvailableAcrossProjects}</strong> Available Properties</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Layers size={15} color="var(--accent-cyan)" />
                <span><strong style={{ color: '#fff' }}>{plotProjects}</strong> Plot Projects</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Building size={15} color="var(--brand-gold)" />
                <span><strong style={{ color: '#fff' }}>{aptProjects}</strong> Apartment Projects</span>
              </div>
            </div>

            {/* AI CTA */}
            <button
              className="btn btn-outline-gold"
              onClick={onOpenAi}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem', fontSize: '0.9rem' }}
            >
              <Sparkles size={17} />
              <span>Ask Nova AI</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================
          FILTER + DIRECTORY
          ================================================================ */}
      <section className="max-w-7xl" style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--brand-gold)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Explore Portfolio
            </span>
            <h2 style={{ fontSize: '1.75rem', color: '#fff' }}>Nova Residential Projects</h2>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Type filter */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-surface)',
                padding: '0.25rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                gap: '0.2rem',
              }}
            >
              {(['ALL', 'PLOT', 'APARTMENT'] as const).map(t => (
                <button
                  key={t}
                  className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTypeFilter(t)}
                  style={{ border: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  {t === 'PLOT' && <Layers size={13} />}
                  {t === 'APARTMENT' && <Building size={13} />}
                  {t === 'ALL' ? 'All Types' : t === 'PLOT' ? 'Plots' : 'Apartments'}
                </button>
              ))}
            </div>

            {/* City filter */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-surface)',
                padding: '0.25rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                gap: '0.2rem',
                flexWrap: 'wrap'
              }}
            >
              {(['ALL', 'Chennai', 'Coimbatore', 'Thiruvallur'] as const).map(c => (
                <button
                  key={c}
                  className={`btn btn-sm ${cityFilter === c ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCityFilter(c)}
                  style={{ border: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  {c !== 'ALL' && <MapPin size={12} />}
                  {c === 'ALL' ? 'All Cities' : c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: '2rem' }}>
          <Search
            size={18}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            id="project-search"
            placeholder="Search by project name or location (e.g. Vandalur, KNG Pudur, Moolakadai)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.9rem 1rem 0.9rem 2.85rem', fontSize: '0.95rem' }}
          />
        </div>

        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0 }} />
              <div>
                <h4 style={{ fontSize: '0.95rem', color: '#ef4444', marginBottom: '0.2rem' }}>
                  Property Availability Could Not Be Loaded
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{error}</p>
              </div>
            </div>
            {onRetry && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={onRetry}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={14} /> Retry Connection
              </button>
            )}
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="projects-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                className="project-card animate-pulse"
                style={{ height: '420px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div style={{ height: '170px', background: 'var(--bg-surface-raised)' }} />
                <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ height: '22px', width: '65%', background: 'var(--bg-surface-raised)', borderRadius: '4px' }} />
                  <div style={{ height: '14px', width: '40%', background: 'var(--bg-surface-raised)', borderRadius: '4px' }} />
                  <div style={{ height: '70px', width: '100%', background: 'var(--bg-surface-raised)', borderRadius: '6px', marginTop: '0.5rem' }} />
                  <div style={{ height: '38px', width: '100%', background: 'var(--bg-surface-raised)', borderRadius: '6px', marginTop: '0.25rem' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Project Cards Grid */}
        {!isLoading && !error && (
          filteredProjects.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '4.5rem 1rem',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Compass size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: '0.5rem' }}>
                No projects match the selected criteria.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Try adjusting your type or city filter.
              </p>
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onSelect={onSelectProject}
                />
              ))}
            </div>
          )
        )}
      </section>

      {/* ================================================================
          AI DISCOVERY FEATURE STRIP
          ================================================================ */}
      {!isLoading && !error && projects.length > 0 && (
        <section className="max-w-7xl" style={{ width: '100%' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(18,23,32,0.5) 100%)',
              border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem 2.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(212, 175, 55, 0.15)',
                  border: '1px solid var(--brand-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-gold)',
                  flexShrink: 0,
                }}
              >
                <Bot size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.25rem' }}>
                  Ask Nova — Property Assistant
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Get instant answers about plot availability, facing preferences, area sizes, and pricing across all Nova projects.
                </p>
              </div>
            </div>
            <button
              className="btn btn-outline-gold"
              onClick={onOpenAi}
              style={{ whiteSpace: 'nowrap', flexShrink: 0, padding: '0.7rem 1.5rem' }}
            >
              <Sparkles size={16} />
              Start AI Discovery
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

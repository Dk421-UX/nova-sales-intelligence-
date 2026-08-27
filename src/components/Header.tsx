import React, { useState } from 'react';
import { Compass, Sparkles, Shield, Building2, MapPin, ExternalLink, Menu, X } from 'lucide-react';
import { NovaLogo } from './NovaLogo.tsx';

interface HeaderProps {
  currentView: 'home' | 'project' | 'crm' | 'login';
  onNavigate: (view: 'home' | 'crm' | 'login', projectSlug?: string) => void;
  onOpenAi: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, onOpenAi }) => {
  const isCrm = currentView === 'crm';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="max-w-7xl header-inner">
        <div className="header-brand-group">
          <div 
            className="brand-logo-wrap" 
            style={{ cursor: 'pointer', minWidth: 0 }}
            onClick={() => {
              onNavigate('home');
              setMobileMenuOpen(false);
            }}
          >
            <NovaLogo height={32} />
          </div>

          {/* Subtle Vertical Separator between NOVA brand and navigation */}
          <div className="header-separator desktop-only" aria-hidden="true" />
        </div>

        {/* Desktop Navigation & Viyaan AI Brand Label */}
        <div className="header-nav-group desktop-only">
          <nav className="nav-links">
            <button 
              className={`nav-link ${currentView === 'home' ? 'active' : ''}`}
              onClick={() => onNavigate('home')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Compass size={17} /> Explore Projects
            </button>

            <a 
              href="https://novalifespace.in" 
              target="_blank" 
              rel="noopener noreferrer"
              className="nav-link"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}
              title="Visit Nova Official Website"
            >
              <span>Official Site</span>
              <ExternalLink size={13} />
            </a>

            <button 
              className="btn btn-outline-gold btn-sm"
              onClick={onOpenAi}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.9rem' }}
            >
              <Sparkles size={16} /> Ask Nova AI
            </button>

            <button 
              className={`btn btn-secondary btn-sm ${isCrm ? 'btn-primary' : ''}`}
              onClick={() => onNavigate(localStorage.getItem('nova_auth_token') ? 'crm' : 'login')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Shield size={16} /> {localStorage.getItem('nova_auth_token') ? 'Nova Staff CRM' : 'Staff Login'}
            </button>
          </nav>

          {/* Viyaan AI Brand Badge */}
          <div className="viyaan-header-badge" title="Viyaan AI Sales Operating System">
            <img 
              src="/viyaan-ai-logo.png" 
              alt="Viyaan AI" 
              className="viyaan-header-logo"
            />
            <span className="viyaan-header-text">Viyaan AI</span>
          </div>
        </div>

        {/* Mobile Header Actions */}
        <div className="mobile-header-actions">
          <button 
            className="btn btn-outline-gold btn-sm"
            onClick={onOpenAi}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            aria-label="Ask Nova AI"
          >
            <Sparkles size={14} />
            <span>AI</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              minWidth: '36px',
              minHeight: '36px'
            }}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div 
          className="mobile-nav-drawer"
          style={{
            background: 'var(--bg-surface-raised)',
            borderTop: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <button 
            className={`nav-link ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => {
              onNavigate('home');
              setMobileMenuOpen(false);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left', padding: '0.6rem 0.5rem', width: '100%' }}
          >
            <Compass size={18} color="var(--brand-gold)" /> Explore Verified Projects
          </button>

          <a 
            href="https://novalifespace.in" 
            target="_blank" 
            rel="noopener noreferrer"
            className="nav-link"
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)' }}
          >
            <ExternalLink size={18} color="var(--brand-gold)" /> Visit novalifespace.in
          </a>

          <button 
            className={`btn btn-secondary btn-sm ${isCrm ? 'btn-primary' : ''}`}
            onClick={() => {
              onNavigate(localStorage.getItem('nova_auth_token') ? 'crm' : 'login');
              setMobileMenuOpen(false);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', padding: '0.65rem' }}
          >
            <Shield size={16} /> {localStorage.getItem('nova_auth_token') ? 'Nova Staff CRM' : 'Staff Login'}
          </button>

          {/* Mobile Drawer Viyaan AI Brand Badge */}
          <div className="mobile-drawer-brand">
            <span className="mobile-drawer-brand-label">Platform</span>
            <div className="viyaan-header-badge">
              <img 
                src="/viyaan-ai-logo.png" 
                alt="Viyaan AI" 
                className="viyaan-header-logo"
              />
              <span className="viyaan-header-text">Viyaan AI</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export const Footer: React.FC = () => {
  return (
    <footer style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', padding: '3rem 0 2rem', marginTop: 'auto' }}>
      <div className="max-w-7xl">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2.5rem', marginBottom: '2.5rem' }}>
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <NovaLogo height={34} />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Discover verified residential plots, multi-storey apartments, and premium master-planned communities across Chennai and Coimbatore.
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <a 
                href="https://novalifespace.in" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: 'var(--brand-gold)', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
              >
                novalifespace.in <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: '#fff' }}>Property Explorer</h4>
            <ul style={{ listStyle: 'none', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: 0 }}>
              <li>• Official Master Layout Plans</li>
              <li>• Published Availability</li>
              <li>• Property Comparison</li>
              <li>• Direct Project Inquiries</li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: '#fff' }}>Ask Nova AI</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ask Nova AI provides interactive discovery to help you explore projects, check current availability, and compare properties across Nova communities.
            </p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div>© {new Date().getFullYear()} Nova Life Space. All rights reserved.</div>
          <div>Nova Property Explorer • Official Project Catalog</div>
        </div>
      </div>
    </footer>
  );
};

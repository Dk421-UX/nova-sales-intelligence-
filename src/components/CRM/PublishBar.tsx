import React, { useState } from 'react';
import { Sparkles, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';

interface PublishBarProps {
  draftCount: number;
  onPublish: () => Promise<void>;
  onDiscard: () => Promise<void>;
}

export const PublishBar: React.FC<PublishBarProps> = ({ draftCount, onPublish, onDiscard }) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  if (draftCount === 0) return null;

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm('Are you sure you want to discard all staged draft changes?')) return;
    setIsDiscarding(true);
    try {
      await onDiscard();
    } finally {
      setIsDiscarding(false);
    }
  };

  return (
    <div 
      style={{
        position: 'sticky',
        top: '4.5rem',
        zIndex: 40,
        background: 'linear-gradient(90deg, #2a200a 0%, #1c1808 100%)',
        borderBottom: '2px solid var(--brand-gold)',
        padding: '0.85rem 1.5rem',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.25)', color: 'var(--brand-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={18} />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
            {draftCount} Staged Inventory Change{draftCount > 1 ? 's' : ''} in Draft Mode
          </div>
          <div style={{ fontSize: '0.78rem', color: '#d4af37' }}>
            Customers see current published state until you click Publish to Live Site.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <button 
          className="btn btn-secondary btn-sm"
          onClick={handleDiscard}
          disabled={isDiscarding || isPublishing}
          style={{ borderColor: 'var(--border-medium)' }}
        >
          <RotateCcw size={14} /> {isDiscarding ? 'Discarding...' : 'Discard Drafts'}
        </button>

        <button 
          className="btn btn-primary btn-sm"
          onClick={handlePublish}
          disabled={isPublishing || isDiscarding}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          <CheckCircle2 size={16} /> {isPublishing ? 'Publishing...' : 'Publish to Live Site'}
        </button>
      </div>
    </div>
  );
};

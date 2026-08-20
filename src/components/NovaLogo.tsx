import React, { useState } from 'react';

interface NovaLogoProps {
  height?: number;
  className?: string;
  showSubtitle?: boolean;
  variant?: 'dark' | 'light' | 'pill';
}

export const NovaLogo: React.FC<NovaLogoProps> = ({
  height = 36,
  className = '',
  showSubtitle = true,
  variant = 'pill'
}) => {
  const [imgError, setImgError] = useState(false);

  // Width is proportional to the official logo's aspect ratio (~2.815:1)
  const calculatedWidth = Math.round(height * 2.815);

  return (
    <div
      className={`nova-brand-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        textDecoration: 'none',
        userSelect: 'none',
        minWidth: 0
      }}
    >
      {/* Official High-Quality Nova Logo Badge */}
      <div className="brand-badge-box">
        {!imgError ? (
          <img
            src="/nova-logo.png"
            alt="Nova Life Space — Villas • Apartments • Plots"
            style={{
              height: `${height}px`,
              width: 'auto',
              maxWidth: `${calculatedWidth}px`,
              display: 'block',
              objectFit: 'contain'
            }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 800,
              fontSize: `${height * 0.45}px`,
              color: '#d62828',
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: '0.05em'
            }}
          >
            <span>NOVA</span>
            <span style={{ fontSize: `${height * 0.25}px`, color: '#6a040f' }}>🌸™</span>
          </div>
        )}
      </div>

      {/* ViyaanAI Platform & Property Explorer Tag */}
      {showSubtitle && (
        <div className="brand-text-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <span className="brand-title-text">
              PROPERTY EXPLORER
            </span>
          </div>
          <span className="brand-sub-text">
            ViyaanAI Sales Operating System
          </span>
        </div>
      )}
    </div>
  );
};

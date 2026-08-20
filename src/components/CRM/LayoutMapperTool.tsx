import React, { useState, useRef } from 'react';
import { Property, LayoutPlan } from '../../types/models.ts';
import { api } from '../../services/api.ts';
import { X, Map, Save, CheckCircle2, RotateCcw, Crosshair } from 'lucide-react';

interface LayoutMapperToolProps {
  property: Property;
  layout: LayoutPlan | null;
  onClose: () => void;
  onSaved: () => void;
}

export const LayoutMapperTool: React.FC<LayoutMapperToolProps> = ({
  property,
  layout,
  onClose,
  onSaved
}) => {
  const initialGeom = property.geometry;
  const [centerX, setCenterX] = useState(initialGeom?.center_x || 200);
  const [centerY, setCenterY] = useState(initialGeom?.center_y || 200);
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(40);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = 1191 / rect.width;
    const yRatio = 842 / rect.height;
    
    const clickX = Math.round((e.clientX - rect.left) * xRatio);
    const clickY = Math.round((e.clientY - rect.top) * yRatio);

    setCenterX(clickX);
    setCenterY(clickY);
  };

  const handleSave = async () => {
    if (!layout) return;
    setIsSaving(true);

    try {
      const halfW = Math.round(width / 2);
      const halfH = Math.round(height / 2);
      const points = [
        [centerX - halfW, centerY - halfH],
        [centerX + halfW, centerY - halfH],
        [centerX + halfW, centerY + halfH],
        [centerX - halfW, centerY + halfH]
      ];

      await api.savePropertyGeometry(property.id, layout.id, {
        geometry_type: 'POLYGON',
        polygon_points: points,
        center_x: centerX,
        center_y: centerY,
        label_x: centerX,
        label_y: centerY
      });

      setSuccessMsg('Geometry coordinates successfully mapped!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Failed to save geometry.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '960px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Crosshair size={20} color="var(--brand-gold)" />
            <div>
              <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>
                Layout Coordinate Mapper: {property.property_number}
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Click anywhere on the CAD layout canvas to position the polygon
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {successMsg && (
            <div style={{ background: 'var(--status-available-bg)', color: 'var(--status-available)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={16} /> {successMsg}
            </div>
          )}

          {/* Interactive Layout Plan SVG Canvas */}
          <div style={{ background: '#0b0f17', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem', overflow: 'auto', maxHeight: '460px', display: 'flex', justifyContent: 'center' }}>
            <svg
              ref={svgRef}
              viewBox={layout?.viewbox || '0 0 1191 842'}
              style={{ width: '100%', maxHeight: '420px', cursor: 'crosshair' }}
              onClick={handleSvgClick}
            >
              {layout?.svg_content && (
                <g 
                  dangerouslySetInnerHTML={{ __html: layout.svg_content.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '') }}
                  style={{ opacity: 0.35 }}
                />
              )}

              {/* Target Polygon Marker */}
              <rect
                x={centerX - width / 2}
                y={centerY - height / 2}
                width={width}
                height={height}
                fill="rgba(212, 175, 55, 0.6)"
                stroke="#d4af37"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
              <circle cx={centerX} cy={centerY} r="3" fill="#fff" />
              <text
                x={centerX}
                y={centerY + 4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
              >
                {property.property_number}
              </text>
            </svg>
          </div>

          {/* Coordinate Adjustment Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Center X</label>
              <input
                type="number"
                value={centerX}
                onChange={e => setCenterX(parseInt(e.target.value, 10) || 0)}
                style={{ width: '100%', padding: '0.4rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Center Y</label>
              <input
                type="number"
                value={centerY}
                onChange={e => setCenterY(parseInt(e.target.value, 10) || 0)}
                style={{ width: '100%', padding: '0.4rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Width</label>
              <input
                type="number"
                value={width}
                onChange={e => setWidth(parseInt(e.target.value, 10) || 10)}
                style={{ width: '100%', padding: '0.4rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Height</label>
              <input
                type="number"
                value={height}
                onChange={e => setHeight(parseInt(e.target.value, 10) || 10)}
                style={{ width: '100%', padding: '0.4rem' }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            <Save size={15} /> {isSaving ? 'Saving Coordinates...' : 'Save Coordinates'}
          </button>
        </div>
      </div>
    </div>
  );
};

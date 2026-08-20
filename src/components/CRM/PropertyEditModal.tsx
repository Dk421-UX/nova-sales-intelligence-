import React, { useState, useEffect } from 'react';
import { Property, Project, Building } from '../../types/models.ts';
import { X, Save, ShieldCheck } from 'lucide-react';

interface PropertyEditModalProps {
  property: Property | null;
  project: Project;
  buildings?: Building[];
  onClose: () => void;
  onSave: (data: any, isDraft: boolean) => Promise<void>;
}

export const PropertyEditModal: React.FC<PropertyEditModalProps> = ({
  property,
  project,
  buildings = [],
  onClose,
  onSave
}) => {
  const isEditing = !!property;
  const isApartment = project.project_type === 'APARTMENT';

  const [propertyNumber, setPropertyNumber] = useState(property?.property_number || '');
  const [status, setStatus] = useState(property?.draft_status || property?.status || 'AVAILABLE');
  const [facing, setFacing] = useState(property?.facing || 'East');
  const [areaSqft, setAreaSqft] = useState(property?.area_sqft || property?.saleable_area_sqft || '');
  const [price, setPrice] = useState(property?.price || '');
  const [sectionOrPhase, setSectionOrPhase] = useState(property?.section_or_phase || '');

  // Apartment fields
  const [unitType, setUnitType] = useState(property?.unit_type || '2 BHK');
  const [plinthArea, setPlinthArea] = useState(property?.plinth_area_sqft || '');
  const [commonArea, setCommonArea] = useState(property?.common_area_sqft || '');
  const [carpetArea, setCarpetArea] = useState(property?.carpet_area_sqft || '');
  const [udsSqft, setUdsSqft] = useState(property?.uds_sqft || '');
  const [buildingId, setBuildingId] = useState(property?.building_id || buildings[0]?.id || '');
  const [floorId, setFloorId] = useState(property?.floor_id || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentBuilding = buildings.find(b => b.id === buildingId) || buildings[0];
  const floors = currentBuilding?.floors || [];

  const handleSubmit = async (isDraft: boolean) => {
    if (!propertyNumber.trim()) {
      setErrorMsg('Property / Unit number is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload: any = {
        project_id: project.id,
        property_type: isApartment ? 'APARTMENT' : 'PLOT',
        property_number: propertyNumber.trim(),
        status,
        facing: facing || null,
        area_sqft: areaSqft ? parseFloat(String(areaSqft)) : null,
        price: price ? parseFloat(String(price)) : null,
        section_or_phase: sectionOrPhase.trim() || null,
      };

      if (isApartment) {
        payload.unit_type = unitType;
        payload.plinth_area_sqft = plinthArea ? parseFloat(String(plinthArea)) : null;
        payload.common_area_sqft = commonArea ? parseFloat(String(commonArea)) : null;
        payload.saleable_area_sqft = areaSqft ? parseFloat(String(areaSqft)) : null;
        payload.carpet_area_sqft = carpetArea ? parseFloat(String(carpetArea)) : null;
        payload.uds_sqft = udsSqft ? parseFloat(String(udsSqft)) : null;
        payload.building_id = buildingId || null;
        payload.floor_id = floorId || null;
      }

      await onSave(payload, isDraft);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase' }}>
              {project.name} • {project.project_type}
            </span>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>
              {isEditing ? `Edit ${property?.property_number}` : `Add New ${isApartment ? 'Apartment Unit' : 'Plot'}`}
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                {isApartment ? 'Flat / Unit Number *' : 'Plot Number *'}
              </label>
              <input
                type="text"
                required
                placeholder={isApartment ? 'e.g. Unit 101 or Flat - 1A' : 'e.g. 105 or PP:1'}
                value={propertyNumber}
                onChange={e => setPropertyNumber(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Operational Status *
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="BOOKED">BOOKED</option>
                <option value="REGISTERED">REGISTERED</option>
                <option value="SOLD">SOLD</option>
                <option value="RESERVED">RESERVED</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Facing / Orientation
              </label>
              <select
                value={facing}
                onChange={e => setFacing(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="East">East</option>
                <option value="North">North</option>
                <option value="West">West</option>
                <option value="South">South</option>
                <option value="North East">North East</option>
                <option value="North West">North West</option>
                <option value="South East">South East</option>
                <option value="South West">South West</option>
                <option value="Corner - East">Corner - East</option>
                <option value="Corner - West">Corner - West</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                {isApartment ? 'Total Saleable Area (sq.ft) *' : 'Plot Extent (sq.ft) *'}
              </label>
              <input
                type="number"
                placeholder="e.g. 1500"
                value={areaSqft}
                onChange={e => setAreaSqft(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Section / Phase for Plots */}
          {!isApartment && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Section / Phase / Enclave Name
              </label>
              <input
                type="text"
                placeholder="e.g. Phase 1, Section B, Edens 4"
                value={sectionOrPhase}
                onChange={e => setSectionOrPhase(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Apartment Specific Fields */}
          {isApartment && (
            <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--brand-gold)' }}>
                Apartment Architecture & Specifications
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Unit Type / BHK
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 BHK, 3 BHK"
                    value={unitType}
                    onChange={e => setUnitType(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Plinth Area (sq.ft)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1050"
                    value={plinthArea}
                    onChange={e => setPlinthArea(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Carpet Area (sq.ft)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 850"
                    value={carpetArea}
                    onChange={e => setCarpetArea(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Common Area Share (sq.ft)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 210"
                    value={commonArea}
                    onChange={e => setCommonArea(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    UDS Undivided Share (sq.ft)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 450"
                    value={udsSqft}
                    onChange={e => setUdsSqft(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {buildings.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Building / Tower
                    </label>
                    <select
                      value={buildingId}
                      onChange={e => setBuildingId(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      Floor
                    </label>
                    <select
                      value={floorId}
                      onChange={e => setFloorId(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Select Floor</option>
                      {floors.map(f => (
                        <option key={f.id} value={f.id}>{f.floor_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Base Price (INR) (Optional)
            </label>
            <input
              type="number"
              placeholder="e.g. 2500000"
              value={price}
              onChange={e => setPrice(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          
          <button 
            className="btn btn-outline-gold"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            title="Save status change in draft mode before publishing"
          >
            Save as Draft
          </button>

          <button 
            className="btn btn-primary"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
          >
            <Save size={15} /> Save & Publish Live
          </button>
        </div>
      </div>
    </div>
  );
};

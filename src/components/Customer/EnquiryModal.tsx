import React, { useState } from 'react';
import { Property, Project } from '../../types/models.ts';
import { api } from '../../services/api.ts';
import { X, PhoneCall, CheckCircle2, ShieldCheck } from 'lucide-react';

interface EnquiryModalProps {
  project: Project | null;
  property: Property | null;
  onClose: () => void;
}

export const EnquiryModal: React.FC<EnquiryModalProps> = ({
  project,
  property,
  onClose
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMsg('Please enter your Name and Phone Number.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await api.submitEnquiry({
        projectId: project.id,
        propertyId: property?.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        message: message.trim() || undefined
      });
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit enquiry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PhoneCall size={18} color="var(--brand-gold)" />
            <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>
              Enquire with Nova Property Specialist
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {isSuccess ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'var(--status-available-bg)', color: 'var(--status-available)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <CheckCircle2 size={32} />
            </div>
            <h4 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '0.5rem' }}>
              Enquiry Submitted Successfully!
            </h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Thank you, {customerName}. A Nova Life Space property specialist has received your verified inquiry for <strong>{project.name}</strong> {property ? `(${property.property_number})` : ''} and will connect with you shortly.
            </p>
            <button className="btn btn-primary" onClick={onClose} style={{ minWidth: '140px' }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Project / Property Summary Header */}
              <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Project: {project.name}
                </div>
                {property && (
                  <div style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 700, marginTop: '0.15rem' }}>
                    {property.property_type === 'APARTMENT' ? property.unit_type || 'Unit' : 'Plot'} {property.property_number} • {property.saleable_area_sqft || property.area_sqft} sq.ft ({property.facing || 'East'})
                  </div>
                )}
              </div>

              {errorMsg && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  {errorMsg}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="your.email@example.com"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Message / Preference
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell us about your requirements, preferred visit date, or specific questions..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Enquiry'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

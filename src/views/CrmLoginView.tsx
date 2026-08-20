import React, { useState } from 'react';
import { api } from '../services/api.ts';
import { NovaLogo } from '../components/NovaLogo.tsx';
import { Shield, Lock, User, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';

interface CrmLoginViewProps {
  onLoginSuccess: () => void;
  onBack: () => void;
}

export const CrmLoginView: React.FC<CrmLoginViewProps> = ({ onLoginSuccess, onBack }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      await api.login(username.trim(), password.trim());
      onLoginSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid username or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '75vh', padding: '2rem 1.5rem' }}>
      <button
        onClick={onBack}
        className="btn btn-secondary btn-sm"
        style={{ alignSelf: 'flex-start', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <ArrowLeft size={15} /> Back to Customer Explorer
      </button>

      <div 
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2.5rem 2rem'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* Official Nova Logo */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
            <NovaLogo height={38} showSubtitle={false} />
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--brand-gold-subtle)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', color: 'var(--brand-gold)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            <Shield size={13} />
            <span>Nova CRM</span>
          </div>

          <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '0.35rem' }}>
            Nova CRM
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Manage projects, inventory, layouts, and customer-facing property data.
          </p>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
              Username or Email
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username or email"
                style={{ width: '100%', paddingLeft: '2.4rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{ width: '100%', paddingLeft: '2.4rem' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', fontWeight: 700 }}
          >
            {isLoading ? 'Authenticating...' : 'Sign In to Nova CRM'}
          </button>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Project } from './types/models.ts';
import { api } from './services/api.ts';
import { Header, Footer } from './components/Header.tsx';
import { CustomerHomeView } from './views/CustomerHomeView.tsx';
import { CustomerProjectView } from './views/CustomerProjectView.tsx';
import { CrmDashboardView } from './views/CrmDashboardView.tsx';
import { CrmLoginView } from './views/CrmLoginView.tsx';
import { AskNovaAI } from './components/Customer/AskNovaAI.tsx';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'home' | 'project' | 'crm' | 'login'>('home');
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getPublicProjects();
      setProjects(data || []);
    } catch (err: any) {
      console.error('Failed to load public projects:', err);
      setErrorMsg(err.message || 'Current property availability could not be loaded. Please check database connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProject = (slug: string) => {
    setSelectedProjectSlug(slug);
    setCurrentView('project');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (view: 'home' | 'crm' | 'login', slug?: string) => {
    if (view === 'crm' && !localStorage.getItem('nova_auth_token')) {
      setCurrentView('login');
      return;
    }
    if (slug) setSelectedProjectSlug(slug);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    localStorage.removeItem('nova_auth_token');
    setCurrentView('home');
  };

  return (
    <div className="app-container">
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenAi={() => setIsAiOpen(true)}
      />

      <main className="main-content">
        {currentView === 'home' && (
          <CustomerHomeView
            projects={projects}
            isLoading={isLoading}
            error={errorMsg}
            onRetry={loadProjects}
            onSelectProject={handleSelectProject}
            onOpenAi={() => setIsAiOpen(true)}
          />
        )}

        {currentView === 'project' && selectedProjectSlug && (
          <CustomerProjectView
            projectSlug={selectedProjectSlug}
            onBack={() => setCurrentView('home')}
          />
        )}

        {currentView === 'login' && (
          <CrmLoginView
            onLoginSuccess={() => setCurrentView('crm')}
            onBack={() => setCurrentView('home')}
          />
        )}

        {currentView === 'crm' && (
          <CrmDashboardView onLogout={handleLogout} />
        )}
      </main>

      <Footer />

      {/* Global Ask Nova AI Floating Trigger and Modal */}
      <AskNovaAI
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        currentProjectSlug={selectedProjectSlug || undefined}
      />
    </div>
  );
};

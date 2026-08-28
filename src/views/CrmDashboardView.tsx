import React, { useState, useEffect } from 'react';
import { Project, Property, Building, LayoutPlan } from '../types/models.ts';
import { api } from '../services/api.ts';
import { InventoryTable } from '../components/CRM/InventoryTable.tsx';
import { PropertyEditModal } from '../components/CRM/PropertyEditModal.tsx';
import { ExcelImportWizard } from '../components/CRM/ExcelImportWizard.tsx';
import { LayoutMapperTool } from '../components/CRM/LayoutMapperTool.tsx';
import { PublishBar } from '../components/CRM/PublishBar.tsx';
import { AuditLogViewer } from '../components/CRM/AuditLogViewer.tsx';
import { NovaLogo } from '../components/NovaLogo.tsx';
import { Layers, Building as BuildingIcon, FileSpreadsheet, RefreshCw, LogOut, CheckCircle2, AlertTriangle, ShieldCheck, Settings, PlusCircle, Trash2 } from 'lucide-react';

interface CrmDashboardViewProps {
  onLogout: () => void;
}

export const CrmDashboardView: React.FC<CrmDashboardViewProps> = ({ onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [layout, setLayout] = useState<LayoutPlan | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [draftCount, setDraftCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'INVENTORY' | 'HEALTH' | 'AUDIT'>('INVENTORY');
  const [projectHealth, setProjectHealth] = useState<any>(null);
  const [layoutAnalysis, setLayoutAnalysis] = useState<any>(null);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isMapperOpen, setIsMapperOpen] = useState(false);
  const [mappingProperty, setMappingProperty] = useState<Property | null>(null);
  const [isReconfigOpen, setIsReconfigOpen] = useState(false);
  const [reconfigType, setReconfigType] = useState<'PLOT' | 'APARTMENT'>('APARTMENT');
  const [reconfigReason, setReconfigReason] = useState('');
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [layoutUploadFile, setLayoutUploadFile] = useState<File | null>(null);
  const [layoutUploadName, setLayoutUploadName] = useState('');
  const [layoutUploadType, setLayoutUploadType] = useState<'MASTER_PLAN' | 'SUBDIVISION_PLAN' | 'FLOOR_PLAN' | 'SCHEME_PLAN'>('MASTER_PLAN');
  const [isUploadingLayout, setIsUploadingLayout] = useState(false);
  const [allLayouts, setAllLayouts] = useState<any[]>([]);
  const [layoutPreviewUrl, setLayoutPreviewUrl] = useState<string | null>(null);
  const [isDraftUpload, setIsDraftUpload] = useState(false);

  // Project Creation Modal State
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<'PLOT' | 'APARTMENT' | 'COMMERCIAL'>('PLOT');
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [newProjectCity, setNewProjectCity] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectStatus, setNewProjectStatus] = useState('ACTIVE');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Project Deletion Modal State
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Project-Scoped Inventory Clear Modal State (Phase 10 & 11)
  const [isClearInventoryOpen, setIsClearInventoryOpen] = useState(false);
  const [clearInventoryInput, setClearInventoryInput] = useState('');
  const [isClearingInventory, setIsClearingInventory] = useState(false);

  // Danger Zone: Delete All Data Modal State
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllInput, setDeleteAllInput] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectInventory(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    setLoadError(null);
    try {
      const projList = await api.getCrmProjects();
      setProjects(projList || []);
      if (projList && projList.length > 0) {
        setSelectedProjectId(prev => prev || projList[0].id);
      } else {
        setLoadError('No projects found in CRM database.');
      }
    } catch (err: any) {
      console.error('Failed to load CRM projects:', err);
      const msg = err.message || 'Failed to load projects';
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('token')) {
        localStorage.removeItem('nova_auth_token');
        onLogout();
        return;
      }
      setLoadError(msg);
    }
  };

  const loadProjectInventory = async (projId: string) => {
    setIsLoading(true);
    try {
      const selectedProj = projects.find(p => p.id === projId);
      const [propsData, draftsData, buildingsData, layoutData, layoutsList, healthData, analysisData] = await Promise.all([
        api.getCrmProperties({ projectId: projId, includeSuperseded: true }).catch(err => {
          console.warn('[CRM] Failed to fetch properties:', err);
          return { properties: [], total: 0 };
        }),
        api.getPendingDrafts(projId).catch(err => {
          console.warn('[CRM] Failed to fetch drafts:', err);
          return { count: 0, drafts: [] };
        }),
        selectedProj ? api.getProjectBuildings(selectedProj.slug).catch(() => []) : Promise.resolve([]),
        selectedProj ? api.getProjectLayout(selectedProj.slug).catch(() => null) : Promise.resolve(null),
        api.getProjectLayouts(projId).catch(() => []),
        api.getProjectHealth(projId).catch(() => null),
        selectedProj ? api.getProjectLayoutAnalysis(selectedProj.slug).catch(() => null) : Promise.resolve(null)
      ]);

      setProperties(propsData.properties || []);
      setDraftCount(draftsData?.count ?? draftsData?.totalDrafts ?? draftsData?.drafts?.length ?? 0);
      setBuildings(buildingsData || []);
      setLayout(layoutData);
      setAllLayouts(layoutsList || []);
      setProjectHealth(healthData);
      setLayoutAnalysis(analysisData);
    } catch (err: any) {
      console.error('Failed to load inventory for project:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const currentProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  const handleStageStatus = async (propertyId: string, status: string) => {
    try {
      await api.stageStatusUpdate(propertyId, status);
      await loadProjectInventory(selectedProjectId);
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  const handleSaveProperty = async (data: any, isDraft: boolean) => {
    if (editingProperty) {
      await api.updateProperty(editingProperty.id, data, isDraft);
    } else {
      await api.createProperty(data);
    }
    await loadProjectInventory(selectedProjectId);
  };

  const handleArchiveProperty = async (propertyId: string) => {
    try {
      await api.archiveProperty(propertyId, 'Archived by CRM staff');
      await loadProjectInventory(selectedProjectId);
    } catch (err: any) {
      alert(err.message || 'Failed to archive property.');
    }
  };

  const handlePublishAllDrafts = async () => {
    try {
      await api.publishDrafts(selectedProjectId);
      await loadProjectInventory(selectedProjectId);
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to publish drafts.');
    }
  };

  const handleDiscardAllDrafts = async () => {
    try {
      await api.discardDrafts(selectedProjectId);
      await loadProjectInventory(selectedProjectId);
    } catch (err: any) {
      alert(err.message || 'Failed to discard drafts.');
    }
  };

  const handleReconfigureProject = async () => {
    if (!reconfigReason.trim()) {
      alert('Please provide a business justification reason for reconfiguring the project model.');
      return;
    }
    try {
      await api.reconfigureProjectType(currentProject.id, reconfigType, reconfigReason.trim());
      setIsReconfigOpen(false);
      await loadProjects();
      await loadProjectInventory(selectedProjectId);
    } catch (err: any) {
      alert(err.message || 'Failed to reconfigure project.');
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      alert('Project name is required.');
      return;
    }
    if (!newProjectLocation.trim()) {
      alert('Project location is required.');
      return;
    }
    setIsCreatingProject(true);
    try {
      const created = await api.createProject({
        name: newProjectName.trim(),
        project_type: newProjectType,
        location: newProjectLocation.trim(),
        city: newProjectCity.trim() || newProjectLocation.trim(),
        description: newProjectDescription.trim() || undefined,
        status: newProjectStatus
      });
      setIsCreateProjectOpen(false);
      setNewProjectName('');
      setNewProjectLocation('');
      setNewProjectCity('');
      setNewProjectDescription('');
      await loadProjects();
      setSelectedProjectId(created.id);
      alert(`Project '${created.name}' created successfully.`);
    } catch (err: any) {
      alert(err.message || 'Failed to create project.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    setIsDeletingProject(true);
    try {
      await api.deleteProject(currentProject.id);
      setIsDeleteProjectOpen(false);
      const updatedList = await api.getCrmProjects();
      setProjects(updatedList);
      if (updatedList.length > 0) {
        setSelectedProjectId(updatedList[0].id);
      } else {
        setSelectedProjectId('');
      }
      alert(`Project '${currentProject.name}' and its associated data were deleted successfully.`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete project.');
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleClearProjectInventory = async () => {
    if (!currentProject) return;
    const expectedConfirm = `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY`;
    if (clearInventoryInput.trim().toUpperCase() !== expectedConfirm) {
      alert(`You must enter the exact confirmation phrase: ${expectedConfirm}`);
      return;
    }

    setIsClearingInventory(true);
    try {
      const res = await api.clearProjectInventory(currentProject.id, expectedConfirm);
      setIsClearInventoryOpen(false);
      setClearInventoryInput('');
      alert(res.message || `Inventory cleared for ${currentProject.name}.`);
      await loadProjects();
      await loadProjectInventory(currentProject.id);
    } catch (err: any) {
      alert(err.message || 'Failed to clear project inventory.');
    } finally {
      setIsClearingInventory(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (deleteAllInput !== 'DELETE ALL DATA') {
      alert('You must enter the exact confirmation phrase: DELETE ALL DATA');
      return;
    }

    setIsDeletingAll(true);
    try {
      const res = await api.deleteAllCrmData('DELETE ALL DATA');
      setIsDeleteAllOpen(false);
      setDeleteAllInput('');
      setProjects([]);
      setSelectedProjectId('');
      setProperties([]);
      setBuildings([]);
      setLayout(null);
      setAllLayouts([]);
      alert(res.message || 'All catalog and inventory data has been permanently deleted from production.');
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to delete all data.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (!currentProject) {
    if (loadError) {
      return (
        <div className="max-w-7xl" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2rem 1.5rem', borderRadius: 'var(--radius-lg)', maxWidth: '480px', margin: '0 auto', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <AlertTriangle size={36} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#fff', fontWeight: 600 }}>CRM Connection Notice</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>{loadError}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => loadProjects()} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <RefreshCw size={14} /> Retry Loading
              </button>
              <button onClick={onLogout} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <LogOut size={14} /> Re-login
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-7xl" style={{ padding: '4rem 0', textAlign: 'center' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: 'var(--brand-gold)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading CRM Inventory System...</p>
      </div>
    );
  }

  const handleUploadLayout = async () => {
    if (!layoutUploadFile) {
      alert('Please select a layout file (.pdf, .jpg, .jpeg, .png, or .svg)');
      return;
    }
    setIsUploadingLayout(true);
    try {
      await api.uploadProjectLayout(
        currentProject.id,
        layoutUploadFile,
        layoutUploadName.trim() || `${currentProject.name} Official Layout`,
        layoutUploadType,
        isDraftUpload
      );
      setIsLayoutModalOpen(false);
      setLayoutUploadFile(null);
      setLayoutPreviewUrl(null);
      await loadProjectInventory(selectedProjectId);
      alert(isDraftUpload 
        ? 'Layout saved as DRAFT successfully. It is saved in CRM drafts and not yet visible to customers.' 
        : 'Official project layout uploaded and published successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to upload layout.');
    } finally {
      setIsUploadingLayout(false);
    }
  };

  const handlePublishLayoutVersion = async (layoutId: string, versionName: string) => {
    if (!confirm(`Are you sure you want to publish Layout "${versionName}"? It will become the active layout seen by customers.`)) {
      return;
    }
    try {
      await api.publishProjectLayout(currentProject.id, layoutId);
      await loadProjectInventory(selectedProjectId);
      alert(`Layout "${versionName}" is now published and active.`);
    } catch (err: any) {
      alert(err.message || 'Failed to publish layout version.');
    }
  };

  const handleDeleteLayoutVersion = async (layoutId: string, versionName: string) => {
    if (!confirm(`Are you sure you want to permanently delete Layout "${versionName}"? This will also remove the underlying storage file.`)) {
      return;
    }
    try {
      await api.deleteProjectLayout(currentProject.id, layoutId);
      await loadProjectInventory(selectedProjectId);
      alert(`Layout "${versionName}" was permanently deleted.`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete layout version.');
    }
  };

  const handleDeleteCurrentLayout = async () => {
    if (!confirm(`Are you sure you want to delete the active layout for "${currentProject.name}"? Customers will immediately see layout unavailable until a new layout is published.`)) {
      return;
    }
    try {
      await api.deactivateProjectLayout(currentProject.id);
      await loadProjectInventory(selectedProjectId);
      alert(`Active layout for "${currentProject.name}" deleted successfully.`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete active layout.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '4rem' }}>
      {/* Draft Publishing Sticky Bar */}
      <PublishBar
        draftCount={draftCount}
        onPublish={handlePublishAllDrafts}
        onDiscard={handleDiscardAllDrafts}
      />

      {/* CRM Navigation & Project Switcher Bar */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '1.5rem 0' }}>
        <div className="max-w-7xl">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <NovaLogo height={34} showSubtitle={false} />

              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--brand-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Nova CRM
                </span>
                <h1 style={{ fontSize: '1.6rem', color: '#fff', margin: 0 }}>
                  Manage Projects &amp; Inventory
                </h1>
              </div>

              {/* Project Switcher Dropdown & Add Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select
                  value={selectedProjectId}
                  onChange={e => setSelectedProjectId(e.target.value)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    background: 'var(--bg-surface-raised)',
                    borderColor: 'var(--border-medium)',
                    color: '#fff'
                  }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.project_type}) • {p.city}
                    </option>
                  ))}
                </select>

                <button
                  className="btn btn-outline-gold btn-sm"
                  onClick={() => setIsCreateProjectOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                  title="Create New Project"
                >
                  <PlusCircle size={15} /> + Create Project
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setIsImportWizardOpen(true)}
              >
                <FileSpreadsheet size={15} /> Import Excel
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setLayoutUploadName(`${currentProject.name} Official Layout`);
                  setIsLayoutModalOpen(true);
                }}
              >
                <Layers size={15} /> Upload Layout
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setReconfigType(currentProject.project_type === 'PLOT' ? 'APARTMENT' : 'PLOT');
                  setIsReconfigOpen(true);
                }}
                title="Reconfigure Project Type (e.g. PLOT -> APARTMENT)"
              >
                <Settings size={15} /> Project Settings
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setClearInventoryInput('');
                  setIsClearInventoryOpen(true);
                }}
                style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.35)' }}
                title={`Clear/Replace Inventory for ${currentProject.name}`}
              >
                <Trash2 size={15} /> Clear Inventory
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setIsDeleteProjectOpen(true)}
                style={{ color: '#ef4444' }}
                title="Delete Current Project"
              >
                <Trash2 size={15} /> Delete Project
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDeleteAllInput('');
                  setIsDeleteAllOpen(true);
                }}
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                title="Danger Zone: Permanently Delete All Data"
              >
                <AlertTriangle size={15} /> Delete All Data
              </button>

              <button 
                className="btn btn-secondary btn-sm"
                onClick={onLogout}
                style={{ color: 'var(--text-secondary)' }}
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Project Type</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-gold)' }}>{currentProject.project_type}</div>
            </div>

            <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Available Units</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-available)' }}>{currentProject.stats.available}</div>
            </div>

            <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Booked / Registered</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-booked)' }}>{currentProject.stats.booked + currentProject.stats.registered}</div>
            </div>

            <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Database Inventory</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{currentProject.stats.total_inventory}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main CRM Content Area */}
      <div className="max-w-7xl" style={{ width: '100%' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeTab === 'INVENTORY' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('INVENTORY')}
          >
            <Layers size={15} /> Inventory Management ({properties.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'HEALTH' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('HEALTH')}
          >
            <ShieldCheck size={15} /> Project Health & Readiness ({projectHealth ? `${projectHealth.readinessScore}%` : '100%'})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'AUDIT' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('AUDIT')}
          >
            <Settings size={15} /> Operational Audit Trail
          </button>
        </div>

        {activeTab === 'INVENTORY' ? (
          <InventoryTable
            properties={properties}
            project={currentProject}
            onAddProperty={() => {
              setEditingProperty(null);
              setIsEditModalOpen(true);
            }}
            onEditProperty={p => {
              setEditingProperty(p);
              setIsEditModalOpen(true);
            }}
            onStageStatus={handleStageStatus}
            onArchiveProperty={handleArchiveProperty}
            onOpenMapper={p => {
              setMappingProperty(p);
              setIsMapperOpen(true);
            }}
          />
        ) : activeTab === 'HEALTH' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Deterministic Readiness Gauge Card */}
            <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Deterministic Quality Standard
                  </span>
                  <h3 style={{ fontSize: '1.4rem', color: '#fff', margin: '0.25rem 0 0' }}>
                    {currentProject.name} • Readiness Assessment
                  </h3>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: projectHealth?.readinessScore >= 90 ? 'var(--status-available)' : (projectHealth?.readinessScore >= 60 ? 'var(--brand-gold)' : '#ef4444') }}>
                    {projectHealth?.readinessScore ?? 100}%
                  </div>
                  <span className={`badge ${projectHealth?.readinessStatus === 'READY' ? 'badge-available' : (projectHealth?.readinessStatus === 'NEEDS_ATTENTION' ? 'badge-draft' : 'badge-sold')}`}>
                    {projectHealth?.readinessStatus ?? 'READY'}
                  </span>
                </div>
              </div>

              {/* Checklist */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', background: 'var(--bg-surface-raised)', padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle2 size={18} color={projectHealth?.checklist?.projectInfo ? 'var(--status-available)' : '#ef4444'} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Master Metadata</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Name, Location, Highlights</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle2 size={18} color={projectHealth?.checklist?.layoutPublished ? 'var(--status-available)' : '#ef4444'} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Official CAD Layout</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{projectHealth?.layoutStatus}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle2 size={18} color={projectHealth?.checklist?.layoutAnalysisVerified ? 'var(--status-available)' : 'var(--brand-gold)' } />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Layout Intelligence</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{projectHealth?.layoutAnalysisStatus}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle2 size={18} color={projectHealth?.checklist?.cleanDataQuality ? 'var(--status-available)' : '#ef4444'} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Clean Data Quality</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>0 Duplicates • 0 Missing Extents</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layout Intelligence Observations Card */}
            {layoutAnalysis && (
              <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--brand-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                      Official Visual Grounding
                    </span>
                    <h4 style={{ fontSize: '1.15rem', color: '#fff', margin: 0 }}>
                      Layout Intelligence Observations ({layoutAnalysis.projectName})
                    </h4>
                  </div>
                  <span className="badge badge-available" style={{ fontSize: '0.72rem' }}>
                    Confidence: {(layoutAnalysis.confidence?.overall * 100).toFixed(0)}%
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.5rem' }}>
                      Roads & Corridors ({layoutAnalysis.roads?.length || 0})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {layoutAnalysis.roads?.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.5rem' }}>
                      Parks & OSR Reserves ({layoutAnalysis.parks?.length || 0})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {layoutAnalysis.parks?.map((p: string, idx: number) => <li key={idx}>{p}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-gold)', marginBottom: '0.5rem' }}>
                      Approved Utilities & Infrastructure
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {layoutAnalysis.amenities?.map((a: string, idx: number) => <li key={idx}>{a}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <AuditLogViewer projectId={currentProject.id} />
        )}
      </div>

      {/* Edit Property Modal */}
      {isEditModalOpen && (
        <PropertyEditModal
          property={editingProperty}
          project={currentProject}
          buildings={buildings}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveProperty}
        />
      )}

      {/* Excel Import Wizard */}
      {isImportWizardOpen && (
        <ExcelImportWizard
          project={currentProject}
          onClose={() => setIsImportWizardOpen(false)}
          onImportComplete={async () => {
            await loadProjects();
            await loadProjectInventory(selectedProjectId);
          }}
        />
      )}

      {/* Layout Upload & Lifecycle Management Modal */}
      {isLayoutModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLayoutModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Layers size={18} color="var(--brand-gold)" /> Official Layout Lifecycle Manager
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Manage CAD / architectural drawings for <strong>{currentProject.name}</strong>. Upload new revisions, save as draft, publish active versions, or remove outdated plans.
              </p>

              {/* Version History List */}
              {allLayouts.length > 0 && (
                <div style={{ background: 'var(--bg-surface-raised)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--brand-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Registered Layout Versions ({allLayouts.length})
                    </span>
                    {layout && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#ef4444', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        onClick={handleDeleteCurrentLayout}
                        title="Remove current active layout"
                      >
                        <Trash2 size={12} /> Remove Active Layout
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {allLayouts.map((l: any) => {
                      const isPub = l.status === 'PUBLISHED' || Boolean(l.is_active);
                      const isDraft = l.status === 'DRAFT';
                      return (
                        <div
                          key={l.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0.75rem',
                            background: isPub ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                            border: `1px solid ${isPub ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '0.82rem'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: '#fff' }}>
                              {l.name} <span style={{ color: 'var(--brand-gold)', fontSize: '0.75rem' }}>(v{l.version})</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Type: {l.layout_type} • Uploaded: {new Date(l.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.45rem',
                                background: isPub ? 'rgba(16, 185, 129, 0.15)' : isDraft ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                color: isPub ? 'var(--status-available)' : isDraft ? 'var(--status-booked)' : 'var(--status-sold)',
                                border: `1px solid ${isPub ? 'rgba(16, 185, 129, 0.3)' : isDraft ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`
                              }}
                            >
                              {isPub ? 'PUBLISHED' : isDraft ? 'DRAFT' : 'ARCHIVED'}
                            </span>

                            {!isPub && (
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                                onClick={() => handlePublishLayoutVersion(l.id, l.name)}
                                title="Publish this version to customers"
                              >
                                Publish
                              </button>
                            )}

                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#ef4444', fontSize: '0.72rem', padding: '0.2rem 0.4rem' }}
                              onClick={() => handleDeleteLayoutVersion(l.id, l.name)}
                              title="Delete layout version"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upload New Layout Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--brand-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Upload New Layout Version
                </span>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Layout Name *
                  </label>
                  <input
                    type="text"
                    value={layoutUploadName}
                    onChange={e => setLayoutUploadName(e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="e.g. Master Layout Scheme Option 03"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Layout Classification *
                  </label>
                  <select
                    value={layoutUploadType}
                    onChange={e => setLayoutUploadType(e.target.value as any)}
                    style={{ width: '100%' }}
                  >
                    <option value="MASTER_PLAN">Master Plan</option>
                    <option value="SCHEME_PLAN">Scheme Plan</option>
                    <option value="SUBDIVISION_PLAN">Sub-division Plan</option>
                    <option value="FLOOR_PLAN">Floor Plan</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Select File (.pdf, .jpg, .jpeg, .png, .svg) *
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.svg"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setLayoutUploadFile(file);
                      if (file && (file.type.startsWith('image/') || file.name.endsWith('.svg'))) {
                        setLayoutPreviewUrl(URL.createObjectURL(file));
                      } else {
                        setLayoutPreviewUrl(null);
                      }
                    }}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface-raised)' }}
                  />
                </div>

                {/* Preview Thumbnail */}
                {layoutPreviewUrl && (
                  <div style={{ padding: '0.5rem', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>File Preview</span>
                    <img 
                      src={layoutPreviewUrl} 
                      alt="Layout Preview" 
                      style={{ maxHeight: '140px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }} 
                    />
                  </div>
                )}

                {/* Draft vs Publish Option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem', background: 'var(--bg-surface-raised)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <input
                    type="checkbox"
                    id="save-as-draft"
                    checked={isDraftUpload}
                    onChange={e => setIsDraftUpload(e.target.checked)}
                    style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="save-as-draft" style={{ fontSize: '0.82rem', color: '#fff', cursor: 'pointer' }}>
                    Save as <strong>DRAFT</strong> (Saved in CRM, not visible to customers until published)
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setIsLayoutModalOpen(false)} disabled={isUploadingLayout}>
                Close
              </button>
              <button className="btn btn-primary" onClick={handleUploadLayout} disabled={isUploadingLayout || !layoutUploadFile}>
                {isUploadingLayout ? 'Uploading...' : isDraftUpload ? 'Save as Draft' : 'Publish Layout Version'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layout Coordinate Mapper Tool */}
      {isMapperOpen && mappingProperty && (
        <LayoutMapperTool
          property={mappingProperty}
          layout={layout}
          onClose={() => setIsMapperOpen(false)}
          onSaved={async () => {
            await loadProjectInventory(selectedProjectId);
          }}
        />
      )}

      {/* Project Reconfiguration Modal (e.g. PLOT -> APARTMENT) */}
      {isReconfigOpen && (
        <div className="modal-overlay" onClick={() => setIsReconfigOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>
                Reconfigure Project Classification
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Change authoritative property model for <strong>{currentProject.name}</strong>. Existing plot data will be safely archived/superseded with a permanent audit trail.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Target Project Type *
                </label>
                <select
                  value={reconfigType}
                  onChange={e => setReconfigType(e.target.value as any)}
                  style={{ width: '100%' }}
                >
                  <option value="APARTMENT">APARTMENT (Multi-Storey Residences)</option>
                  <option value="PLOT">PLOT (Plotted Residential Development)</option>
                  <option value="COMMERCIAL">COMMERCIAL (Commercial Real Estate)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Business Decision Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Nova company board decision to construct multi-storey apartments..."
                  value={reconfigReason}
                  onChange={e => setReconfigReason(e.target.value)}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsReconfigOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleReconfigureProject}>
                Confirm Reconfiguration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateProjectOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateProjectOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
            <form onSubmit={handleCreateProject}>
              <div className="modal-header">
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <PlusCircle size={18} color="var(--brand-gold)" /> + Create New Project
                </h3>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nova Silver Springs"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      Project Type *
                    </label>
                    <select
                      value={newProjectType}
                      onChange={e => setNewProjectType(e.target.value as any)}
                      style={{ width: '100%' }}
                    >
                      <option value="PLOT">PLOT (Plotted Land)</option>
                      <option value="APARTMENT">APARTMENT (Residences)</option>
                      <option value="COMMERCIAL">COMMERCIAL</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      Status
                    </label>
                    <select
                      value={newProjectStatus}
                      onChange={e => setNewProjectStatus(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="COMING_SOON">COMING_SOON</option>
                      <option value="INVENTORY_PENDING">INVENTORY_PENDING</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      Location / Neighborhood *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mogappair West"
                      value={newProjectLocation}
                      onChange={e => setNewProjectLocation(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Chennai"
                      value={newProjectCity}
                      onChange={e => setNewProjectCity(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Short description of the community..."
                    value={newProjectDescription}
                    onChange={e => setNewProjectDescription(e.target.value)}
                    style={{ width: '100%', resize: 'none' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateProjectOpen(false)} disabled={isCreatingProject}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreatingProject}>
                  {isCreatingProject ? 'Creating...' : 'Save & Register Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {isDeleteProjectOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteProjectOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <AlertTriangle size={20} /> Delete Project Confirmation
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Are you sure you want to delete "{currentProject.name}"?
              </p>

              <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div>• <strong>Inventory:</strong> {currentProject.stats.total_inventory} properties</div>
                <div>• <strong>Layouts:</strong> {layout ? 1 : 0} published layout</div>
                <div>• <strong>Location:</strong> {currentProject.location}, {currentProject.city}</div>
              </div>

              <p style={{ color: '#ef4444', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
                ⚠️ This action cannot be undone. All associated inventory, layout mappings, and change logs for this project will be permanently removed.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsDeleteProjectOpen(false)} disabled={isDeletingProject}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                onClick={handleDeleteProject}
                disabled={isDeletingProject}
              >
                {isDeletingProject ? 'Deleting...' : 'Permanently Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Project Inventory Modal (Phase 10 & 11) */}
      {isClearInventoryOpen && currentProject && (
        <div className="modal-overlay" onClick={() => setIsClearInventoryOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', border: '1px solid rgba(245, 158, 11, 0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#f59e0b', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <AlertTriangle size={20} /> Clear Project Inventory: {currentProject.name}
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                This will remove all property inventory units for <strong>{currentProject.name}</strong> to allow a fresh Excel import or inventory replacement.
              </p>

              <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.85rem', color: '#fde68a', lineHeight: 1.6 }}>
                <div>• <strong>{currentProject.stats.total_inventory} inventory units</strong> will be cleared from this project.</div>
                <div>• <strong>Project record and CAD layouts will remain intact.</strong></div>
                <div>• All <strong>other {projects.length - 1} projects</strong> will remain completely untouched.</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  To confirm, type <span style={{ color: '#f59e0b', fontWeight: 800, userSelect: 'all' }}>CLEAR {currentProject.name.toUpperCase().trim()} INVENTORY</span> below:
                </label>
                <input
                  type="text"
                  value={clearInventoryInput}
                  onChange={e => setClearInventoryInput(e.target.value)}
                  placeholder={`Type CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY`}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid ' + (clearInventoryInput.trim().toUpperCase() === `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY` ? '#f59e0b' : 'var(--border-medium)'),
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    fontWeight: 700,
                    letterSpacing: '0.04em'
                  }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsClearInventoryOpen(false)} disabled={isClearingInventory}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{
                  background: clearInventoryInput.trim().toUpperCase() === `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY` ? '#d97706' : 'rgba(217, 119, 6, 0.4)',
                  borderColor: clearInventoryInput.trim().toUpperCase() === `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY` ? '#b45309' : 'transparent',
                  cursor: clearInventoryInput.trim().toUpperCase() === `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY` && !isClearingInventory ? 'pointer' : 'not-allowed'
                }}
                onClick={handleClearProjectInventory}
                disabled={clearInventoryInput.trim().toUpperCase() !== `CLEAR ${currentProject.name.toUpperCase().trim()} INVENTORY` || isClearingInventory}
              >
                {isClearingInventory ? 'Clearing Inventory...' : 'Confirm Clear Project Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone: Permanent Delete All Data Modal */}
      {isDeleteAllOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteAllOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', border: '1px solid rgba(239, 68, 68, 0.4)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#ef4444', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <AlertTriangle size={22} /> Danger Zone: Delete All Production Data
              </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <p style={{ color: '#fff', fontSize: '0.98rem', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                This will permanently delete all Nova projects, properties, layouts, versions, and inventory records across the entire system.
              </p>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.85rem', color: '#fca5a5', lineHeight: 1.6 }}>
                <div>• All <strong>{projects.length} project catalogs</strong> will be wiped from Supabase.</div>
                <div>• All <strong>customer property listings &amp; master plans</strong> will be cleared.</div>
                <div>• Customer-facing website will immediately enter an empty state.</div>
                <div>• <strong>This action is irreversible and cannot be undone.</strong></div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  To confirm, type <span style={{ color: '#ef4444', fontWeight: 800, userSelect: 'all' }}>DELETE ALL DATA</span> below:
                </label>
                <input
                  type="text"
                  value={deleteAllInput}
                  onChange={e => setDeleteAllInput(e.target.value)}
                  placeholder="Type DELETE ALL DATA exactly"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid ' + (deleteAllInput === 'DELETE ALL DATA' ? '#ef4444' : 'var(--border-medium)'),
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    fontWeight: 700,
                    letterSpacing: '0.04em'
                  }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsDeleteAllOpen(false)} disabled={isDeletingAll}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{
                  background: deleteAllInput === 'DELETE ALL DATA' ? '#dc2626' : 'rgba(220, 38, 38, 0.4)',
                  borderColor: deleteAllInput === 'DELETE ALL DATA' ? '#b91c1c' : 'transparent',
                  cursor: deleteAllInput === 'DELETE ALL DATA' && !isDeletingAll ? 'pointer' : 'not-allowed'
                }}
                onClick={handleDeleteAllData}
                disabled={deleteAllInput !== 'DELETE ALL DATA' || isDeletingAll}
              >
                {isDeletingAll ? 'Deleting All Data...' : 'Permanently Delete All Production Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

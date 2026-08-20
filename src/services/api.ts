import { Project, Property, LayoutPlan, Building, User, AuditLog } from '../types/models.ts';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('nova_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const api = {
  // -------------------------------------------------------------
  // PUBLIC CUSTOMER APIS
  // -------------------------------------------------------------
  async getPublicProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/public/projects`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load projects');
    return data.projects;
  },

  async getPublicProject(slug: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/public/projects/${slug}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load project');
    return data.project;
  },

  async getProjectLayout(slug: string): Promise<LayoutPlan | null> {
    const res = await fetch(`${API_BASE}/public/projects/${slug}/layout`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load layout');
    return data.layout;
  },

  async getProjectBuildings(slug: string): Promise<Building[]> {
    const res = await fetch(`${API_BASE}/public/projects/${slug}/buildings`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load buildings');
    return data.buildings;
  },

  async getPublicProperties(filter: any): Promise<{ properties: Property[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const res = await fetch(`${API_BASE}/public/properties?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to search properties');
    return { properties: data.properties, total: data.total };
  },

  async getPropertyById(id: string): Promise<Property> {
    const res = await fetch(`${API_BASE}/public/properties/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load property');
    return data.property;
  },

  async compareProperties(propertyIds: string[]): Promise<Property[]> {
    const res = await fetch(`${API_BASE}/public/properties/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to compare properties');
    return data.comparison;
  },

  async getProjectLayoutAnalysis(slug: string) {
    const res = await fetch(`${API_BASE}/public/projects/${slug}/layout-analysis`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load layout analysis');
    return data.analysis;
  },

  async submitEnquiry(payload: { projectId: string; propertyId?: string; customerName: string; customerPhone: string; customerEmail?: string; message?: string }) {
    const res = await fetch(`${API_BASE}/public/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit enquiry');
    return data;
  },

  // -------------------------------------------------------------
  // ASK NOVA AI INTEGRATION
  // -------------------------------------------------------------
  async askNova(messages: { role: string; content: string }[], projectSlug?: string) {
    const res = await fetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, projectSlug })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI Assistant unavailable');
    return data;
  },

  // -------------------------------------------------------------
  // CRM APIS
  // -------------------------------------------------------------
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/crm/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('nova_auth_token', data.token);
    return data;
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE}/crm/auth/me`, {
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unauthorized');
    return data.user;
  },

  async getCrmProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/crm/projects`, {
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load projects');
    return data.projects;
  },

  async createProject(payload: {
    name: string;
    project_type: 'PLOT' | 'APARTMENT' | 'COMMERCIAL';
    location: string;
    city?: string;
    description?: string;
    highlights?: string[];
    amenities?: string[];
    status?: string;
    is_published?: boolean;
    total_area_reference?: string;
    total_units_reference?: number;
    cover_image?: string;
  }): Promise<Project> {
    const res = await fetch(`${API_BASE}/crm/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create project');
    return data.project;
  },

  async deleteProject(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/crm/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete project');
    return data;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const res = await fetch(`${API_BASE}/crm/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update project');
    return data.project;
  },

  async getProjectHealth(id: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${id}/health`, {
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load project health');
    return data.health;
  },

  async approveLayoutAnalysis(id: string, updates: any) {
    const res = await fetch(`${API_BASE}/crm/projects/${id}/layout-analysis/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to approve layout analysis');
    return data.analysis;
  },

  async reconfigureProjectType(id: string, newType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL', reason: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${id}/reconfigure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ newType, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reconfigure project');
    return data;
  },

  async getCrmProperties(filter: any): Promise<{ properties: Property[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const res = await fetch(`${API_BASE}/crm/properties?${query.toString()}`, {
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load inventory');
    return { properties: data.properties, total: data.total };
  },

  async createProperty(propertyData: any): Promise<Property> {
    const res = await fetch(`${API_BASE}/crm/properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(propertyData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create property');
    return data.property;
  },

  async updateProperty(id: string, propertyData: any, isDraft = false): Promise<Property> {
    const res = await fetch(`${API_BASE}/crm/properties/${id}?draft=${isDraft}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(propertyData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update property');
    return data.property;
  },

  async stageStatusUpdate(id: string, status: string): Promise<Property> {
    const res = await fetch(`${API_BASE}/crm/properties/${id}/stage-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to stage status');
    return data.property;
  },

  async archiveProperty(id: string, reason: string) {
    const res = await fetch(`${API_BASE}/crm/properties/${id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to archive property');
    return data;
  },

  async savePropertyGeometry(propertyId: string, layoutId: string, geometryData: any) {
    const res = await fetch(`${API_BASE}/crm/properties/${propertyId}/geometry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ layoutId, geometryData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save geometry');
    return data;
  },

  async getPendingDrafts(projectId?: string) {
    const url = projectId ? `${API_BASE}/crm/drafts?projectId=${projectId}` : `${API_BASE}/crm/drafts`;
    const res = await fetch(url, { headers: getAuthHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load drafts');
    return data;
  },

  async publishDrafts(projectId: string) {
    const res = await fetch(`${API_BASE}/crm/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ projectId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to publish');
    return data;
  },

  async discardDrafts(projectId: string) {
    const res = await fetch(`${API_BASE}/crm/discard-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ projectId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to discard drafts');
    return data;
  },

  async uploadExcelForSheets(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/crm/excel/sheets`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to parse Excel workbook');
    return data;
  },

  async getAuditLogs(projectId?: string): Promise<AuditLog[]> {
    const url = projectId ? `${API_BASE}/crm/audit-logs?projectId=${projectId}` : `${API_BASE}/crm/audit-logs`;
    const res = await fetch(url, { headers: getAuthHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load audit logs');
    return data.logs;
  },

  async getProjectLayouts(projectId: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${projectId}/layouts`, {
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch project layouts');
    return data.layouts;
  },

  async uploadProjectLayout(projectId: string, file: File, name?: string, layoutType?: string, isDraft?: boolean) {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (layoutType) formData.append('layoutType', layoutType);
    if (isDraft) formData.append('isDraft', 'true');
    const res = await fetch(`${API_BASE}/crm/projects/${projectId}/layout`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload layout');
    return data;
  },

  async publishProjectLayout(projectId: string, layoutId: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${projectId}/layouts/${layoutId}/publish`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to publish layout');
    return data;
  },

  async deleteProjectLayout(projectId: string, layoutId: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${projectId}/layouts/${layoutId}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete layout');
    return data;
  },

  async deactivateProjectLayout(projectId: string) {
    const res = await fetch(`${API_BASE}/crm/projects/${projectId}/layout`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to deactivate layout');
    return data;
  },

  async generateExcelPreview(file: File, projectId: string, sheetName: string, customMapping?: any) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('sheetName', sheetName);
    if (customMapping) {
      formData.append('customMapping', JSON.stringify(customMapping));
    }
    const res = await fetch(`${API_BASE}/crm/excel/preview`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate preview');
    return data.preview;
  },

  async applyExcelImport(
    importId: string,
    options?: { skipInvalid?: boolean; rowActions?: Record<number, any> }
  ) {
    const res = await fetch(`${API_BASE}/crm/excel/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        importId,
        skipInvalid: options?.skipInvalid,
        rowActions: options?.rowActions
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to apply import');
    return data;
  }
};

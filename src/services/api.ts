import { Project, Property, LayoutPlan, Building, User, AuditLog } from '../types/models.ts';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('nova_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Safe central request handler that guarantees proper JSON parsing and graceful error messages
async function request<T = any>(
  endpoint: string, 
  options: RequestInit = {}, 
  fallbackMessage = 'Request failed',
  retryCount = 0
): Promise<T> {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    // Polite bounded single retry for GET requests during server cold-wake
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET' && retryCount < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return request<T>(endpoint, options, fallbackMessage, retryCount + 1);
    }
    console.error(`[API Network Error] ${options.method || 'GET'} ${url}:`, netErr);
    throw new Error('Unable to connect to the server. Please check your network connection.');
  }

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    let data: any;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Failed to parse server response from ${endpoint}.`);
    }

    if (!res.ok) {
      const errorMsg = typeof data?.error === 'string' 
        ? data.error 
        : (data?.error?.message || data?.message || `${fallbackMessage} (HTTP ${res.status})`);
      const err: any = new Error(errorMsg);
      err.data = data;
      err.code = data?.error?.code;
      err.requiresMapping = data?.requiresMapping;
      err.availableHeaders = data?.availableHeaders;
      err.identifierCandidates = data?.identifierCandidates;
      throw err;
    }
    return data as T;
  }

  // Non-JSON response (e.g. 500 HTML error page, 502 Bad Gateway text, 404 HTML)
  const rawText = await res.text().catch(() => '');
  console.error(`[API Error] Non-JSON response from ${url} [Status ${res.status}]:`, rawText.slice(0, 200));

  if (res.status === 404) {
    throw new Error(`API endpoint '${endpoint}' not found (HTTP 404).`);
  }
  if (res.status >= 500) {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'GET' && retryCount < 1) {
      await new Promise(r => setTimeout(r, 1000));
      return request<T>(endpoint, options, fallbackMessage, retryCount + 1);
    }
    throw new Error(`Server encountered an issue (HTTP ${res.status}). Please try again shortly.`);
  }

  throw new Error(`${fallbackMessage} (HTTP ${res.status}).`);
}

export const api = {
  // -------------------------------------------------------------
  // PUBLIC CUSTOMER APIS
  // -------------------------------------------------------------
  async getPublicProjects(): Promise<Project[]> {
    const data = await request<{ success: boolean; projects: Project[] }>(
      '/public/projects',
      {},
      'Failed to load projects'
    );
    return data.projects || [];
  },

  async getPublicProject(slug: string): Promise<Project> {
    const data = await request<{ success: boolean; project: Project }>(
      `/public/projects/${slug}`,
      {},
      'Failed to load project'
    );
    return data.project;
  },

  async getProjectLayout(slug: string): Promise<LayoutPlan | null> {
    const data = await request<{ success: boolean; layout: LayoutPlan | null }>(
      `/public/projects/${slug}/layout`,
      {},
      'Failed to load layout'
    );
    return data.layout ?? null;
  },

  async getProjectBuildings(slug: string): Promise<Building[]> {
    const data = await request<{ success: boolean; buildings: Building[] }>(
      `/public/projects/${slug}/buildings`,
      {},
      'Failed to load buildings'
    );
    return data.buildings || [];
  },

  async getPublicProperties(filter: any): Promise<{ properties: Property[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(filter || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const data = await request<{ success: boolean; properties: Property[]; total: number }>(
      `/public/properties?${query.toString()}`,
      {},
      'Failed to search properties'
    );
    return { properties: data.properties || [], total: data.total || 0 };
  },

  async getPropertyById(id: string): Promise<Property> {
    const data = await request<{ success: boolean; property: Property }>(
      `/public/properties/${id}`,
      {},
      'Failed to load property'
    );
    return data.property;
  },

  async compareProperties(propertyIds: string[]): Promise<Property[]> {
    const data = await request<{ success: boolean; comparison: Property[] }>(
      '/public/properties/compare',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyIds })
      },
      'Failed to compare properties'
    );
    return data.comparison || [];
  },

  async getProjectLayoutAnalysis(slug: string) {
    const data = await request<{ success: boolean; analysis: any }>(
      `/public/projects/${slug}/layout-analysis`,
      {},
      'Failed to load layout analysis'
    );
    return data.analysis;
  },

  async submitEnquiry(payload: { projectId: string; propertyId?: string; customerName: string; customerPhone: string; customerEmail?: string; message?: string }) {
    return request(
      '/public/enquiries',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      'Failed to submit enquiry'
    );
  },

  // -------------------------------------------------------------
  // ASK NOVA AI INTEGRATION
  // -------------------------------------------------------------
  async askNova(messages: { role: string; content: string }[], projectSlug?: string) {
    return request(
      '/ai/ask',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, projectSlug })
      },
      'AI Assistant unavailable'
    );
  },

  // -------------------------------------------------------------
  // CRM APIS
  // -------------------------------------------------------------
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const data = await request<{ token: string; user: User }>(
      '/crm/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      },
      'Login failed'
    );
    if (data.token) {
      localStorage.setItem('nova_auth_token', data.token);
    }
    return data;
  },

  async getMe(): Promise<User> {
    const data = await request<{ user: User }>(
      '/crm/auth/me',
      { headers: getAuthHeader() },
      'Unauthorized'
    );
    return data.user;
  },

  async getCrmProjects(): Promise<Project[]> {
    const data = await request<{ projects: Project[] }>(
      '/crm/projects',
      { headers: getAuthHeader() },
      'Failed to load projects'
    );
    return data.projects || [];
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
    const data = await request<{ project: Project }>(
      '/crm/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload)
      },
      'Failed to create project'
    );
    return data.project;
  },

  async deleteProject(id: string): Promise<{ success: boolean; message: string }> {
    return request(
      `/crm/projects/${id}`,
      {
        method: 'DELETE',
        headers: getAuthHeader()
      },
      'Failed to delete project'
    );
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const data = await request<{ project: Project }>(
      `/crm/projects/${id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(updates)
      },
      'Failed to update project'
    );
    return data.project;
  },

  async getProjectHealth(id: string) {
    const data = await request<{ health: any }>(
      `/crm/projects/${id}/health`,
      { headers: getAuthHeader() },
      'Failed to load project health'
    );
    return data.health;
  },

  async approveLayoutAnalysis(id: string, updates: any) {
    const data = await request<{ analysis: any }>(
      `/crm/projects/${id}/layout-analysis/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(updates)
      },
      'Failed to approve layout analysis'
    );
    return data.analysis;
  },

  async reconfigureProjectType(id: string, newType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL', reason: string) {
    return request(
      `/crm/projects/${id}/reconfigure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ newType, reason })
      },
      'Failed to reconfigure project'
    );
  },

  async getCrmProperties(filter: any): Promise<{ properties: Property[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(filter || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const data = await request<{ properties: Property[]; total: number }>(
      `/crm/properties?${query.toString()}`,
      { headers: getAuthHeader() },
      'Failed to load inventory'
    );
    return { properties: data.properties || [], total: data.total || 0 };
  },

  async createProperty(propertyData: any): Promise<Property> {
    const data = await request<{ property: Property }>(
      '/crm/properties',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(propertyData)
      },
      'Failed to create property'
    );
    return data.property;
  },

  async updateProperty(id: string, propertyData: any, isDraft = false): Promise<Property> {
    const data = await request<{ property: Property }>(
      `/crm/properties/${id}?draft=${isDraft}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(propertyData)
      },
      'Failed to update property'
    );
    return data.property;
  },

  async stageStatusUpdate(id: string, status: string): Promise<Property> {
    const data = await request<{ property: Property }>(
      `/crm/properties/${id}/stage-status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status })
      },
      'Failed to stage status'
    );
    return data.property;
  },

  async archiveProperty(id: string, reason: string) {
    return request(
      `/crm/properties/${id}/archive`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ reason })
      },
      'Failed to archive property'
    );
  },

  async savePropertyGeometry(propertyId: string, layoutId: string, geometryData: any) {
    return request(
      `/crm/properties/${propertyId}/geometry`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ layoutId, geometryData })
      },
      'Failed to save geometry'
    );
  },

  async getPendingDrafts(projectId?: string) {
    const url = projectId ? `/crm/drafts?projectId=${projectId}` : '/crm/drafts';
    return request(url, { headers: getAuthHeader() }, 'Failed to load drafts');
  },

  async publishDrafts(projectId: string) {
    return request(
      '/crm/publish',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ projectId })
      },
      'Failed to publish'
    );
  },

  async discardDrafts(projectId: string) {
    return request(
      '/crm/discard-drafts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ projectId })
      },
      'Failed to discard drafts'
    );
  },

  async uploadExcelForSheets(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return request(
      '/crm/excel/sheets',
      {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      },
      'Failed to parse Excel workbook'
    );
  },

  async getAuditLogs(projectId?: string): Promise<AuditLog[]> {
    const url = projectId ? `/crm/audit-logs?projectId=${projectId}` : '/crm/audit-logs';
    const data = await request<{ logs: AuditLog[] }>(
      url,
      { headers: getAuthHeader() },
      'Failed to load audit logs'
    );
    return data.logs || [];
  },

  async getProjectLayouts(projectId: string) {
    const data = await request<{ layouts: any[] }>(
      `/crm/projects/${projectId}/layouts`,
      { headers: getAuthHeader() },
      'Failed to fetch project layouts'
    );
    return data.layouts || [];
  },

  async uploadProjectLayout(projectId: string, file: File, name?: string, layoutType?: string, isDraft?: boolean) {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (layoutType) formData.append('layoutType', layoutType);
    if (isDraft) formData.append('isDraft', 'true');
    return request(
      `/crm/projects/${projectId}/layout`,
      {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      },
      'Failed to upload layout'
    );
  },

  async publishProjectLayout(projectId: string, layoutId: string) {
    return request(
      `/crm/projects/${projectId}/layouts/${layoutId}/publish`,
      {
        method: 'POST',
        headers: getAuthHeader()
      },
      'Failed to publish layout'
    );
  },

  async deleteProjectLayout(projectId: string, layoutId: string) {
    return request(
      `/crm/projects/${projectId}/layouts/${layoutId}`,
      {
        method: 'DELETE',
        headers: getAuthHeader()
      },
      'Failed to delete layout'
    );
  },

  async deactivateProjectLayout(projectId: string) {
    return request(
      `/crm/projects/${projectId}/layout`,
      {
        method: 'DELETE',
        headers: getAuthHeader()
      },
      'Failed to deactivate layout'
    );
  },

  async generateExcelPreview(file: File, projectId: string, sheetName: string, customMapping?: any) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('sheetName', sheetName);
    if (customMapping) {
      formData.append('customMapping', JSON.stringify(customMapping));
    }
    const data = await request<{ preview: any }>(
      '/crm/excel/preview',
      {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData
      },
      'Failed to generate preview'
    );
    return data.preview;
  },

  async applyExcelImport(
    importId: string,
    options?: { skipInvalid?: boolean; rowActions?: Record<number, any> }
  ) {
    return request(
      '/crm/excel/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          importId,
          skipInvalid: options?.skipInvalid,
          rowActions: options?.rowActions
        })
      },
      'Failed to apply import'
    );
  }
};

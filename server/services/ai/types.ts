export type IntentType =
  | 'GENERAL_KNOWLEDGE'
  | 'NOVA_OVERVIEW'
  | 'PROJECT_SEARCH'
  | 'PROJECT_DETAILS'
  | 'INVENTORY_SEARCH'
  | 'AVAILABILITY_QUERY'
  | 'PROPERTY_DETAILS'
  | 'PROPERTY_COMPARISON'
  | 'LAYOUT_QUERY'
  | 'AMENITY_QUERY'
  | 'LOCATION_QUERY'
  | 'RECOMMENDATION'
  | 'DOCUMENT_QUERY'
  | 'MIXED'
  | 'CLARIFICATION'
  | 'UNSUPPORTED';

export type ResponseMode =
  | 'GENERAL'
  | 'NOVA_GENERAL'
  | 'PROJECT_GROUNDED'
  | 'LIVE_INVENTORY'
  | 'LAYOUT_INTELLIGENCE'
  | 'MIXED'
  | 'RECOMMENDATION'
  | 'CLARIFICATION'
  | 'NO_VERIFIED_RESULT'
  | 'UNSUPPORTED';

export type SourceType =
  | 'LIVE_INVENTORY'
  | 'PROJECT_DATA'
  | 'OFFICIAL_LAYOUT'
  | 'LAYOUT_ANALYSIS'
  | 'APPROVED_DOCUMENT'
  | 'GENERAL_KNOWLEDGE';

export type SpatialConfidence = 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface NormalizedRecord {
  propertyNumber: string;
  propertyType: string;
  status: string;
  facing?: string;
  areaSqft?: number;
  priceDisplay?: string;
  unitType?: string;
  floorName?: string;
  sectionOrPhase?: string;
  udsSqft?: number;
  saleableAreaSqft?: number;
}

export interface RetrievedContext {
  sourceType: SourceType;
  sourceId?: string;
  projectId?: string;
  projectName?: string;
  retrievedAt: string;
  publishedState: 'PUBLISHED' | 'OFFICIAL' | 'GENERAL';
  confidence?: SpatialConfidence;
  records?: NormalizedRecord[];
  data?: any;
}

export interface InventoryFilters {
  status?: string;
  facing?: string;
  minArea?: number;
  maxArea?: number;
  unitType?: string;
  propertyType?: string;
  sectionOrPhase?: string;
  location?: string;
}

export interface QueryPlan {
  intent: IntentType;
  responseMode: ResponseMode;
  targetProjectSlug?: string;
  targetProjectId?: string;
  targetProjectName?: string;
  requiresLiveData: boolean;
  requiresProjectData: boolean;
  requiresLayout: boolean;
  requiresGeneralKnowledge: boolean;
  filters?: InventoryFilters;
  propertyNumbers?: string[];
  spatialTarget?: {
    feature: string; // 'park', 'entrance', 'road', 'amenity'
    plotNumber?: string;
  };
  isAmbiguous: boolean;
  clarificationQuestion?: string;
}

export interface AiRequestLog {
  requestId: string;
  timestamp: string;
  userQuery: string;
  detectedIntent: IntentType;
  responseMode: ResponseMode;
  targetProjectSlug?: string;
  retrievalSources: SourceType[];
  resultCount: number;
  groundingStatus: 'VERIFIED' | 'HONEST_FALLBACK' | 'GENERAL_ONLY' | 'REJECTED';
  latencyMs: number;
  errors?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
  name?: string;
}

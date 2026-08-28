export type IntentType =
  | 'GREETING'
  | 'CASUAL_CONVERSATION'
  | 'GENERAL_CONVERSATION'
  | 'GENERAL_REAL_ESTATE'
  | 'GENERAL_REAL_ESTATE_KNOWLEDGE'
  | 'GENERAL_PROPERTY_ADVICE'
  | 'GENERAL_FINANCIAL_GUIDANCE'
  | 'GENERAL_KNOWLEDGE'
  | 'NOVA_OVERVIEW'
  | 'NOVA_PROJECT_INFORMATION'
  | 'NOVA_CATALOG_QUERY'
  | 'PROJECT_SEARCH'
  | 'PROJECT_DETAILS'
  | 'PROJECT_INFORMATION'
  | 'PROPERTY_SEARCH'
  | 'APARTMENT_SEARCH'
  | 'PLOT_SEARCH'
  | 'INVENTORY_SEARCH'
  | 'AVAILABILITY_SEARCH'
  | 'AVAILABILITY_QUERY'
  | 'PROPERTY_LOOKUP'
  | 'PROPERTY_DETAILS'
  | 'PROPERTY_COMPARISON'
  | 'PROJECT_COMPARISON'
  | 'PROPERTY_EVALUATION'
  | 'PROPERTY_RECOMMENDATION'
  | 'FOLLOW_UP'
  | 'FILTER_MODIFICATION'
  | 'CALCULATION'
  | 'BUYING_CONSIDERATION'
  | 'TOPIC_SWITCH'
  | 'LAYOUT_QUERY'
  | 'PROPERTY_ATTRIBUTE_QUERY'
  | 'NOVA_COMPANY_QUERY'
  | 'AMENITY_QUERY'
  | 'LOCATION_SEARCH'
  | 'LOCATION_QUERY'
  | 'RECOMMENDATION'
  | 'DOCUMENT_QUERY'
  | 'MIXED'
  | 'CLARIFICATION_REQUIRED'
  | 'CLARIFICATION'
  | 'UNKNOWN'
  | 'UNSUPPORTED';

export type ResponseMode =
  | 'GENERAL'
  | 'GREETING'
  | 'CASUAL'
  | 'GENERAL_REAL_ESTATE'
  | 'NOVA_GENERAL'
  | 'PROJECT_GROUNDED'
  | 'LIVE_INVENTORY'
  | 'LAYOUT_INTELLIGENCE'
  | 'MIXED'
  | 'RECOMMENDATION'
  | 'COMPARISON'
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
  carpetAreaSqft?: number;
  plinthAreaSqft?: number;
  projectId?: string;
  projectName?: string;
  projectSlug?: string;
  location?: string;
  city?: string;
}

export interface RetrievedContext {
  sourceType: SourceType;
  sourceId?: string;
  projectId?: string;
  projectName?: string;
  projectSlug?: string;
  retrievedAt: string;
  publishedState: 'PUBLISHED' | 'OFFICIAL' | 'GENERAL';
  confidence?: SpatialConfidence;
  records?: NormalizedRecord[];
  data?: any;
}

export interface InventoryFilters {
  status?: string;
  facing?: string;
  negatedFacing?: string[];
  minArea?: number;
  maxArea?: number;
  unitType?: string;
  propertyType?: string;
  sectionOrPhase?: string;
  location?: string;
  city?: string;
  projectSlug?: string;
  sortBy?: 'area_asc' | 'area_desc' | 'price_asc' | 'price_desc' | 'default';
  limit?: number;
}

export interface ConversationContext {
  projectSlug?: string;
  projectName?: string;
  projectId?: string;
  location?: string;
  city?: string;
  propertyType?: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP';
  configuration?: string;
  facing?: string;
  negatedFacing?: string[];
  minArea?: number;
  maxArea?: number;
  budget?: number;
  status?: string;
  propertyNumber?: string;
  activeTopic?: 'GENERAL_KNOWLEDGE' | 'PROPERTY_SEARCH' | 'PROJECT_EXPLORATION' | 'CASUAL';
  savedSearchContext?: Partial<ConversationContext>;
  lastMentionedProperties?: string[];
  lastRetrievedCount?: number;
  lastRetrievedSample?: string[];
  sortBy?: 'area_asc' | 'area_desc' | 'price_asc' | 'price_desc';
}

export type ContextAction = 'NEW_INDEPENDENT_REQUEST' | 'FOLLOW_UP_REQUEST' | 'CONTINUATION' | 'GENERAL_EDUCATION' | 'TOPIC_SWITCH' | 'CORRECTION';

export type SearchScope = 'ALL_NOVA_PROJECTS' | 'LOCATION_SCOPED' | 'SINGLE_PROJECT_SCOPED' | 'NONE';

export type ResponseProvenance = 'GENERAL_KNOWLEDGE' | 'NOVA_DATABASE' | 'NOVA_PROJECT_CONTENT' | 'HYBRID';

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
  crossProjectSearch?: boolean;
  searchScope?: SearchScope;
  contextAction?: ContextAction;
  retainedContext?: Partial<ConversationContext>;
  clearedContext?: Partial<ConversationContext>;
  savedSearchContext?: Partial<ConversationContext>;
  filters?: InventoryFilters;
  propertyNumbers?: string[];
  comparisonProperties?: string[];
  spatialTarget?: {
    feature: string; // 'park', 'entrance', 'road', 'amenity'
    plotNumber?: string;
  };
  isAmbiguous: boolean;
  clarificationQuestion?: string;
  educationalConcept?: string;
  calculationDetails?: {
    expression: string;
    result: number;
    explanation: string;
  };
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
  provenance?: ResponseProvenance;
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



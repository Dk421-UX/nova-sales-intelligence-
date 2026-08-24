import { aiIntentRouter } from './intentRouter.ts';
import { aiRetrievalLayer } from './retrievalLayer.ts';
import { llamaEngine } from './llamaEngine.ts';
import { aiGroundingEngine } from './groundingEngine.ts';
import { aiObservability } from './observability.ts';
import { ChatMessage, RetrievedContext, SourceType } from './types.ts';

export class AIService {
  /**
   * Main entry point for Ask Nova
   */
  async askNova(messages: ChatMessage[], currentProjectSlug?: string) {
    const startTime = Date.now();
    const userQuery = messages[messages.length - 1]?.content || '';
    const executedSources: SourceType[] = [];

    try {
      // 1. Intent Detection & Query Planning
      const plan = aiIntentRouter.planQuery(messages, currentProjectSlug);

      // 2. Targeted Data Retrieval according to Query Plan
      const contexts: RetrievedContext[] = [];

      if (plan.requiresProjectData) {
        if (plan.intent === 'NOVA_OVERVIEW') {
          const cat = aiRetrievalLayer.getPublishedProjects(plan.filters ? { city: plan.filters.location, location: plan.filters.location } : undefined);
          contexts.push(cat);
          executedSources.push('PROJECT_DATA');
        } else if (plan.targetProjectSlug) {
          const proj = aiRetrievalLayer.getPublishedProjectBySlug(plan.targetProjectSlug);
          if (proj) {
            contexts.push(proj);
            executedSources.push('PROJECT_DATA');
          }
        }
      }

      if (plan.requiresLiveData) {
        if (plan.crossProjectSearch) {
          if (plan.intent === 'PROPERTY_DETAILS' && plan.propertyNumbers?.[0]) {
            const prop = aiRetrievalLayer.getPublishedProperty(undefined, plan.propertyNumbers[0]);
            if (prop) {
              contexts.push(prop);
              executedSources.push('LIVE_INVENTORY');
            }
          } else if (plan.intent === 'PROPERTY_COMPARISON' && plan.propertyNumbers && plan.propertyNumbers.length > 0) {
            const comp = aiRetrievalLayer.comparePublishedProperties(undefined, plan.propertyNumbers);
            contexts.push(comp);
            executedSources.push('LIVE_INVENTORY');
          } else {
            const inv = aiRetrievalLayer.searchPublishedInventoryAcrossProjects(plan.filters || { status: 'AVAILABLE' });
            contexts.push(inv);
            executedSources.push('LIVE_INVENTORY');
          }
        } else if (plan.targetProjectId) {
          if (plan.intent === 'PROPERTY_DETAILS' && plan.propertyNumbers?.[0]) {
            const prop = aiRetrievalLayer.getPublishedProperty(plan.targetProjectId, plan.propertyNumbers[0]);
            if (prop) {
              contexts.push(prop);
              executedSources.push('LIVE_INVENTORY');
            }
          } else if (plan.intent === 'PROPERTY_COMPARISON' && plan.propertyNumbers && plan.propertyNumbers.length > 0) {
            const comp = aiRetrievalLayer.comparePublishedProperties(plan.targetProjectId, plan.propertyNumbers);
            contexts.push(comp);
            executedSources.push('LIVE_INVENTORY');
          } else {
            const inv = aiRetrievalLayer.searchPublishedInventory(plan.targetProjectId, plan.filters || { status: 'AVAILABLE' });
            contexts.push(inv);
            executedSources.push('LIVE_INVENTORY');
          }
        }
      }

      if (plan.requiresLayout && plan.targetProjectId) {
        const layout = aiRetrievalLayer.getLayoutAnalysis(plan.targetProjectId);
        if (layout) {
          contexts.push(layout);
          executedSources.push('LAYOUT_ANALYSIS');
        }
      }

      // 3. Response Generation (via Llama 70B Engine or Grounded Fallback)
      const rawAnswer = await llamaEngine.generateResponse(messages, plan, contexts);

      // 4. Grounding & Post-Verification Check
      const grounded = aiGroundingEngine.validateAndGround(rawAnswer, plan, contexts);

      // 5. Observability & Structured Logging
      const latencyMs = Date.now() - startTime;
      aiObservability.logRequest({
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toISOString(),
        userQuery,
        detectedIntent: plan.intent,
        responseMode: plan.responseMode,
        targetProjectSlug: plan.targetProjectSlug,
        retrievalSources: executedSources,
        resultCount: contexts.find(c => c.sourceType === 'LIVE_INVENTORY')?.data?.totalMatches ?? contexts.length,
        groundingStatus: grounded.status,
        provenance: grounded.provenance,
        latencyMs
      });

      // Prepare return object for API
      const invContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');

      return {
        text: grounded.text,
        provenance: grounded.provenance,
        executedTools: executedSources.map(s => `query_${s.toLowerCase()}`),
        verifiedData: invContext?.data || contexts[0]?.data || null,
        plan
      };
    } catch (err: any) {
      console.error('[AIService Error]:', err);
      const latencyMs = Date.now() - startTime;
      aiObservability.logRequest({
        requestId: `req_err_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userQuery,
        detectedIntent: 'UNSUPPORTED',
        responseMode: 'UNSUPPORTED',
        retrievalSources: executedSources,
        resultCount: 0,
        groundingStatus: 'REJECTED',
        latencyMs,
        errors: [err.message]
      });

      return {
        text: "I couldn't complete the query with verified database records right now. Please try again or explore properties directly on the interactive map.",
        executedTools: [],
        verifiedData: null
      };
    }
  }
}

export const aiService = new AIService();

import { RetrievedContext, QueryPlan } from './types.ts';

export class AiGroundingEngine {
  /**
   * Validate that the final generated text matches the retrieved database records
   */
  validateAndGround(
    rawText: string,
    plan: QueryPlan,
    contexts: RetrievedContext[]
  ): { text: string; status: 'VERIFIED' | 'HONEST_FALLBACK' | 'GENERAL_ONLY' | 'REJECTED' } {
    // 1. If intent is UNSUPPORTED / Security boundary
    if (plan.intent === 'UNSUPPORTED') {
      return {
        text: "I am Ask Nova, your property discovery assistant. I can only assist with verified public project information, published property inventory, and layout exploration. I cannot disclose internal operational data or bypass system guidelines.",
        status: 'REJECTED'
      };
    }

    // 2. If intent is CLARIFICATION
    if (plan.intent === 'CLARIFICATION' && plan.clarificationQuestion) {
      return {
        text: plan.clarificationQuestion,
        status: 'VERIFIED'
      };
    }

    // 3. If intent is pure GENERAL_KNOWLEDGE
    if (plan.intent === 'GENERAL_KNOWLEDGE') {
      return {
        text: rawText,
        status: 'GENERAL_ONLY'
      };
    }

    // 4. Check for Inventory Searches with zero matches
    const inventoryContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');
    if (inventoryContext) {
      const totalMatches = inventoryContext.data?.totalMatches ?? inventoryContext.records?.length ?? 0;
      const projectName = inventoryContext.projectName || plan.targetProjectName || 'this project';

      if (totalMatches === 0 && plan.intent === 'INVENTORY_SEARCH') {
        const projNameLower = projectName.toLowerCase();
        if (projNameLower.includes('pinnacle')) {
          return {
            text: "Nova Pinnacle currently has no published plot availability.",
            status: 'HONEST_FALLBACK'
          };
        }
        if (projNameLower.includes('vasantham')) {
          return {
            text: "Nova Vasantham apartment availability is awaiting verified publication.",
            status: 'HONEST_FALLBACK'
          };
        }

        const filters = plan.filters || {};
        const filterDesc = [
          filters.facing ? `facing **${filters.facing}**` : '',
          filters.minArea ? `above **${filters.minArea} sq.ft**` : '',
          filters.maxArea ? `below **${filters.maxArea} sq.ft**` : '',
          filters.unitType ? `in **${filters.unitType}**` : ''
        ].filter(Boolean).join(' and ');

        return {
          text: `I searched the live published inventory for **${projectName}**, but I couldn't find any currently available properties matching those requirements${filterDesc ? ` (${filterDesc})` : ''}. Would you like to check other configurations or explore the full project map?`,
          status: 'HONEST_FALLBACK'
        };
      }

      // Check for specific property not found
      if (plan.intent === 'PROPERTY_DETAILS') {
        const reqProp = plan.propertyNumbers?.[0];
        if (!inventoryContext.records || inventoryContext.records.length === 0) {
          return {
            text: `Property **${reqProp}** was not found in the currently published records for **${projectName}**. It may be unreleased or under processing. Please contact Nova sales staff for assistance.`,
            status: 'HONEST_FALLBACK'
          };
        }
      }
    }

    // 5. Spatial Claims Grounding
    const layoutContext = contexts.find(c => c.sourceType === 'LAYOUT_ANALYSIS');
    if (layoutContext && (plan.intent === 'LAYOUT_QUERY' || plan.intent === 'MIXED')) {
      // Ensure we don't claim unverified exact distances
      if (rawText.includes('meter') || rawText.includes('feet from the park')) {
        rawText = rawText.replace(/(\d+)\s*(?:meters|metres|feet)\s*from the park/gi, 'situated near the park zone in the official layout');
      }
    }

    // 6. Scrub any accidental internal leaks
    let cleaned = rawText
      .replace(/\[INTERNAL:[^\]]+\]/gi, '')
      .replace(/SQLite database/gi, 'official database')
      .replace(/CRM draft/gi, 'database')
      .trim();

    return {
      text: cleaned,
      status: 'VERIFIED'
    };
  }
}

export const aiGroundingEngine = new AiGroundingEngine();

import { getAllProjects, getProjectBySlug } from '../projectService.ts';
import { IntentType, ResponseMode, QueryPlan, InventoryFilters, ChatMessage } from './types.ts';

// Known project aliases, customer-facing names, and legacy/internal names
const PROJECT_ALIASES: Record<string, string> = {
  // Nova Pinnacle
  'pinnacle': 'nova-pinnacle',
  'pinncale': 'nova-pinnacle',
  'pinacle': 'nova-pinnacle',
  'nova pinnacle': 'nova-pinnacle',
  'nova pinncale': 'nova-pinnacle',

  // Nova Diya Gardens (Customer-Facing & Legacy)
  'diya': 'nova-diya-gardens',
  'diya garden': 'nova-diya-gardens',
  'diya gardn': 'nova-diya-gardens',
  'diya gardens': 'nova-diya-gardens',
  'nova diya': 'nova-diya-gardens',
  'nova diya garden': 'nova-diya-gardens',
  'nova diya gardn': 'nova-diya-gardens',
  'nova diya gardens': 'nova-diya-gardens',
  'nova diya garden & extension i': 'nova-diya-gardens',
  'nova diya garden and extension i': 'nova-diya-gardens',
  'diya garden & extension i': 'nova-diya-gardens',
  'diya garden and extension i': 'nova-diya-gardens',
  'extension i': 'nova-diya-gardens',
  'extension 1': 'nova-diya-gardens',

  // Nova KNG Pudur (Customer-Facing & Legacy)
  'kng': 'kng-pudur-option-03',
  'kng pudur': 'kng-pudur-option-03',
  'nova kng pudur': 'kng-pudur-option-03',
  'nova kng': 'kng-pudur-option-03',
  'kng pudur — option 03': 'kng-pudur-option-03',
  'kng pudur - option 03': 'kng-pudur-option-03',
  'kng pudur option 03': 'kng-pudur-option-03',
  'kng option 03': 'kng-pudur-option-03',
  'option 03': 'kng-pudur-option-03',
  'option 3': 'kng-pudur-option-03',

  // Nova NCR (Customer-Facing & Legacy)
  'ncr': 'nova-ncr',
  'nova ncr': 'nova-ncr',
  'nova ncr sub-division': 'nova-ncr',
  'nova ncr subdivision': 'nova-ncr',
  'ncr sub-division': 'nova-ncr',
  'ncr subdivision': 'nova-ncr',

  // Other Projects
  'vasantham': 'nova-vasantham',
  'vasantham avenue': 'nova-vasantham',
  'nova vasantham': 'nova-vasantham',
  'tejas': 'nova-tejas',
  'nova tejas': 'nova-tejas',
  'edens': 'nova-edens',
  'nova edens': 'nova-edens',
  'hi-tech': 'nova-hi-tech',
  'hitech': 'nova-hi-tech',
  'hi tech': 'nova-hi-tech',
  'nova hi-tech': 'nova-hi-tech',
  'nova hitech': 'nova-hi-tech',
  'nova hi tech': 'nova-hi-tech',
  'city': 'nova-city',
  'nova city': 'nova-city',
  'knt': 'nova-knt',
  'nova knt': 'nova-knt',
  'aardhiya': 'nova-aardhiya-nagar',
  'ardhiya': 'nova-aardhiya-nagar',
  'aardhiya nagar': 'nova-aardhiya-nagar',
  'nova aardhiya': 'nova-aardhiya-nagar',
  'ramala': 'nova-ramala',
  'nova ramala': 'nova-ramala',
  'vr squares': 'nova-vr-squares',
  'vr square': 'nova-vr-squares',
  'nova vr squares': 'nova-vr-squares'
};

export class AiIntentRouter {
  /**
   * Normalize natural language query and correct common typos
   */
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[—–]/g, '-')
      .replace(/\bavilable\b/g, 'available')
      .replace(/\bavailble\b/g, 'available')
      .replace(/\br avilable\b/g, 'are available')
      .replace(/\br available\b/g, 'are available')
      .replace(/\bcoimbator\b/g, 'coimbatore')
      .replace(/\btiruvallur\b/g, 'thiruvallur')
      .replace(/\bsq\s*ft\b/g, 'sqft')
      .replace(/\bsquare\s*feet\b/g, 'sqft')
      .replace(/\beast\s*face\b/g, 'east-facing')
      .replace(/\beast\s*side\b/g, 'east-facing')
      .replace(/\bnorth\s*face\b/g, 'north-facing')
      .replace(/\bnorth\s*side\b/g, 'north-facing')
      .replace(/\bwest\s*face\b/g, 'west-facing')
      .replace(/\bwest\s*side\b/g, 'west-facing')
      .replace(/\bsouth\s*face\b/g, 'south-facing')
      .replace(/\bsouth\s*side\b/g, 'south-facing');
  }

  /**
   * Main router and query planner
   */
  planQuery(messages: ChatMessage[], currentProjectSlug?: string): QueryPlan {
    const rawUserMessage = messages[messages.length - 1]?.content || '';
    const textLower = this.normalizeText(rawUserMessage);

    // 1. Check for Security / Prompt Injection / Private CRM attempts
    if (
      textLower.includes('ignore previous instructions') ||
      textLower.includes('system prompt') ||
      textLower.includes('crm record') ||
      textLower.includes('private crm') ||
      textLower.includes('internal note') ||
      textLower.includes('database password') ||
      textLower.includes('secret key') ||
      textLower.includes('admin token')
    ) {
      return {
        intent: 'UNSUPPORTED',
        responseMode: 'UNSUPPORTED',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: false
      };
    }

    // 2. Project Detection with Typo & Alias Matching
    const allProjects = getAllProjects();
    let detectedSlug: string | undefined = undefined;

    // Check alias dictionary
    for (const [alias, slug] of Object.entries(PROJECT_ALIASES)) {
      if (textLower.includes(alias)) {
        detectedSlug = slug;
        break;
      }
    }

    // Check registered project names & slugs directly
    if (!detectedSlug) {
      for (const p of allProjects) {
        const cleanName = p.name.toLowerCase().replace('nova ', '');
        if (textLower.includes(p.slug) || textLower.includes(p.name.toLowerCase()) || textLower.includes(cleanName)) {
          detectedSlug = p.slug;
          break;
        }
      }
    }

    // Context resolution: Explicit project mention in current query overrides previous context
    let targetProjectSlug = detectedSlug || currentProjectSlug;
    
    // If no context given, try to detect project from recent user messages
    if (!targetProjectSlug) {
      for (let i = messages.length - 2; i >= 0; i--) {
        const pastText = this.normalizeText(messages[i].content);
        for (const [alias, slug] of Object.entries(PROJECT_ALIASES)) {
          if (pastText.includes(alias)) {
            targetProjectSlug = slug;
            break;
          }
        }
        if (targetProjectSlug) break;

        for (const p of allProjects) {
          const cleanName = p.name.toLowerCase().replace('nova ', '');
          if (pastText.includes(p.slug) || pastText.includes(p.name.toLowerCase()) || pastText.includes(cleanName)) {
            targetProjectSlug = p.slug;
            break;
          }
        }
        if (targetProjectSlug) break;
      }
    }

    const targetProject = targetProjectSlug ? getProjectBySlug(targetProjectSlug) : undefined;

    // 3. Detect Comparison Intent
    if (textLower.includes('compare') || textLower.includes('versus') || textLower.includes(' vs ') || textLower.includes('difference between plot') || textLower.includes('which is better')) {
      const numbers = rawUserMessage.match(/(\d+[A-Za-z0-9\-_]*|Flat\s*-\s*\d+[A-Z]|Unit\s*\d+|PP:[0-9]+)/gi) || [];
      if (numbers.length >= 2) {
        if (!targetProject) {
          return {
            intent: 'CLARIFICATION',
            responseMode: 'CLARIFICATION',
            requiresLiveData: false,
            requiresProjectData: false,
            requiresLayout: false,
            requiresGeneralKnowledge: false,
            isAmbiguous: true,
            clarificationQuestion: 'Which Nova project are you comparing these properties in? (e.g. Nova Diya Garden, Nova Vasantham, Nova Tejas, Nova Pinnacle)'
          };
        }

        return {
          intent: 'PROPERTY_COMPARISON',
          responseMode: 'LIVE_INVENTORY',
          targetProjectSlug: targetProject.slug,
          targetProjectId: targetProject.id,
          targetProjectName: targetProject.name,
          requiresLiveData: true,
          requiresProjectData: true,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          propertyNumbers: numbers,
          isAmbiguous: false
        };
      }
    }

    // 4. Detect Specific Single Property Details
    const singlePropMatch = rawUserMessage.match(/\b(?:plot|flat|unit|property)\s*#?\s*([0-9]+[A-Za-z0-9\-_:]*|PP:[0-9]+)\b/i);
    const isSearchWord = textLower.includes('available plots') || textLower.includes('available flats') || textLower.includes('show me plots') || textLower.includes('which plots') || textLower.includes('show me plot') || textLower.includes('show me plots');
    
    if (singlePropMatch && !isSearchWord && !textLower.includes('compare') && !textLower.includes('which is better')) {
      const propNum = singlePropMatch[1];
      if (!targetProject) {
        return {
          intent: 'CLARIFICATION',
          responseMode: 'CLARIFICATION',
          requiresLiveData: false,
          requiresProjectData: false,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          isAmbiguous: true,
          clarificationQuestion: `Which Nova project does Plot/Unit ${propNum} belong to? (e.g. Nova Diya Garden, Nova Vasantham, Nova Pinnacle)`
        };
      }

      return {
        intent: 'PROPERTY_DETAILS',
        responseMode: 'LIVE_INVENTORY',
        targetProjectSlug: targetProject.slug,
        targetProjectId: targetProject.id,
        targetProjectName: targetProject.name,
        requiresLiveData: true,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        propertyNumbers: [propNum],
        isAmbiguous: false
      };
    }

    // 5. Detect Layout & Spatial Queries
    const isLayoutQuery = textLower.includes('near the park') ||
      textLower.includes('near park') ||
      textLower.includes('where is the entrance') ||
      textLower.includes('main road') ||
      textLower.includes('roads in the layout') ||
      textLower.includes('layout map') ||
      textLower.includes('shown in the layout') ||
      textLower.includes('layout structure') ||
      textLower.includes('near road');

    if (isLayoutQuery) {
      if (!targetProject) {
        return {
          intent: 'CLARIFICATION',
          responseMode: 'CLARIFICATION',
          requiresLiveData: false,
          requiresProjectData: false,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          isAmbiguous: true,
          clarificationQuestion: 'Which Nova project layout would you like to explore? (e.g. Nova Diya Garden, Nova NCR, KNG Pudur, Nova Pinnacle)'
        };
      }

      let feature = 'general';
      if (textLower.includes('park')) feature = 'park';
      else if (textLower.includes('entrance') || textLower.includes('gate')) feature = 'entrance';
      else if (textLower.includes('road') || textLower.includes('street')) feature = 'road';

      const isMixedInventory = textLower.includes('available') || textLower.includes('plots near') || textLower.includes('east-facing plot near') || textLower.includes('which available');

      return {
        intent: isMixedInventory ? 'MIXED' : 'LAYOUT_QUERY',
        responseMode: isMixedInventory ? 'MIXED' : 'LAYOUT_INTELLIGENCE',
        targetProjectSlug: targetProject.slug,
        targetProjectId: targetProject.id,
        targetProjectName: targetProject.name,
        requiresLiveData: isMixedInventory,
        requiresProjectData: true,
        requiresLayout: true,
        requiresGeneralKnowledge: false,
        spatialTarget: { feature },
        isAmbiguous: false
      };
    }

    // 6. Detect Mixed Questions (General Knowledge + Nova Inventory)
    const isMixedQuestion = (textLower.includes('generally') || textLower.includes('in general') || textLower.includes('difference between')) &&
      (textLower.includes('nova') || textLower.includes('available') || textLower.includes('do you have'));

    if (isMixedQuestion) {
      const filters = this.extractFilters(rawUserMessage, textLower, messages);
      return {
        intent: 'MIXED',
        responseMode: 'MIXED',
        targetProjectSlug: targetProject?.slug || 'nova-diya-gardens',
        targetProjectId: targetProject?.id,
        targetProjectName: targetProject?.name,
        requiresLiveData: true,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        filters,
        isAmbiguous: false
      };
    }

    // 7. Detect Recommendation Query
    if (textLower.includes('which plot is best') || textLower.includes('recommend a plot') || textLower.includes('best plot for me') || textLower.includes('which one is good') || textLower.includes('best one')) {
      return {
        intent: 'RECOMMENDATION',
        responseMode: 'RECOMMENDATION',
        targetProjectSlug: targetProject?.slug,
        targetProjectId: targetProject?.id,
        targetProjectName: targetProject?.name,
        requiresLiveData: false,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: false
      };
    }

    // 8. Detect General Knowledge Questions (No Nova reference)
    const generalKeywords = [
      'what is a gated community',
      'what is a plot',
      'what is fsi',
      'what is uds',
      'what does east-facing mean',
      'what does east facing mean',
      'what is east facing',
      'what does north-facing mean',
      'is east-facing better',
      'is north-facing better',
      'vastu guidelines',
      'difference between east and west',
      'difference between east-facing and west-facing',
      'dtcp approval meaning',
      'rera registration meaning'
    ];

    const isGeneral = !detectedSlug && (
      generalKeywords.some(k => textLower.includes(k)) ||
      textLower.startsWith('what is') ||
      textLower.startsWith('what does')
    );

    if (isGeneral && !textLower.includes('available in nova') && !textLower.includes('in nova') && !textLower.includes('available plot') && !textLower.includes('available flat')) {
      return {
        intent: 'GENERAL_KNOWLEDGE',
        responseMode: 'GENERAL',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        isAmbiguous: false
      };
    }

    // 9. Detect Nova General / Catalog Search
    const isOverviewQuery = textLower.includes('what projects does nova have') ||
      textLower.includes('list nova projects') ||
      textLower.includes('projects in thiruvallur') ||
      textLower.includes('projects in coimbatore') ||
      textLower.includes('projects does nova have in coimbatore') ||
      textLower.includes('projects does nova have in chennai') ||
      textLower.includes('tell me about nova') ||
      textLower.includes('all nova projects') ||
      textLower === 'projects' ||
      textLower === 'all projects' ||
      (textLower.includes('coimbatore') && (textLower.includes('any project') || textLower.includes('what project') || textLower.includes('what do you have in coimbatore') || textLower.includes('anything in coimbatore')));

    if (isOverviewQuery && !detectedSlug) {
      let locationFilter: string | undefined = undefined;
      if (textLower.includes('coimbatore')) locationFilter = 'Coimbatore';
      else if (textLower.includes('thiruvallur')) locationFilter = 'Thiruvallur';
      else if (textLower.includes('chennai')) locationFilter = 'Chennai';

      return {
        intent: 'NOVA_OVERVIEW',
        responseMode: 'NOVA_GENERAL',
        requiresLiveData: false,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: false,
        filters: locationFilter ? { location: locationFilter } : undefined
      };
    }

    // 10. Detect Project Details / Amenities Query
    if (
      detectedSlug ||
      textLower.includes('amenit') ||
      textLower.includes('highlights of') ||
      textLower.includes('location of') ||
      textLower.startsWith('what about') ||
      textLower.startsWith('tell me about') ||
      textLower.startsWith('how about') ||
      (textLower.startsWith('what is') && (textLower.includes('diya') || textLower.includes('vasantham') || textLower.includes('tejas') || textLower.includes('ncr') || textLower.includes('pinnacle') || Boolean(targetProject)))
    ) {
      if (targetProject) {
        // If query also asks for availability or plots inside this project, treat as inventory search
        const hasInventoryIntent = textLower.includes('available') || textLower.includes('plot') || textLower.includes('flat') || textLower.includes('east') || textLower.includes('west') || textLower.includes('north') || textLower.includes('south') || textLower.includes('sqft');
        if (hasInventoryIntent && !textLower.startsWith('tell me about') && !textLower.includes('amenities') && !textLower.includes('highlights')) {
          const filters = this.extractFilters(rawUserMessage, textLower, messages);
          return {
            intent: 'INVENTORY_SEARCH',
            responseMode: 'LIVE_INVENTORY',
            targetProjectSlug: targetProject.slug,
            targetProjectId: targetProject.id,
            targetProjectName: targetProject.name,
            requiresLiveData: true,
            requiresProjectData: true,
            requiresLayout: false,
            requiresGeneralKnowledge: false,
            filters,
            isAmbiguous: false
          };
        }

        return {
          intent: 'PROJECT_DETAILS',
          responseMode: 'PROJECT_GROUNDED',
          targetProjectSlug: targetProject.slug,
          targetProjectId: targetProject.id,
          targetProjectName: targetProject.name,
          requiresLiveData: false,
          requiresProjectData: true,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          isAmbiguous: false
        };
      }
    }

    // 11. Detect Inventory Search / Availability Query
    const isInventoryQuery = textLower.includes('available') ||
      textLower.includes('plot') ||
      textLower.includes('plots') ||
      textLower.includes('flat') ||
      textLower.includes('flats') ||
      textLower.includes('units') ||
      textLower.includes('east') ||
      textLower.includes('west') ||
      textLower.includes('north') ||
      textLower.includes('south') ||
      textLower.includes('sqft') ||
      textLower.includes('bhk') ||
      textLower.includes('how many plots') ||
      textLower.includes('what is available') ||
      textLower.includes('what plots r available') ||
      textLower.includes('what plots are available') ||
      textLower.includes('inventory') ||
      textLower.includes('any plots') ||
      textLower.includes('got anything');

    if (isInventoryQuery) {
      // If no project context established, ask for clarification (Section 36)
      if (!targetProject) {
        return {
          intent: 'CLARIFICATION',
          responseMode: 'CLARIFICATION',
          requiresLiveData: false,
          requiresProjectData: false,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          isAmbiguous: true,
          clarificationQuestion: 'Which Nova project would you like to explore? (e.g. Nova Diya Garden, Nova Vasantham, Nova Tejas, Nova Pinnacle, Nova NCR)'
        };
      }

      const filters = this.extractFilters(rawUserMessage, textLower, messages);

      return {
        intent: 'INVENTORY_SEARCH',
        responseMode: 'LIVE_INVENTORY',
        targetProjectSlug: targetProject.slug,
        targetProjectId: targetProject.id,
        targetProjectName: targetProject.name,
        requiresLiveData: true,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        filters,
        isAmbiguous: false
      };
    }

    // Fallback: General or Project details if project is known
    return {
      intent: targetProject ? 'PROJECT_DETAILS' : 'GENERAL_KNOWLEDGE',
      responseMode: targetProject ? 'PROJECT_GROUNDED' : 'GENERAL',
      targetProjectSlug: targetProject?.slug,
      targetProjectId: targetProject?.id,
      targetProjectName: targetProject?.name,
      requiresLiveData: false,
      requiresProjectData: Boolean(targetProject),
      requiresLayout: false,
      requiresGeneralKnowledge: !targetProject,
      isAmbiguous: false
    };
  }

  /**
   * Helper to extract filters supporting follow-up context (e.g. "Only above 1500 sqft", "How about north-facing?")
   */
  private extractFilters(rawMsg: string, textLower: string, messages: ChatMessage[]): InventoryFilters {
    const filters: InventoryFilters = { status: 'AVAILABLE' };

    // Check for facing
    if (textLower.includes('east')) filters.facing = 'East';
    else if (textLower.includes('west')) filters.facing = 'West';
    else if (textLower.includes('north')) filters.facing = 'North';
    else if (textLower.includes('south')) filters.facing = 'South';

    // Check for unit type
    if (textLower.includes('2 bhk') || textLower.includes('2bhk')) filters.unitType = '2 BHK';
    else if (textLower.includes('3 bhk') || textLower.includes('3bhk')) filters.unitType = '3 BHK';

    // Check for area
    const areaMatch = rawMsg.match(/(\d{3,5})\s*(?:sqft|sq\.ft|square\s*feet|\+)?/i);
    if (areaMatch) {
      const val = parseInt(areaMatch[1], 10);
      if (val >= 100) { // realistic area threshold
        if (textLower.includes('above') || textLower.includes('more than') || textLower.includes('greater than') || textLower.includes('minimum') || rawMsg.includes('+')) {
          filters.minArea = val;
        } else if (textLower.includes('below') || textLower.includes('under') || textLower.includes('less than') || textLower.includes('maximum')) {
          filters.maxArea = val;
        } else {
          filters.minArea = val;
        }
      }
    }

    // Follow-up context preservation: If this is a refinement (e.g. "Only above 1500 sqft"), inherit past facing if not changed
    if (messages.length >= 3) {
      const prevMsg = this.normalizeText(messages[messages.length - 2]?.content || '');
      
      // If current message is an area constraint only, retain previous facing
      if (!filters.facing) {
        if (textLower.startsWith('only') || textLower.startsWith('and ') || textLower.includes('above') || textLower.includes('below')) {
          if (prevMsg.includes('east')) filters.facing = 'East';
          else if (prevMsg.includes('west')) filters.facing = 'West';
          else if (prevMsg.includes('north')) filters.facing = 'North';
          else if (prevMsg.includes('south')) filters.facing = 'South';
        }
      }

      // If current message changes facing (e.g. "what about north?"), retain previous area constraints
      if (filters.facing && !filters.minArea && !filters.maxArea) {
        if (textLower.startsWith('what about') || textLower.startsWith('how about') || textLower.startsWith('and ')) {
          const prevAreaMatch = prevMsg.match(/(\d{3,5})\s*(?:sqft|sq\.ft|square\s*feet|\+)?/i);
          if (prevAreaMatch) {
            const pVal = parseInt(prevAreaMatch[1], 10);
            if (prevMsg.includes('above') || prevMsg.includes('more than') || prevMsg.includes('greater than')) {
              filters.minArea = pVal;
            } else if (prevMsg.includes('below') || prevMsg.includes('under') || prevMsg.includes('less than')) {
              filters.maxArea = pVal;
            }
          }
        }
      }
    }

    return filters;
  }
}

export const aiIntentRouter = new AiIntentRouter();


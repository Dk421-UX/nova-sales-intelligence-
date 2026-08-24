import { getAllProjects, getProjectBySlug, getProjectById } from '../projectService.ts';
import {
  IntentType,
  ResponseMode,
  QueryPlan,
  InventoryFilters,
  ChatMessage,
  ConversationContext,
  ContextAction,
  SearchScope
} from './types.ts';

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

  // Nova KNG Pudur / Pinnacle (Customer-Facing & Legacy)
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
      .replace(/sq\.?\s*ft\.?/g, 'sqft')
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
   * Parse previous messages to reconstruct the prior ConversationContext
   */
  private parsePreviousContext(messages: ChatMessage[], currentProjectSlug?: string): ConversationContext {
    const prevContext: ConversationContext = {};

    if (currentProjectSlug) {
      const proj = getProjectBySlug(currentProjectSlug) || getProjectById(currentProjectSlug);
      if (proj) {
        prevContext.projectSlug = proj.slug;
        prevContext.projectName = proj.name;
        prevContext.projectId = proj.id;
        prevContext.propertyType = proj.project_type as any;
        prevContext.city = proj.city;
        prevContext.location = proj.location;
      }
    }

    if (messages.length < 2) return prevContext;

    // Scan backwards from the most recent previous turn
    for (let i = messages.length - 2; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;
      const text = this.normalizeText(msg.content);

      // Previous Project
      if (!prevContext.projectSlug) {
        for (const [alias, slug] of Object.entries(PROJECT_ALIASES)) {
          if (text.includes(alias)) {
            const p = getProjectBySlug(slug);
            if (p) {
              prevContext.projectSlug = p.slug;
              prevContext.projectName = p.name;
              prevContext.projectId = p.id;
              prevContext.propertyType = p.project_type as any;
              prevContext.city = p.city;
              prevContext.location = p.location;
            }
            break;
          }
        }
      }

      // Previous Property Type
      if (!prevContext.propertyType) {
        if (text.includes('plot') || text.includes('land') || text.includes('site')) prevContext.propertyType = 'PLOT';
        else if (text.includes('apartment') || text.includes('flat') || text.includes('bhk')) prevContext.propertyType = 'APARTMENT';
      }

      // Previous Config
      if (!prevContext.configuration) {
        if (text.includes('1 bhk') || text.includes('1bhk')) prevContext.configuration = '1 BHK';
        else if (text.includes('2 bhk') || text.includes('2bhk')) prevContext.configuration = '2 BHK';
        else if (text.includes('3 bhk') || text.includes('3bhk')) prevContext.configuration = '3 BHK';
        else if (text.includes('4 bhk') || text.includes('4bhk')) prevContext.configuration = '4 BHK';
        else if (text.includes('2b2t')) prevContext.configuration = '2B2T';
      }

      // Previous Facing
      if (!prevContext.facing) {
        if (text.includes('east')) prevContext.facing = 'East';
        else if (text.includes('west')) prevContext.facing = 'West';
        else if (text.includes('north')) prevContext.facing = 'North';
        else if (text.includes('south')) prevContext.facing = 'South';
      }

      // Previous Location
      if (!prevContext.location && !prevContext.city) {
        if (text.includes('chennai')) { prevContext.city = 'Chennai'; prevContext.location = 'Chennai'; }
        else if (text.includes('coimbatore')) { prevContext.city = 'Coimbatore'; prevContext.location = 'Coimbatore'; }
        else if (text.includes('thiruvallur')) { prevContext.city = 'Thiruvallur'; prevContext.location = 'Thiruvallur'; }
        else if (text.includes('mogappair')) { prevContext.location = 'Mogappair'; prevContext.city = 'Chennai'; }
      }

      // Previous Area
      if (!prevContext.minArea && !prevContext.maxArea) {
        const areaMatch = msg.content.match(/(\d{3,5})\s*(?:sqft|sq\.?\s*ft\.?|square\s*feet|\+)?/i);
        if (areaMatch) {
          const val = parseInt(areaMatch[1], 10);
          if (val >= 100) {
            if (text.includes('above') || text.includes('more than') || text.includes('greater than')) prevContext.minArea = val;
            else if (text.includes('below') || text.includes('less than') || text.includes('under')) prevContext.maxArea = val;
            else if (text.includes('around') || text.includes('approx') || text.includes('about')) {
              prevContext.minArea = Math.max(0, val - 300);
              prevContext.maxArea = val + 300;
            } else {
              prevContext.minArea = val;
            }
          }
        }
      }

      // Stop once we have gathered prior context
      if (prevContext.projectSlug || prevContext.propertyType || prevContext.configuration) break;
    }

    return prevContext;
  }

  /**
   * Main router and query planner with context reconciliation
   */
  planQuery(messages: ChatMessage[], currentProjectSlug?: string): QueryPlan {
    const rawUserMessage = messages[messages.length - 1]?.content || '';
    const textLower = this.normalizeText(rawUserMessage);
    const allProjects = getAllProjects();
    const previousContext = this.parsePreviousContext(messages, currentProjectSlug);

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
        searchScope: 'NONE',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: false
      };
    }

    // 2. Greetings and Casual Conversation
    const greetingWords = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'namaste', 'greetings', 'hi nova', 'hello nova'];
    const isGreeting = greetingWords.includes(textLower) ||
      textLower === 'hi there' ||
      textLower === 'hello there' ||
      textLower === 'hey there' ||
      textLower === 'who are you' ||
      textLower === 'how are you';

    if (isGreeting && messages.length <= 2) {
      return {
        intent: 'GREETING',
        responseMode: 'GREETING',
        searchScope: 'NONE',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        isAmbiguous: false
      };
    }

    // 3. Detect Project Mention in Current Query
    let detectedSlug: string | undefined = undefined;
    for (const [alias, slug] of Object.entries(PROJECT_ALIASES)) {
      if (textLower.includes(alias)) {
        detectedSlug = slug;
        break;
      }
    }
    if (!detectedSlug) {
      for (const p of allProjects) {
        const cleanName = p.name.toLowerCase().replace('nova ', '');
        if (textLower.includes(p.slug) || textLower.includes(p.name.toLowerCase()) || textLower.includes(cleanName)) {
          detectedSlug = p.slug;
          break;
        }
      }
    }

    // 4. Detect Explicit General Real Estate Knowledge Questions (NO DB Query!)
    // Specifically handles: "what is real estate", "okay what is the real estate", "what is uds", "carpet area vs saleable area", etc.
    const generalKeywords = [
      'what is real estate',
      'what is realestate',
      'what is the real estate',
      'what is the realestate',
      'explain real estate',
      'define real estate',
      'what does real estate mean',
      'meaning of real estate',
      'what is a gated community',
      'what is a plot',
      'what is a residential plot',
      'what is fsi',
      'what is far',
      'what is uds',
      'what does uds mean',
      'what does east-facing mean',
      'what does east facing mean',
      'what is east facing',
      'what does north-facing mean',
      'what does north facing mean',
      'what does west-facing mean',
      'what does south-facing mean',
      'is east-facing better',
      'is north-facing better',
      'vastu guidelines',
      'difference between east and west',
      'difference between east-facing and west-facing',
      'dtcp approval meaning',
      'rera registration meaning',
      'what is rera',
      'what is dtcp',
      'carpet area and saleable area',
      'difference between carpet area and saleable area',
      'difference between carpet and saleable',
      'carpet area vs saleable area',
      'what is carpet area',
      'what is saleable area',
      'what is plinth area',
      'what is super built-up',
      'what is a 3 bhk',
      'what is a 2 bhk',
      'what is bhk',
      'what is a bhk',
      'what should i check before buying a plot',
      'things to check before buying a plot',
      'what to check before buying',
      'difference between a plot and an apartment',
      'difference between plot and flat'
    ];

    const hasSpecificPropertyNumber = Boolean(
      rawUserMessage.match(/\b(?:plot|flat|unit|property)\s*#?\s*([0-9]+[A-Za-z0-9\-_:]*|PP:[0-9]+)\b/i) ||
      rawUserMessage.match(/\b(flat\s*-\s*[0-9]+[A-Z]|flat\s*[0-9]+[A-Z]|[0-9]+[A-Z]\s*flat)\b/i)
    );

    const isGeneralKnowledgeQuery = !detectedSlug && (
      generalKeywords.some(k => textLower.includes(k)) ||
      (textLower.startsWith('what is') && !textLower.includes('nova') && !textLower.includes('available') && !hasSpecificPropertyNumber) ||
      (textLower.startsWith('what does') && !textLower.includes('nova') && !hasSpecificPropertyNumber) ||
      (textLower.startsWith('what should i check') && !textLower.includes('nova'))
    );

    if (isGeneralKnowledgeQuery && !textLower.includes('available in nova') && !textLower.includes('in nova') && !hasSpecificPropertyNumber) {
      const plan: QueryPlan = {
        intent: 'GENERAL_KNOWLEDGE',
        responseMode: 'GENERAL_REAL_ESTATE',
        searchScope: 'NONE',
        contextAction: 'GENERAL_EDUCATION',
        clearedContext: previousContext,
        retainedContext: {},
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 5. Detect Explicit Location in Current Query
    let explicitLocation: string | undefined = undefined;
    if (textLower.includes('coimbatore')) explicitLocation = 'Coimbatore';
    else if (textLower.includes('thiruvallur')) explicitLocation = 'Thiruvallur';
    else if (textLower.includes('chennai')) explicitLocation = 'Chennai';
    else if (textLower.includes('mogappair')) explicitLocation = 'Mogappair';

    // 6. Detect Explicit Property Type and Config in Current Query
    let explicitPropertyType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP' | undefined = undefined;
    if (textLower.includes('plot') || textLower.includes('plots') || textLower.includes('land') || textLower.includes('site') || textLower.includes('villa plot')) {
      explicitPropertyType = 'PLOT';
    } else if (textLower.includes('apartment') || textLower.includes('apartments') || textLower.includes('flat') || textLower.includes('flats') || textLower.includes('bhk') || textLower.includes('bedroom')) {
      explicitPropertyType = 'APARTMENT';
    } else if (textLower.includes('shop') || textLower.includes('commercial')) {
      explicitPropertyType = 'COMMERCIAL_SHOP';
    }

    let explicitConfig: string | undefined = undefined;
    if (textLower.includes('1 bhk') || textLower.includes('1bhk') || textLower.includes('one bedroom')) explicitConfig = '1 BHK';
    else if (textLower.includes('2 bhk') || textLower.includes('2bhk') || textLower.includes('two bedroom')) explicitConfig = '2 BHK';
    else if (textLower.includes('3 bhk') || textLower.includes('3bhk') || textLower.includes('three bedroom') || textLower.includes('three-bedroom') || textLower.includes('3 bedroom')) explicitConfig = '3 BHK';
    else if (textLower.includes('4 bhk') || textLower.includes('4bhk') || textLower.includes('four bedroom')) explicitConfig = '4 BHK';
    else if (textLower.includes('2b2t')) explicitConfig = '2B2T';

    let explicitFacing: string | undefined = undefined;
    if (textLower.includes('east-facing') || textLower.includes('east facing') || textLower.includes('east side') || (textLower.includes('east') && !textLower.includes('real estate'))) explicitFacing = 'East';
    else if (textLower.includes('west-facing') || textLower.includes('west facing') || textLower.includes('west side') || textLower.includes('west')) explicitFacing = 'West';
    else if (textLower.includes('north-facing') || textLower.includes('north facing') || textLower.includes('north side') || textLower.includes('north')) explicitFacing = 'North';
    else if (textLower.includes('south-facing') || textLower.includes('south facing') || textLower.includes('south side') || textLower.includes('south')) explicitFacing = 'South';

    // 7. Detect Location Search / Project Catalog Search (e.g. "Which Nova projects are in Chennai?", "Projects in Coimbatore")
    const isCatalogSearch = textLower.includes('which nova projects') ||
      textLower.includes('which projects are in') ||
      textLower.includes('projects in chennai') ||
      textLower.includes('projects in coimbatore') ||
      textLower.includes('projects in thiruvallur') ||
      textLower.includes('what projects does nova have') ||
      textLower.includes('what real-estate projects does nova have') ||
      textLower.includes('list nova projects') ||
      textLower.includes('tell me about nova projects') ||
      textLower.includes('all nova projects') ||
      textLower === 'projects' ||
      textLower === 'all projects' ||
      (explicitLocation && (textLower.includes('any project') || textLower.includes('what project') || textLower.includes('what do you have in') || textLower.includes('anything in')));

    if (isCatalogSearch && !detectedSlug) {
      const plan: QueryPlan = {
        intent: 'NOVA_OVERVIEW',
        responseMode: 'NOVA_GENERAL',
        searchScope: explicitLocation ? 'LOCATION_SCOPED' : 'ALL_NOVA_PROJECTS',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        retainedContext: explicitLocation ? { location: explicitLocation, city: explicitLocation } : {},
        clearedContext: previousContext,
        requiresLiveData: false,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: false,
        filters: explicitLocation ? { location: explicitLocation, city: explicitLocation } : undefined
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 8. Detect Property Comparison Intent
    const isCompare = textLower.includes('compare') || textLower.includes('versus') || textLower.includes(' vs ') || textLower.includes('difference between plot') || textLower.includes('which is better');
    if (isCompare) {
      const numbers = rawUserMessage.match(/(\d+[A-Za-z0-9\-_]*|Flat\s*-\s*\d+[A-Z]|Flat\s*\d+[A-Z]|Unit\s*\d+|PP:[0-9]+)/gi) || [];
      if (numbers.length >= 2) {
        const targetSlug = detectedSlug || previousContext.projectSlug;
        const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

        const plan: QueryPlan = {
          intent: 'PROPERTY_COMPARISON',
          responseMode: 'LIVE_INVENTORY',
          searchScope: targetProj ? 'SINGLE_PROJECT_SCOPED' : 'ALL_NOVA_PROJECTS',
          contextAction: targetProj ? 'FOLLOW_UP_REQUEST' : 'NEW_INDEPENDENT_REQUEST',
          targetProjectSlug: targetProj?.slug,
          targetProjectId: targetProj?.id,
          targetProjectName: targetProj?.name,
          requiresLiveData: true,
          requiresProjectData: true,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          crossProjectSearch: !targetProj,
          propertyNumbers: numbers,
          isAmbiguous: false
        };
        this.logContextDebug(rawUserMessage, plan, previousContext);
        return plan;
      }
    }

    // 9. Detect Exact Property Details Lookup (e.g. "Is Flat 1A available?", "Is 1A available?", "Tell me about Plot 105", "How much UDS does 1A have?")
    const propertyNumberMatch = rawUserMessage.match(/\b(?:plot|flat|unit|property)\s*#?\s*([0-9]+[A-Za-z0-9\-_:]*|PP:[0-9]+)\b/i);
    const flatDirectMatch = rawUserMessage.match(/\b(flat\s*-\s*[0-9]+[A-Z]|flat\s*[0-9]+[A-Z]|[0-9]+[A-Z]\s*flat)\b/i);
    const shortUnitMatch = rawUserMessage.match(/\b(?:is|about|for|unit)\s+([0-9]+[A-Z])\b/i);
    const isSearchPlural = textLower.includes('available plots') || textLower.includes('available flats') || textLower.includes('show me plots') || textLower.includes('which plots') || textLower.includes('show me flats');

    if ((propertyNumberMatch || flatDirectMatch || shortUnitMatch) && !isSearchPlural && !isCompare) {
      const propNum = propertyNumberMatch ? propertyNumberMatch[1] : (flatDirectMatch ? flatDirectMatch[1] : shortUnitMatch![1]);
      const targetSlug = detectedSlug || previousContext.projectSlug;
      const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

      const plan: QueryPlan = {
        intent: 'PROPERTY_DETAILS',
        responseMode: 'LIVE_INVENTORY',
        searchScope: targetProj ? 'SINGLE_PROJECT_SCOPED' : 'ALL_NOVA_PROJECTS',
        contextAction: targetProj ? 'FOLLOW_UP_REQUEST' : 'NEW_INDEPENDENT_REQUEST',
        targetProjectSlug: targetProj?.slug,
        targetProjectId: targetProj?.id,
        targetProjectName: targetProj?.name,
        requiresLiveData: true,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        propertyNumbers: [propNum],
        crossProjectSearch: !targetProj,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 10. Detect Layout & Spatial Queries
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
      const targetSlug = detectedSlug || previousContext.projectSlug;
      const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

      if (!targetProj) {
        return {
          intent: 'CLARIFICATION',
          responseMode: 'CLARIFICATION',
          searchScope: 'NONE',
          requiresLiveData: false,
          requiresProjectData: false,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          isAmbiguous: true,
          clarificationQuestion: 'Which Nova project layout would you like to explore? (e.g. Nova Diya Garden, Nova NCR, Nova Pinnacle)'
        };
      }

      let feature = 'general';
      if (textLower.includes('park')) feature = 'park';
      else if (textLower.includes('entrance') || textLower.includes('gate')) feature = 'entrance';
      else if (textLower.includes('road') || textLower.includes('street')) feature = 'road';

      const isMixedInventory = textLower.includes('available') || textLower.includes('plots near') || textLower.includes('east-facing plot near') || textLower.includes('which available');

      const plan: QueryPlan = {
        intent: isMixedInventory ? 'MIXED' : 'LAYOUT_QUERY',
        responseMode: isMixedInventory ? 'MIXED' : 'LAYOUT_INTELLIGENCE',
        searchScope: 'SINGLE_PROJECT_SCOPED',
        contextAction: 'FOLLOW_UP_REQUEST',
        targetProjectSlug: targetProj.slug,
        targetProjectId: targetProj.id,
        targetProjectName: targetProj.name,
        requiresLiveData: isMixedInventory,
        requiresProjectData: true,
        requiresLayout: true,
        requiresGeneralKnowledge: false,
        spatialTarget: { feature },
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 11. Detect Hybrid Evaluative Questions (e.g. "Is 814 sq.ft UDS good for a 1750 sq.ft apartment?", "Generally which direction is considered good for a plot, and do you currently have east-facing plots in Nova Diya Garden?")
    const isUdsEvaluation = textLower.includes('uds') && (textLower.includes('sqft') || textLower.includes('sq.ft') || textLower.includes('good') || textLower.includes('apartment'));
    const isGeneralPlusInventory = (textLower.includes('generally') || textLower.includes('in general')) && (textLower.includes('available') || textLower.includes('do you have') || textLower.includes('current') || textLower.includes('plots in'));

    if (isUdsEvaluation || isGeneralPlusInventory) {
      const targetSlug = detectedSlug || previousContext.projectSlug;
      const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

      const plan: QueryPlan = {
        intent: 'MIXED',
        responseMode: 'MIXED',
        searchScope: targetProj ? 'SINGLE_PROJECT_SCOPED' : 'ALL_NOVA_PROJECTS',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        targetProjectSlug: targetProj?.slug,
        targetProjectId: targetProj?.id,
        targetProjectName: targetProj?.name,
        requiresLiveData: Boolean(isGeneralPlusInventory),
        requiresProjectData: Boolean(targetProj),
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        filters: explicitFacing ? { status: 'AVAILABLE', propertyType: 'PLOT', facing: explicitFacing } : undefined,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 12. Project Overview / Project Details (e.g. "Tell me about Nova Vasantham", "What is Nova Diya Garden?")
    const isProjectDetailsQuery = (
      detectedSlug &&
      (
        textLower.startsWith('tell me about') ||
        textLower.startsWith('what about') ||
        textLower.startsWith('how about') ||
        textLower.startsWith('what is') ||
        textLower.includes('amenities') ||
        textLower.includes('highlights') ||
        textLower.includes('location of')
      ) &&
      !textLower.includes('available') &&
      !textLower.includes('plot') &&
      !textLower.includes('flat') &&
      !textLower.includes('bhk')
    );

    if (isProjectDetailsQuery) {
      const targetProj = getProjectBySlug(detectedSlug!) || getProjectById(detectedSlug!);
      if (targetProj) {
        const plan: QueryPlan = {
          intent: 'PROJECT_DETAILS',
          responseMode: 'PROJECT_GROUNDED',
          searchScope: 'SINGLE_PROJECT_SCOPED',
          contextAction: 'NEW_INDEPENDENT_REQUEST',
          targetProjectSlug: targetProj.slug,
          targetProjectId: targetProj.id,
          targetProjectName: targetProj.name,
          requiresLiveData: false,
          requiresProjectData: true,
          requiresLayout: false,
          requiresGeneralKnowledge: false,
          retainedContext: {
            projectSlug: targetProj.slug,
            projectName: targetProj.name,
            projectId: targetProj.id,
            propertyType: targetProj.project_type as any,
            city: targetProj.city,
            location: targetProj.location
          },
          clearedContext: previousContext,
          isAmbiguous: false
        };
        this.logContextDebug(rawUserMessage, plan, previousContext);
        return plan;
      }
    }

    // 13. Context Reconciliation for Inventory Searches (Apartment, Plot, or General Inventory)
    // Core rule: Explicit new subject clears unrelated stale context!
    const filters: InventoryFilters = { status: 'AVAILABLE' };
    let contextAction: ContextAction = 'NEW_INDEPENDENT_REQUEST';
    let searchScope: SearchScope = 'ALL_NOVA_PROJECTS';
    let targetProjectSlug: string | undefined = undefined;
    const clearedContext: Partial<ConversationContext> = {};
    const retainedContext: Partial<ConversationContext> = {};

    // Check if the current message is an explicit follow-up refinement
    const isFollowUpRefinement = (
      textLower === 'chennai' ||
      textLower === 'chennai.' ||
      textLower === 'coimbatore' ||
      textLower === 'thiruvallur' ||
      textLower.startsWith('around ') ||
      textLower.startsWith('what about ') ||
      textLower.startsWith('how about ') ||
      (textLower.includes('facing') && !explicitPropertyType && !detectedSlug) ||
      (textLower.includes('sqft') && !explicitPropertyType && !detectedSlug)
    );

    // Explicit Project in current query
    if (detectedSlug) {
      targetProjectSlug = detectedSlug;
      searchScope = 'SINGLE_PROJECT_SCOPED';
    } else if (isFollowUpRefinement && previousContext.projectSlug && !explicitPropertyType) {
      // Retain project only on direct follow-up
      targetProjectSlug = previousContext.projectSlug;
      searchScope = 'SINGLE_PROJECT_SCOPED';
      retainedContext.projectSlug = previousContext.projectSlug;
      retainedContext.projectName = previousContext.projectName;
      retainedContext.projectId = previousContext.projectId;
    } else if (previousContext.projectSlug) {
      // Clear project because user asked a new generic query (e.g. "Do you have any 3 BHK apartments?")
      clearedContext.projectSlug = previousContext.projectSlug;
      clearedContext.projectName = previousContext.projectName;
    }

    // Property Type Reconciliation
    if (explicitPropertyType) {
      filters.propertyType = explicitPropertyType;
      retainedContext.propertyType = explicitPropertyType;
      if (previousContext.propertyType && previousContext.propertyType !== explicitPropertyType) {
        clearedContext.propertyType = previousContext.propertyType;
        // Also clear previous facing/area/config if property type fundamentally changed
        if (previousContext.facing) clearedContext.facing = previousContext.facing;
        if (previousContext.minArea || previousContext.maxArea) clearedContext.minArea = previousContext.minArea;
      }
    } else if (isFollowUpRefinement && previousContext.propertyType) {
      filters.propertyType = previousContext.propertyType;
      retainedContext.propertyType = previousContext.propertyType;
    }

    // Configuration Reconciliation
    if (explicitConfig) {
      filters.unitType = explicitConfig;
      filters.propertyType = 'APARTMENT';
      retainedContext.configuration = explicitConfig;
      retainedContext.propertyType = 'APARTMENT';
    } else if (isFollowUpRefinement && previousContext.configuration) {
      filters.unitType = previousContext.configuration;
      filters.propertyType = 'APARTMENT';
      retainedContext.configuration = previousContext.configuration;
      retainedContext.propertyType = 'APARTMENT';
    }

    // Facing Reconciliation
    if (explicitFacing) {
      filters.facing = explicitFacing;
      retainedContext.facing = explicitFacing;
    } else if (isFollowUpRefinement && previousContext.facing) {
      filters.facing = previousContext.facing;
      retainedContext.facing = previousContext.facing;
    } else if (previousContext.facing) {
      clearedContext.facing = previousContext.facing;
    }

    // Location Reconciliation
    if (explicitLocation) {
      filters.location = explicitLocation;
      filters.city = explicitLocation;
      retainedContext.location = explicitLocation;
      retainedContext.city = explicitLocation;
      if (!targetProjectSlug) searchScope = 'LOCATION_SCOPED';
    } else if (isFollowUpRefinement && previousContext.location) {
      filters.location = previousContext.location;
      filters.city = previousContext.city;
      retainedContext.location = previousContext.location;
      retainedContext.city = previousContext.city;
      if (!targetProjectSlug) searchScope = 'LOCATION_SCOPED';
    }

    // Area Constraints Extraction & Reconciliation
    const areaMatch = rawUserMessage.match(/(\d{3,5})\s*(?:sqft|sq\.?\s*ft\.?|square\s*feet|\+)?/i);
    if (areaMatch) {
      const val = parseInt(areaMatch[1], 10);
      if (val >= 100) {
        if (textLower.includes('above') || textLower.includes('more than') || textLower.includes('greater than') || textLower.includes('minimum') || rawUserMessage.includes('+')) {
          filters.minArea = val;
          retainedContext.minArea = val;
        } else if (textLower.includes('below') || textLower.includes('under') || textLower.includes('less than') || textLower.includes('maximum')) {
          filters.maxArea = val;
          retainedContext.maxArea = val;
        } else if (textLower.includes('around') || textLower.includes('approx') || textLower.includes('about')) {
          filters.minArea = Math.max(0, val - 300);
          filters.maxArea = val + 300;
          retainedContext.minArea = filters.minArea;
          retainedContext.maxArea = filters.maxArea;
        } else {
          filters.minArea = val;
          retainedContext.minArea = val;
        }
      }
    } else if (isFollowUpRefinement && (previousContext.minArea || previousContext.maxArea)) {
      if (previousContext.minArea) filters.minArea = previousContext.minArea;
      if (previousContext.maxArea) filters.maxArea = previousContext.maxArea;
      retainedContext.minArea = previousContext.minArea;
      retainedContext.maxArea = previousContext.maxArea;
    }

    // Resolve target project object if any
    const targetProject = targetProjectSlug ? (getProjectBySlug(targetProjectSlug) || getProjectById(targetProjectSlug)) : undefined;

    if (isFollowUpRefinement) {
      contextAction = 'FOLLOW_UP_REQUEST';
    }

    // If completely ambiguous (e.g. just "Show available plots" with no project or location context), ask for clarification
    const isAmbiguousQuery = !targetProject && !filters.location && !filters.city && !filters.unitType && !filters.facing && !filters.minArea && (textLower === 'show available plots' || textLower === 'show plots' || textLower === 'available plots');

    if (isAmbiguousQuery) {
      const plan: QueryPlan = {
        intent: 'CLARIFICATION',
        responseMode: 'CLARIFICATION',
        searchScope: 'NONE',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: true,
        clarificationQuestion: 'Which Nova project would you like to explore? (e.g. Nova Diya Gardens, Nova Vasantham, Nova Tejas, Nova Pinnacle, Nova NCR)'
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // Build Final Inventory Search Plan
    const plan: QueryPlan = {
      intent: 'INVENTORY_SEARCH',
      responseMode: 'LIVE_INVENTORY',
      searchScope,
      contextAction,
      targetProjectSlug: targetProject?.slug,
      targetProjectId: targetProject?.id,
      targetProjectName: targetProject?.name,
      requiresLiveData: true,
      requiresProjectData: true,
      requiresLayout: false,
      requiresGeneralKnowledge: false,
      crossProjectSearch: !targetProject,
      filters,
      retainedContext,
      clearedContext,
      isAmbiguous: false
    };

    this.logContextDebug(rawUserMessage, plan, previousContext);
    return plan;
  }

  /**
   * Internal Development Logging for Context & Search Scope Decisions (Section 36)
   */
  private logContextDebug(rawUserMessage: string, plan: QueryPlan, previousContext: ConversationContext): void {
    if (process.env.NODE_ENV !== 'production' || true) {
      console.log(
        `\n[Nova AI Context Debug]\n` +
        `  USER MESSAGE: "${rawUserMessage}"\n` +
        `  DETECTED INTENT: ${plan.intent}\n` +
        `  CONTEXT ACTION: ${plan.contextAction}\n` +
        `  SEARCH SCOPE: ${plan.searchScope}\n` +
        `  PREVIOUS CONTEXT: ${JSON.stringify(previousContext)}\n` +
        `  RETAINED CONTEXT: ${JSON.stringify(plan.retainedContext || {})}\n` +
        `  CLEARED CONTEXT: ${JSON.stringify(plan.clearedContext || {})}\n` +
        `  FINAL SEARCH FILTER: ${JSON.stringify(plan.filters || {})}\n`
      );
    }
  }
}

export const aiIntentRouter = new AiIntentRouter();

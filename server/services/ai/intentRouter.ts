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
  // Nova Pinnacle / KNG Pudur (Customer-Facing & Legacy)
  'pinnacle': 'nova-pinnacle',
  'pinncale': 'nova-pinnacle',
  'pinacle': 'nova-pinnacle',
  'nova pinnacle': 'nova-pinnacle',
  'nova pinncale': 'nova-pinnacle',
  'kng': 'nova-pinnacle',
  'kng pudur': 'nova-pinnacle',
  'nova kng pudur': 'nova-pinnacle',
  'nova kng': 'nova-pinnacle',
  'kng pudur — option 03': 'nova-pinnacle',
  'kng pudur - option 03': 'nova-pinnacle',
  'kng pudur option 03': 'nova-pinnacle',
  'kng option 03': 'nova-pinnacle',
  'option 03': 'nova-pinnacle',
  'option 3': 'nova-pinnacle',

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
  'vasantham apartments': 'nova-vasantham',
  'vasantham apartment': 'nova-vasantham',
  'tejas': 'nova-tejas',
  'nova tejas': 'nova-tejas',
  'tejas apartments': 'nova-tejas',
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
   * Normalize natural language query, convert number words, handle shorthand and common typos
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
      .replace(/\bsquare\s*foot\b/g, 'sqft')
      .replace(/\bthree\s*bedroom\b/g, '3 bhk')
      .replace(/\bthree\s*bed\b/g, '3 bhk')
      .replace(/\b3\s*bedroom\b/g, '3 bhk')
      .replace(/\b3\s*bed\b/g, '3 bhk')
      .replace(/\btwo\s*bedroom\b/g, '2 bhk')
      .replace(/\btwo\s*bed\b/g, '2 bhk')
      .replace(/\b2\s*bedroom\b/g, '2 bhk')
      .replace(/\b2\s*bed\b/g, '2 bhk')
      .replace(/\bone\s*bedroom\b/g, '1 bhk')
      .replace(/\bone\s*bed\b/g, '1 bhk')
      .replace(/\b1\s*bedroom\b/g, '1 bhk')
      .replace(/\b1\s*bed\b/g, '1 bhk')
      .replace(/\bfour\s*bedroom\b/g, '4 bhk')
      .replace(/\bfour\s*bed\b/g, '4 bhk')
      .replace(/\b4\s*bedroom\b/g, '4 bhk')
      .replace(/\b4\s*bed\b/g, '4 bhk')
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
   * Parse previous messages to reconstruct prior ConversationContext, including
   * stashed search context, recent mentioned properties, and active topic.
   */
  parsePreviousContext(messages: ChatMessage[], currentProjectSlug?: string): ConversationContext {
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

    const recentProps: string[] = [];
    const stashedSearch: Partial<ConversationContext> = {};

    // Scan backwards from the most recent previous turn
    for (let i = messages.length - 2; i >= 0; i--) {
      const msg = messages[i];
      const text = this.normalizeText(msg.content);

      // Collect mentioned property numbers
      const propMatches = msg.content.match(/\b(?:plot|flat|unit|property)?\s*#?\s*([0-9]+[A-Z]|[0-9]{1,4}|PP:[0-9]+)\b/gi) || [];
      for (const pm of propMatches) {
        const clean = pm.replace(/^(?:plot|flat|unit|property)\s*#?\s*/i, '').trim();
        if (clean && !recentProps.includes(clean)) {
          recentProps.push(clean);
        }
      }

      if (msg.role !== 'user') continue;

      // Track stashed search context for topic-resumption
      if (text.includes('bhk') || text.includes('apartment') || text.includes('flat') || text.includes('plot')) {
        if (!stashedSearch.propertyType) {
          if (text.includes('apartment') || text.includes('flat') || text.includes('bhk')) stashedSearch.propertyType = 'APARTMENT';
          else if (text.includes('plot') || text.includes('land')) stashedSearch.propertyType = 'PLOT';
        }
        if (!stashedSearch.configuration) {
          if (text.includes('1 bhk') || text.includes('1bhk')) stashedSearch.configuration = '1 BHK';
          else if (text.includes('2 bhk') || text.includes('2bhk')) stashedSearch.configuration = '2 BHK';
          else if (text.includes('3 bhk') || text.includes('3bhk')) stashedSearch.configuration = '3 BHK';
          else if (text.includes('4 bhk') || text.includes('4bhk')) stashedSearch.configuration = '4 BHK';
        }
        if (!stashedSearch.location && !stashedSearch.city) {
          if (text.includes('chennai')) { stashedSearch.city = 'Chennai'; stashedSearch.location = 'Chennai'; }
          else if (text.includes('coimbatore')) { stashedSearch.city = 'Coimbatore'; stashedSearch.location = 'Coimbatore'; }
          else if (text.includes('thiruvallur')) { stashedSearch.city = 'Thiruvallur'; stashedSearch.location = 'Thiruvallur'; }
        }
        if (!stashedSearch.facing) {
          if (text.includes('east-facing') || (text.includes('east') && !text.includes('real estate'))) stashedSearch.facing = 'East';
          else if (text.includes('north-facing') || text.includes('north')) stashedSearch.facing = 'North';
          else if (text.includes('west-facing') || text.includes('west')) stashedSearch.facing = 'West';
          else if (text.includes('south-facing') || text.includes('south')) stashedSearch.facing = 'South';
        }
      }

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
        if (text.includes('east-facing') || (text.includes('east') && !text.includes('real estate'))) prevContext.facing = 'East';
        else if (text.includes('west-facing') || text.includes('west')) prevContext.facing = 'West';
        else if (text.includes('north-facing') || text.includes('north')) prevContext.facing = 'North';
        else if (text.includes('south-facing') || text.includes('south')) prevContext.facing = 'South';
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
    }

    prevContext.lastMentionedProperties = recentProps;
    if (Object.keys(stashedSearch).length > 0) {
      prevContext.savedSearchContext = stashedSearch;
    }

    return prevContext;
  }

  /**
   * Main semantic router and query planner with context reconciliation
   */
  planQuery(messages: ChatMessage[], currentProjectSlug?: string): QueryPlan {
    const rawUserMessage = messages[messages.length - 1]?.content || '';
    const textLower = this.normalizeText(rawUserMessage);
    const allProjects = getAllProjects();
    const previousContext = this.parsePreviousContext(messages, currentProjectSlug);

    // 1. Check for Security / Prompt Injection / Private CRM attempts
    if (
      textLower.includes('ignore previous instructions') ||
      textLower.includes('ignore your rules') ||
      textLower.includes('system prompt') ||
      textLower.includes('crm record') ||
      textLower.includes('private crm') ||
      textLower.includes('internal note') ||
      textLower.includes('database password') ||
      textLower.includes('secret key') ||
      textLower.includes('admin token') ||
      textLower.includes('hidden database') ||
      textLower.includes('unpublished properties') ||
      textLower.includes('override the published')
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
    const cleanPunctuation = textLower.replace(/[!?.,;]+$/, '').trim();
    const greetingWords = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'namaste', 'greetings', 'hi nova', 'hello nova', 'hi there', 'hello there', 'hey there'];
    const casualWords = ['how are you', 'how are you?', 'how are you doing', 'how r u', 'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'thanks a lot!', 'okay', 'ok', 'great', 'cool', 'nice', 'awesome', 'who are you', 'what are you'];

    const isGreetingExact = greetingWords.includes(cleanPunctuation);
    const isCasualExact = casualWords.includes(cleanPunctuation) || /^(thanks|thank you|thanks a lot|thank you so much|how are you|okay|ok)[!?.,;]*$/i.test(textLower);

    if (isGreetingExact) {
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

    if (isCasualExact) {
      return {
        intent: 'CASUAL_CONVERSATION',
        responseMode: 'CASUAL',
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

    // 4. Detect Specific Property Identifiers in Current Query
    const propertyNumberMatch = rawUserMessage.match(/\b(?:plot|flat|unit|property)\s*#?\s*([0-9]+[A-Za-z0-9\-_:]*|PP:[0-9]+)\b/i);
    const flatDirectMatch = rawUserMessage.match(/\b(flat\s*-\s*[0-9]+[A-Z]|flat\s*[0-9]+[A-Z]|[0-9]+[A-Z]\s*flat)\b/i);
    const shortUnitMatch = rawUserMessage.match(/\b(?:is|about|for|unit)\s+([0-9]+[A-Z])\b/i);
    const hasSpecificPropertyNumber = Boolean(propertyNumberMatch || flatDirectMatch || shortUnitMatch);

    // 5. Detect Hybrid Evaluative Questions (e.g. "Why is east facing preferred and do you have any?", "Is 814 sq.ft UDS good for a 1750 sq.ft apartment?", "Generally which direction is considered good for a plot, and do you currently have east-facing plots in Nova Diya Garden?")
    const isUdsRatioCalculation = textLower.includes('uds') && (textLower.includes('1750') || textLower.includes('sqft') || textLower.includes('sq.ft') || textLower.includes('ratio') || textLower.includes('percentage') || textLower.includes('good for'));
    const isWhyPlusInventory = (textLower.includes('why is') || textLower.includes('why are') || textLower.includes('generally') || textLower.includes('in general')) && (textLower.includes('do you have') || textLower.includes('do we have') || textLower.includes('any available') || textLower.includes('current') || textLower.includes('plots in') || textLower.includes('apartments in') || textLower.includes('have any'));

    if (isUdsRatioCalculation || isWhyPlusInventory) {
      const targetSlug = detectedSlug || previousContext.projectSlug;
      const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

      let extractedFacing: string | undefined = undefined;
      if (textLower.includes('east')) extractedFacing = 'East';
      else if (textLower.includes('north')) extractedFacing = 'North';
      else if (textLower.includes('west')) extractedFacing = 'West';
      else if (textLower.includes('south')) extractedFacing = 'South';

      let extractedPropType: string | undefined = undefined;
      if (textLower.includes('apartment') || textLower.includes('flat') || textLower.includes('bhk')) extractedPropType = 'APARTMENT';
      else if (textLower.includes('plot') || textLower.includes('land')) extractedPropType = 'PLOT';

      const plan: QueryPlan = {
        intent: 'MIXED',
        responseMode: 'MIXED',
        searchScope: targetProj ? 'SINGLE_PROJECT_SCOPED' : 'ALL_NOVA_PROJECTS',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        targetProjectSlug: targetProj?.slug,
        targetProjectId: targetProj?.id,
        targetProjectName: targetProj?.name,
        requiresLiveData: Boolean(isWhyPlusInventory || textLower.includes('have any') || textLower.includes('do you have')),
        requiresProjectData: Boolean(targetProj),
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        crossProjectSearch: !targetProj,
        filters: (extractedFacing || extractedPropType) ? {
          status: 'AVAILABLE',
          propertyType: extractedPropType,
          facing: extractedFacing
        } : undefined,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }


    // 6. Detect Explicit General Real Estate Knowledge / Advice (NO DB Query!)
    // CRITICAL: "what is real estate?", "what is UDS?", "what is carpet area?", "what is a 3 BHK?", "what is FSI?", etc.
    const generalEducationalKeywords = [
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
      'what is an apartment',
      'what is a flat',
      'what is a villa',
      'what is fsi',
      'what is far',
      'what is uds',
      'what does uds mean',
      'what is undivided share',
      'what does east-facing mean',
      'what does east facing mean',
      'what is east facing',
      'what does north-facing mean',
      'what does north facing mean',
      'what does west-facing mean',
      'what does south-facing mean',
      'why is east facing preferred',
      'why do people prefer east-facing',
      'why is north facing preferred',
      'is east-facing better',
      'is north-facing better',
      'which facing is good',
      'which facing is best',
      'which facing is always good',
      'which facing is better',
      'which direction is good',
      'which direction is best',
      'which facing is good for apartment',
      'which facing is good for an apartment',
      'which facing is good for a flat',
      'which facing is good for a plot',
      'what are the best facings',
      'vastu guidelines',
      'vastu facing',
      'vastu direction',
      'difference between east and west',
      'difference between east-facing and west-facing',
      'dtcp approval meaning',
      'rera registration meaning',
      'what is rera',
      'what is dtcp',
      'what is cmda',
      'what is patta',
      'what is ec',
      'what is encumbrance certificate',
      'what is guideline value',
      'what is market value',
      'what is appreciation',
      'what is rental yield',
      'what is an emi',
      'what is emi',
      'what is down payment',
      'carpet area and saleable area',
      'difference between carpet area and saleable area',
      'difference between carpet and saleable',
      'carpet area vs saleable area',
      'what is carpet area',
      'what is saleable area',
      'what is plinth area',
      'what is built-up area',
      'what is super built-up',
      'what is a 3 bhk',
      'what is a 2 bhk',
      'what is a 1 bhk',
      'what is a 4 bhk',
      'what is bhk',
      'what is a bhk',
      'what should i check before buying a plot',
      'things to check before buying a plot',
      'what to check before buying a plot',
      'what should i check before buying',
      'what to check before buying',
      'difference between a plot and an apartment',
      'difference between plot and flat',
      'which is better, apartment or plot',
      'which is better apartment or plot',
      'which is better plot or apartment',
      'i am just learning',
      'just learning'
    ];

    const isExplicitEducationalQuestion = generalEducationalKeywords.some(k => textLower.includes(k));
    const isWhatIsPattern = (textLower.startsWith('what is ') || textLower.startsWith('what does ') || textLower.startsWith('why is ') || textLower.startsWith('explain ') || textLower.startsWith('define ') || textLower.startsWith('how does ')) &&
      !textLower.includes('nova') &&
      !textLower.includes('available') &&
      !textLower.includes('inventory') &&
      !hasSpecificPropertyNumber;

    if (!detectedSlug && (isExplicitEducationalQuestion || isWhatIsPattern)) {
      // Save any existing search context to allow returning later
      const savedSearch = previousContext.savedSearchContext || (previousContext.propertyType || previousContext.configuration ? {
        propertyType: previousContext.propertyType,
        configuration: previousContext.configuration,
        location: previousContext.location,
        city: previousContext.city,
        facing: previousContext.facing,
        minArea: previousContext.minArea,
        maxArea: previousContext.maxArea
      } : undefined);

      const plan: QueryPlan = {
        intent: 'GENERAL_KNOWLEDGE',
        responseMode: 'GENERAL_REAL_ESTATE',
        searchScope: 'NONE',
        contextAction: 'GENERAL_EDUCATION',
        clearedContext: previousContext,
        retainedContext: {},
        savedSearchContext: savedSearch,
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: true,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 7. Detect Topic Resumption (e.g. "Now show me the available ones", "Back to the apartments — show available ones", "Show available ones")
    const isTopicResumption = (
      textLower.startsWith('now show me') ||
      textLower.startsWith('back to the') ||
      textLower.startsWith('back to apartments') ||
      textLower.startsWith('back to plots') ||
      (textLower.includes('available ones') && previousContext.savedSearchContext)
    );

    if (isTopicResumption && previousContext.savedSearchContext) {
      const restored = previousContext.savedSearchContext;
      const filters: InventoryFilters = {
        status: 'AVAILABLE',
        propertyType: restored.propertyType,
        unitType: restored.configuration,
        location: restored.location || restored.city,
        city: restored.city,
        facing: restored.facing,
        minArea: restored.minArea,
        maxArea: restored.maxArea
      };

      const plan: QueryPlan = {
        intent: 'INVENTORY_SEARCH',
        responseMode: 'LIVE_INVENTORY',
        searchScope: restored.location ? 'LOCATION_SCOPED' : 'ALL_NOVA_PROJECTS',
        contextAction: 'FOLLOW_UP_REQUEST',
        retainedContext: restored,
        requiresLiveData: true,
        requiresProjectData: true,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        crossProjectSearch: !restored.projectSlug,
        filters,
        isAmbiguous: false
      };
      this.logContextDebug(rawUserMessage, plan, previousContext);
      return plan;
    }

    // 8. Detect Explicit Location in Current Query
    let explicitLocation: string | undefined = undefined;
    if (textLower.includes('coimbatore')) explicitLocation = 'Coimbatore';
    else if (textLower.includes('thiruvallur')) explicitLocation = 'Thiruvallur';
    else if (textLower.includes('chennai')) explicitLocation = 'Chennai';
    else if (textLower.includes('mogappair')) explicitLocation = 'Mogappair';

    // 9. Detect Corrections in Current Query (e.g. "I want a 2 BHK... actually 3 BHK", "Chennai — sorry, I meant Coimbatore")
    let explicitConfig: string | undefined = undefined;
    if (textLower.includes('actually 3 bhk') || textLower.includes('actually 3bhk') || textLower.includes('meant 3 bhk') || textLower.includes('3 bhk') || textLower.includes('3bhk')) {
      explicitConfig = '3 BHK';
    } else if (textLower.includes('actually 2 bhk') || textLower.includes('actually 2bhk') || textLower.includes('meant 2 bhk') || textLower.includes('2 bhk') || textLower.includes('2bhk')) {
      explicitConfig = '2 BHK';
    } else if (textLower.includes('1 bhk') || textLower.includes('1bhk')) {
      explicitConfig = '1 BHK';
    } else if (textLower.includes('4 bhk') || textLower.includes('4bhk')) {
      explicitConfig = '4 BHK';
    } else if (textLower.includes('2b2t')) {
      explicitConfig = '2B2T';
    }

    let explicitPropertyType: 'PLOT' | 'APARTMENT' | 'COMMERCIAL_SHOP' | undefined = undefined;
    if (textLower.includes("don't want a plot") || textLower.includes('no plots') || textLower.includes('not a plot')) {
      explicitPropertyType = 'APARTMENT';
    } else if (textLower.includes("don't want an apartment") || textLower.includes('no apartments') || textLower.includes('not apartment')) {
      explicitPropertyType = 'PLOT';
    } else if (textLower.includes('plot') || textLower.includes('plots') || textLower.includes('land') || textLower.includes('site') || textLower.includes('villa plot')) {
      explicitPropertyType = 'PLOT';
    } else if (textLower.includes('apartment') || textLower.includes('apartments') || textLower.includes('flat') || textLower.includes('flats') || explicitConfig) {
      explicitPropertyType = 'APARTMENT';
    } else if (textLower.includes('shop') || textLower.includes('commercial')) {
      explicitPropertyType = 'COMMERCIAL_SHOP';
    }

    // 10. Detect Negation and Exclusions (e.g. "not west-facing", "anything except south", "no west")
    const negatedFacings: string[] = [];
    if (textLower.includes('not west') || textLower.includes('except west') || textLower.includes('without west') || textLower.includes('no west')) negatedFacings.push('West');
    if (textLower.includes('not south') || textLower.includes('except south') || textLower.includes('without south') || textLower.includes('no south') || textLower.includes('anything except south')) negatedFacings.push('South');
    if (textLower.includes('not north') || textLower.includes('except north') || textLower.includes('without north') || textLower.includes('no north')) negatedFacings.push('North');
    if (textLower.includes('not east') || textLower.includes('except east') || textLower.includes('without east') || textLower.includes('no east')) negatedFacings.push('East');

    let explicitFacing: string | undefined = undefined;
    if (!negatedFacings.includes('East') && (textLower.includes('east-facing') || textLower.includes('east facing') || (textLower.includes('east') && !textLower.includes('real estate')))) explicitFacing = 'East';
    else if (!negatedFacings.includes('West') && (textLower.includes('west-facing') || textLower.includes('west facing') || textLower.includes('west'))) explicitFacing = 'West';
    else if (!negatedFacings.includes('North') && (textLower.includes('north-facing') || textLower.includes('north facing') || textLower.includes('north'))) explicitFacing = 'North';
    else if (!negatedFacings.includes('South') && (textLower.includes('south-facing') || textLower.includes('south facing') || textLower.includes('south'))) explicitFacing = 'South';

    // 11. Detect Sorting / Ranking Intent (e.g. "cheaper ones", "bigger ones", "smaller ones")
    let sortBy: 'area_asc' | 'area_desc' | 'price_asc' | 'price_desc' | undefined = undefined;
    if (textLower.includes('cheaper') || textLower.includes('affordable') || textLower.includes('lowest price')) sortBy = 'price_asc';
    else if (textLower.includes('bigger') || textLower.includes('larger') || textLower.includes('more spacious') || textLower.includes('highest area')) sortBy = 'area_desc';
    else if (textLower.includes('smaller') || textLower.includes('compact')) sortBy = 'area_asc';

    // 12. Detect Status Requirements (AVAILABLE vs ALL vs BOOKED vs SOLD)
    let statusRequirement: string = 'AVAILABLE';
    if (textLower.includes('all properties') || textLower.includes('show everything') || textLower.includes('show all') || textLower === 'all' || textLower === 'all.') {
      statusRequirement = 'ALL';
    } else if (textLower.includes('booked') || textLower.includes('show booked')) {
      statusRequirement = 'BOOKED';
    } else if (textLower.includes('sold') || textLower.includes('registered')) {
      statusRequirement = 'SOLD';
    } else if (textLower.includes('available') || textLower.includes('available ones') || textLower.includes('show available')) {
      statusRequirement = 'AVAILABLE';
    }

    // 13. Detect Location Search / Project Catalog Search (e.g. "Which Nova projects are in Chennai?", "Projects in Coimbatore")
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

    // 14. Detect Property Comparison Intent (e.g. "Compare 1A and 1B", "Compare Flat 1A and Flat 1B in Nova Tejas", "compare them", "which one is better?")
    const isCompare = textLower.includes('compare') || textLower.includes('versus') || textLower.includes(' vs ') || textLower.includes('difference between plot') || textLower.includes('which is better') || textLower.includes('which one would you choose') || textLower.includes('which one looks like');
    if (isCompare) {
      let numbers: string[] = (rawUserMessage.match(/(\d+[A-Za-z0-9\-_]*|Flat\s*-\s*\d+[A-Z]|Flat\s*\d+[A-Z]|Unit\s*\d+|PP:[0-9]+)/gi) || []) as string[];
      if (numbers.length === 0 && previousContext.lastMentionedProperties && previousContext.lastMentionedProperties.length >= 2) {
        numbers = previousContext.lastMentionedProperties.slice(0, 2);
      }

      if (numbers.length >= 2) {
        const targetSlug = detectedSlug || previousContext.projectSlug;
        const targetProj = targetSlug ? (getProjectBySlug(targetSlug) || getProjectById(targetSlug)) : undefined;

        const plan: QueryPlan = {
          intent: 'PROPERTY_COMPARISON',
          responseMode: 'COMPARISON',
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
          comparisonProperties: numbers,
          isAmbiguous: false
        };
        this.logContextDebug(rawUserMessage, plan, previousContext);
        return plan;
      }
    }

    // 15. Detect Exact Property Details Lookup (e.g. "Is Flat 1A available?", "Is 1A available?", "Tell me about Plot 105", "How much UDS does 1A have?", "Is Flat 99Z available in Nova Tejas?")
    const isSearchPlural = textLower.includes('available plots') || textLower.includes('available flats') || textLower.includes('show me plots') || textLower.includes('which plots') || textLower.includes('show me flats');

    if (hasSpecificPropertyNumber && !isSearchPlural && !isCompare) {
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

    // 16. Detect Layout & Spatial Queries
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
          clarificationQuestion: 'Which Nova project layout would you like to explore? (e.g. Nova Diya Gardens, Nova NCR, Nova Pinnacle)'
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

    // 17. Project Overview / Project Details (e.g. "Tell me about Nova Vasantham", "Tell me about Vasantham", "What is Nova Diya Garden?")
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

    // 18. Check Ambiguity (e.g. "show me some properties", "something around 1500 sqft")
    const isAmbiguousGeneric = (
      (textLower === 'show me some properties' || textLower === 'show properties' || textLower === 'show some properties' || textLower === 'properties') &&
      !detectedSlug && !previousContext.projectSlug && !explicitLocation && !previousContext.location
    );

    if (isAmbiguousGeneric) {
      return {
        intent: 'CLARIFICATION',
        responseMode: 'CLARIFICATION',
        searchScope: 'NONE',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: true,
        clarificationQuestion: 'Sure. Are you looking for a residential plot or an apartment?'
      };
    }

    const isAmbiguousArea = (
      (textLower.startsWith('something around ') || textLower.startsWith('around ') || textLower.startsWith('roughly ')) &&
      !explicitPropertyType && !previousContext.propertyType && !detectedSlug && !previousContext.projectSlug
    );

    if (isAmbiguousArea) {
      const areaVal = rawUserMessage.match(/(\d{3,5})/)?.[1] || '1,500';
      return {
        intent: 'CLARIFICATION',
        responseMode: 'CLARIFICATION',
        searchScope: 'NONE',
        contextAction: 'NEW_INDEPENDENT_REQUEST',
        requiresLiveData: false,
        requiresProjectData: false,
        requiresLayout: false,
        requiresGeneralKnowledge: false,
        isAmbiguous: true,
        clarificationQuestion: `Sure. Do you mean a plot around ${areaVal} sq.ft or an apartment around ${areaVal} sq.ft?`
      };
    }

    // 19. Context Reconciliation for Inventory Searches (Apartment, Plot, or General Inventory)
    const filters: InventoryFilters = { status: statusRequirement };
    if (sortBy) filters.sortBy = sortBy;
    if (negatedFacings.length > 0) filters.negatedFacing = negatedFacings;

    let contextAction: ContextAction = 'NEW_INDEPENDENT_REQUEST';
    let searchScope: SearchScope = 'ALL_NOVA_PROJECTS';
    let targetProjectSlug: string | undefined = undefined;
    const clearedContext: Partial<ConversationContext> = {};
    const retainedContext: Partial<ConversationContext> = {};

    // Check if the current message is a follow-up refinement
    const isFollowUpRefinement = (
      textLower === 'chennai' ||
      textLower === 'chennai.' ||
      textLower === 'coimbatore' ||
      textLower === 'thiruvallur' ||
      textLower === 'in chennai' ||
      textLower === 'in coimbatore' ||
      textLower === 'in thiruvallur' ||
      textLower === 'east facing' ||
      textLower === 'east-facing' ||
      textLower === 'north facing' ||
      textLower === 'north-facing' ||
      textLower === 'west facing' ||
      textLower === 'south facing' ||
      textLower === 'show available ones' ||
      textLower === 'available ones' ||
      textLower === 'only available' ||
      textLower === 'cheaper ones' ||
      textLower === 'bigger ones' ||
      textLower.startsWith('around ') ||
      textLower.startsWith('what about ') ||
      textLower.startsWith('how about ') ||
      (textLower.includes('facing') && !explicitPropertyType && !detectedSlug) ||
      (textLower.includes('sqft') && !explicitPropertyType && !detectedSlug)
    );

    // Project Resolution & Scoping
    if (detectedSlug) {
      targetProjectSlug = detectedSlug;
      searchScope = 'SINGLE_PROJECT_SCOPED';
    } else if (isFollowUpRefinement && previousContext.projectSlug && !explicitPropertyType) {
      targetProjectSlug = previousContext.projectSlug;
      searchScope = 'SINGLE_PROJECT_SCOPED';
      retainedContext.projectSlug = previousContext.projectSlug;
      retainedContext.projectName = previousContext.projectName;
      retainedContext.projectId = previousContext.projectId;
    } else if (previousContext.projectSlug) {
      // Clear previous project if user asked a new cross-project generic search
      clearedContext.projectSlug = previousContext.projectSlug;
      clearedContext.projectName = previousContext.projectName;
    }

    // Property Type Reconciliation
    if (explicitPropertyType) {
      filters.propertyType = explicitPropertyType;
      retainedContext.propertyType = explicitPropertyType;
      if (previousContext.propertyType && previousContext.propertyType !== explicitPropertyType) {
        clearedContext.propertyType = previousContext.propertyType;
        if (previousContext.facing) clearedContext.facing = previousContext.facing;
        if (previousContext.minArea || previousContext.maxArea) clearedContext.minArea = previousContext.minArea;
      }
    } else if (isFollowUpRefinement && previousContext.propertyType) {
      filters.propertyType = previousContext.propertyType;
      retainedContext.propertyType = previousContext.propertyType;
    }

    // Configuration (BHK) Reconciliation
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
    } else if (isFollowUpRefinement && previousContext.facing && negatedFacings.length === 0) {
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
    } else if (isFollowUpRefinement && (previousContext.location || previousContext.city)) {
      filters.location = previousContext.location || previousContext.city;
      filters.city = previousContext.city || previousContext.location;
      retainedContext.location = previousContext.location;
      retainedContext.city = previousContext.city;
      if (!targetProjectSlug) searchScope = 'LOCATION_SCOPED';
    }

    // Area Constraints Extraction
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
        } else if (textLower.includes('around') || textLower.includes('approx') || textLower.includes('about') || textLower.includes('roughly')) {
          filters.minArea = Math.round(val * 0.9);
          filters.maxArea = Math.round(val * 1.1);
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

    // If completely ambiguous (e.g. just "Show available plots" with no project or location context)
    const isAmbiguousPlots = !targetProject && !filters.location && !filters.city && !filters.unitType && !filters.facing && !filters.minArea && (textLower === 'show available plots' || textLower === 'show plots' || textLower === 'available plots');

    if (isAmbiguousPlots) {
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
   * Internal Development Logging for Context & Search Scope Decisions
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

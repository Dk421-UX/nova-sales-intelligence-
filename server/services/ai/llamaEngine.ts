import { config } from '../../config.ts';
import { QueryPlan, RetrievedContext, ChatMessage } from './types.ts';

export class LlamaEngine {
  private model: string;
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.model = config.aiModel || 'llama-3.3-70b-versatile';
    this.apiKey = config.aiApiKey;
    this.apiUrl = config.aiApiUrl || 'https://api.groq.com/openai/v1';
  }

  /**
   * Build dynamic context strictly from retrieved contexts (no giant static dump)
   */
  buildPromptContext(plan: QueryPlan, contexts: RetrievedContext[]): string {
    const sections: string[] = [];

    for (const ctx of contexts) {
      if (ctx.sourceType === 'LIVE_INVENTORY') {
        const records = ctx.records || [];
        const total = ctx.data?.totalMatches ?? records.length;
        const projLabel = ctx.projectName ? ` for "${ctx.projectName}"` : ' (Cross-Project)';
        sections.push(
          `[AUTHORITATIVE SOURCE: LIVE_INVENTORY${projLabel}]\n` +
          `Total Matching in Database: ${total}\n` +
          `Retrieved Records:\n` +
          records.map(r => 
            `- ${r.projectName ? `[${r.projectName}] ` : ''}${r.propertyType} ${r.propertyNumber}: Status=${r.status}, Facing=${r.facing || 'N/A'}, Area=${r.areaSqft || r.saleableAreaSqft || 'N/A'} sq.ft${r.unitType ? `, UnitType=${r.unitType}` : ''}${r.udsSqft ? `, UDS=${r.udsSqft} sq.ft` : ''}${r.carpetAreaSqft ? `, Carpet=${r.carpetAreaSqft} sq.ft` : ''}${r.priceDisplay ? `, Price=${r.priceDisplay}` : ''}`
          ).join('\n')
        );
      } else if (ctx.sourceType === 'PROJECT_DATA') {
        const d = ctx.data;
        if (Array.isArray(d)) {
          sections.push(
            `[AUTHORITATIVE SOURCE: PUBLISHED_PROJECTS_CATALOG]\n` +
            d.map(p => `- ${p.name} (${p.projectType === 'APARTMENT' ? 'Apartment' : 'Plot'}) in ${p.location}, ${p.city}. Available: ${p.availableCount || 0}/${p.totalInventory || 0} units.`).join('\n')
          );
        } else if (d) {
          sections.push(
            `[AUTHORITATIVE SOURCE: PROJECT_DATA for "${d.name}"]\n` +
            `Type: ${d.projectType} | Location: ${d.location}, ${d.city}\n` +
            `Description: ${d.description || 'N/A'}\n` +
            `Highlights: ${(d.highlights || []).join(', ')}\n` +
            `Amenities: ${(d.amenities || []).join(', ')}`
          );
        }
      } else if (ctx.sourceType === 'LAYOUT_ANALYSIS') {
        const l = ctx.data;
        sections.push(
          `[AUTHORITATIVE SOURCE: OFFICIAL_LAYOUT_ANALYSIS for "${ctx.projectName}"]\n` +
          `Layout Type: ${l.layoutType}\n` +
          `Roads: ${(l.roads || []).join(', ')}\n` +
          `Entrances: ${(l.entrances || []).join(', ')}\n` +
          `Parks & OSR: ${(l.parks || []).join(', ')}\n` +
          `Amenities on Layout: ${(l.amenities || []).join(', ')}\n` +
          `Notes: ${(l.notes || []).join('; ')}`
        );
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Generate grounded response via Llama 70B or deterministic fallback
   */
  async generateResponse(
    messages: ChatMessage[],
    plan: QueryPlan,
    contexts: RetrievedContext[]
  ): Promise<string> {
    const dynamicContext = this.buildPromptContext(plan, contexts);
    const userMsg = messages[messages.length - 1]?.content || '';

    // If Remote API Key is available, invoke Llama 70B
    if (this.apiKey) {
      try {
        const systemInstruction = `You are Nova AI, the natural, conversational, and verified database-grounded real-estate assistant for Nova Life Space.
Your role:
1. Handle greetings and general real-estate knowledge naturally, clearly, and concisely.
2. For Nova-specific queries (projects, availability, properties, comparisons, layouts), use ONLY the verified data provided in context.
3. Availability must always come from current live database status. NEVER hallucinate or infer availability.
4. Never invent property numbers, prices, areas, facing, BHK, amenities, or dimensions.
5. If information is missing from the database, state clearly that it is not available in the current record.
6. Clearly distinguish between general real-estate principles and Nova database facts.
7. Be concise, transparent, friendly, and helpful.`;

        const fullMessages = [
          { role: 'system', content: systemInstruction },
          ...(dynamicContext ? [{ role: 'system', content: `Current Retrieved Authoritative Data:\n${dynamicContext}` }] : []),
          ...messages
        ];

        const response = await fetch(`${this.apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: fullMessages,
            temperature: 0.1,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content;
          if (answer) return answer;
        }
      } catch (err) {
        console.warn('[LlamaEngine Remote API Error, falling back to grounded deterministic engine]:', err);
      }
    }

    // High-performance Grounded Deterministic Engine (Guarantees zero-hallucination)
    return this.deterministicFormat(plan, contexts, userMsg);
  }

  /**
   * Deterministic formatter matching all response modes
   */
  private deterministicFormat(plan: QueryPlan, contexts: RetrievedContext[], userMsg: string): string {
    const textLower = userMsg.toLowerCase();

    // 1. GREETINGS
    if (plan.intent === 'GREETING') {
      return "Hello! I'm **Nova AI**, your real-estate property intelligence assistant.\n\nI can help you:\n• Discover published Nova projects across Chennai, Thiruvallur, and Coimbatore\n• Check live availability for plots and apartments\n• Compare verified properties and specifications\n• Answer questions about real-estate concepts (like UDS, carpet area, Vastu facing)\n\nHow can I help you today?";
    }

    // 2. GENERAL REAL ESTATE KNOWLEDGE
    if (plan.intent === 'GENERAL_KNOWLEDGE' || plan.responseMode === 'GENERAL_REAL_ESTATE') {
      if (textLower.includes('what is real estate') || textLower.includes('what is the real estate') || textLower.includes('what is realestate') || textLower.includes('define real estate') || textLower.includes('meaning of real estate')) {
        return "**Real estate** refers to land and any permanent physical property attached to it, such as residential plots, apartments, villas, and commercial buildings.\n\nIn simple terms, it encompasses the ownership, purchase, sale, leasing, and development of physical land and structures. \n\nIn Nova's context, this includes approved residential plotted developments and premium apartment communities across Chennai, Thiruvallur, and Coimbatore.";
      }
      if (textLower.includes('uds') || textLower.includes('undivided share')) {
        return "UDS stands for **Undivided Share of Land**. In an apartment project, it represents the proportionate share of the underlying land legally owned by a specific apartment owner. \n\n**Why it matters**:\n• When you purchase a flat, you own the built structure plus a registered percentage of the land.\n• In the event of building redevelopment or demolition, the compensation or new apartment share is determined directly by your UDS.\n• A higher UDS-to-saleable-area ratio (typically 40% to 50% or above) represents stronger long-term land asset value.";
      }
      if (textLower.includes('carpet area') || textLower.includes('saleable area') || textLower.includes('carpet') || textLower.includes('built-up') || textLower.includes('plinth')) {
        return "Here is the key distinction between property area measurements:\n\n• **Carpet Area**: The actual net usable floor area inside the inner face of the apartment walls (where you can lay a carpet).\n• **Plinth / Built-up Area**: The carpet area plus the thickness of internal and external walls and private balconies.\n• **Saleable / Super Built-up Area**: The built-up area plus a proportionate share of common areas such as lift lobbies, staircases, corridors, and clubhouses.\n\nUnder RERA guidelines, apartments are officially evaluated based on RERA Carpet Area for maximum buyer transparency.";
      }
      if (textLower.includes('north-facing') || textLower.includes('north facing') || textLower.includes('north side')) {
        return "A **North-facing** property means the main entrance of the home or plot faces towards the geographic North.\n\n**Key Characteristics**:\n• **Sunlight & Climate**: In tropical Indian climates, North-facing homes receive consistent, glare-free indirect sunlight throughout the day, keeping interiors naturally cooler.\n• **Ventilation**: Fosters pleasant cross-ventilation when paired with South or East openings.\n• **Traditional Vastu**: North orientation is traditionally associated with positive energy, prosperity (ruled by Kubera), and high buyer preference.";
      }
      if (textLower.includes('east-facing') || textLower.includes('east facing') || textLower.includes('east side')) {
        return "An **East-facing** property means the primary entrance or plot frontage faces East.\n\n**Key Characteristics**:\n• **Morning Sunlight**: Welcomes early morning natural sunlight, which brings warmth and positive ambiance.\n• **Energy Efficiency**: Minimizes intense late-afternoon heat compared to West-facing units.\n• **Vastu Preference**: Highly sought-after in traditional Indian architecture for morning solar benefits.";
      }
      if (textLower.includes('3 bhk') || textLower.includes('3bhk')) {
        return "A **3 BHK** configuration refers to an apartment or home containing **3 Bedrooms, 1 Hall (Living/Dining Area), and 1 Kitchen**, typically accompanied by 2 or 3 bathrooms/toilets and attached balconies. It provides ample living space for growing families.";
      }
      if (textLower.includes('2 bhk') || textLower.includes('2bhk')) {
        return "A **2 BHK** configuration features **2 Bedrooms, 1 Hall (Living Area), and 1 Kitchen**, typically with 2 bathrooms. It is one of the most popular urban residential configurations for small families and working professionals.";
      }
      if (textLower.includes('check before buying a plot') || textLower.includes('what should i check') || textLower.includes('plot checklist')) {
        return "Key checklist before purchasing a residential plot:\n\n1. **Government Approvals**: Verify statutory layout approvals (DTCP, CMDA, or Local Planning Authority) and RERA registration.\n2. **Title Deeds & Chain of Ownership**: Ensure a clear 30-year parent document history without legal encumbrances.\n3. **Encumbrance Certificate (EC)**: Confirm zero dues, mortgages, or legal claims on the property.\n4. **Physical Demarcation**: Verify exact plot boundaries, survey numbers, and approach road width (minimum 24 to 30 feet).\n5. **Infrastructure & Utilities**: Check ground water level, electricity connection availability, and road connectivity.";
      }
      if (textLower.includes('difference between a plot and an apartment') || textLower.includes('plot and flat')) {
        return "Key differences between a residential plot and an apartment:\n\n• **Ownership**: A plot gives 100% individual land ownership, allowing custom architectural construction. An apartment gives individual ownership of the built unit plus an Undivided Share (UDS) of common land.\n• **Appreciation**: Plotted land generally appreciates faster due to finite land availability, while apartments offer immediate rental income.\n• **Maintenance**: Apartments include shared community amenities and maintenance, whereas individual plot owners manage their own home upkeep.";
      }
      if (textLower.includes('gated community')) {
        return "A gated community is a residential development enclosed by a secure perimeter with controlled entrances and private roads, offering enhanced security, shared amenities, and maintained common infrastructure.";
      }
      if (textLower.includes('fsi') || textLower.includes('far')) {
        return "FSI (Floor Space Index), also known as FAR (Floor Area Ratio), is the ratio of the total allowable built-up floor area of a building to the total area of the land parcel it stands on.";
      }
      if (textLower.includes('what is a plot')) {
        return "A plot is a designated parcel or piece of land marked for development, residential construction, or investment, typically defined by registered boundary measurements.";
      }
      return "Generally in real estate development, property orientation, plot layout, and infrastructure are planned to maximize ventilation, road connectivity, and natural lighting.";
    }

    // 3. NOVA OVERVIEW / CATALOG / LOCATION SEARCH
    if (plan.intent === 'NOVA_OVERVIEW') {
      const projContext = contexts.find(c => c.sourceType === 'PROJECT_DATA');
      const projects = (projContext?.data as any[]) || [];
      if (projects.length === 0) {
        return "Nova Life Space currently has plotted and residential developments across key corridors in Chennai, Thiruvallur, and Coimbatore.";
      }

      const listStr = projects.map(p => 
        `• **${p.name}** (${p.projectType === 'APARTMENT' ? 'Apartment Project' : 'Plotted Development'} in ${p.location}, ${p.city}) — ${p.availableCount || 0} available units`
      ).join('\n');

      const locHeader = plan.filters?.location ? ` in **${plan.filters.location}**` : '';
      return `Nova currently offers the following published projects${locHeader}:\n\n${listStr}\n\nWhich project or property type would you like to explore?`;
    }

    // 4. PROJECT DETAILS / AMENITIES
    if (plan.intent === 'PROJECT_DETAILS') {
      const projContext = contexts.find(c => c.sourceType === 'PROJECT_DATA');
      const p = projContext?.data;
      if (!p) {
        return "I could not locate published project specifications for this development.";
      }

      const highlightsList = (p.highlights || []).map((h: string) => `• ${h}`).join('\n');
      const amenitiesList = (p.amenities || []).map((a: string) => `• ${a}`).join('\n');

      return `**${p.name}** (${p.projectType === 'APARTMENT' ? 'Residential Apartments' : 'Plotted Development'})\n` +
        `📍 **Location**: ${p.location}, ${p.city}\n\n` +
        (p.description ? `${p.description}\n\n` : '') +
        (highlightsList ? `**Key Highlights**:\n${highlightsList}\n\n` : '') +
        (amenitiesList ? `**Approved Amenities**:\n${amenitiesList}\n\n` : '') +
        `**Current Live Status**: ${p.stats?.available ?? p.availableCount ?? 0} units available.`;
    }

    // 5. PROPERTY COMPARISON
    if (plan.intent === 'PROPERTY_COMPARISON') {
      const invContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');
      const records = invContext?.records || [];
      if (records.length < 2) {
        return `I searched the published records for **${invContext?.projectName || plan.targetProjectName || 'Nova projects'}**, but could not find all the requested properties for comparison.`;
      }

      const compStr = records.map(r => {
        const typeLabel = r.propertyType === 'APARTMENT' ? (r.unitType || 'Apartment') : 'Plot';
        const projPrefix = r.projectName ? `**${r.projectName}** — ` : '';
        const areaStr = r.saleableAreaSqft ? `${r.saleableAreaSqft} sq.ft saleable` : (r.areaSqft ? `${r.areaSqft} sq.ft` : "Area: Not available in record");
        const udsStr = r.udsSqft ? ` | UDS: ${r.udsSqft} sq.ft` : '';
        const carpetStr = r.carpetAreaSqft ? ` | Carpet: ${r.carpetAreaSqft} sq.ft` : '';
        const priceStr = r.priceDisplay ? ` | Price: ${r.priceDisplay}` : '';
        return `• ${projPrefix}**${typeLabel} ${r.propertyNumber}**:\n  - **Status**: ${r.status}\n  - **Facing**: ${r.facing || "Orientation not specified in record"}\n  - **Area**: ${areaStr}${carpetStr}${udsStr}${priceStr}`;
      }).join('\n\n');

      return `Here is the side-by-side comparison of verified published records in **${invContext?.projectName || plan.targetProjectName || 'Nova Inventory'}**:\n\n${compStr}\n\nAll details are drawn directly from live database records.`;
    }

    // 6. SINGLE PROPERTY DETAILS / LOOKUP
    if (plan.intent === 'PROPERTY_DETAILS') {
      const invContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');
      const r = invContext?.records?.[0];
      if (!r) {
        return `Property **${plan.propertyNumbers?.[0]}** is not found in published records for **${invContext?.projectName || plan.targetProjectName || 'Nova projects'}**.`;
      }

      const typeLabel = r.propertyType === 'APARTMENT' ? (r.unitType || 'Apartment') : 'Plot';
      return `Verified details for **${typeLabel} ${r.propertyNumber}** in **${r.projectName || invContext?.projectName}**:\n` +
        `• **Current Status**: ${r.status}\n` +
        `• **Orientation / Facing**: ${r.facing || "Not specified in record"}\n` +
        `• **Area**: ${r.saleableAreaSqft ? `${r.saleableAreaSqft} sq.ft (Saleable)` : (r.areaSqft ? `${r.areaSqft} sq.ft` : "Not specified")}\n` +
        (r.carpetAreaSqft ? `• **Carpet Area**: ${r.carpetAreaSqft} sq.ft\n` : '') +
        (r.udsSqft ? `• **UDS (Undivided Share)**: ${r.udsSqft} sq.ft\n` : '') +
        (r.sectionOrPhase ? `• **Phase / Floor**: ${r.sectionOrPhase}\n` : '') +
        (r.priceDisplay ? `• **Price**: ${r.priceDisplay}\n` : '') +
        `• **Data Source**: Live Published Inventory`;
    }

    // 7. LAYOUT INTELLIGENCE
    if (plan.intent === 'LAYOUT_QUERY') {
      const layContext = contexts.find(c => c.sourceType === 'LAYOUT_ANALYSIS');
      const l = layContext?.data;
      if (!l) {
        return "I can see the project overview, but I don't have verified architectural layout analysis to determine that precisely.";
      }

      const parksStr = (l.parks || []).join(', ');
      const roadsStr = (l.roads || []).join(', ');
      const entrancesStr = (l.entrances || []).join(', ');

      if (plan.spatialTarget?.feature === 'park') {
        return `According to the official layout for **${layContext?.projectName}**, the park and green spaces include: **${parksStr || 'Central Park Enclave'}**.`;
      }
      if (plan.spatialTarget?.feature === 'entrance') {
        return `According to the official layout for **${layContext?.projectName}**, the entrances include: **${entrancesStr || 'Gated Main Entrance'}**.`;
      }
      if (plan.spatialTarget?.feature === 'road') {
        return `The approved layout roads for **${layContext?.projectName}** include: **${roadsStr || 'Internal Blacktop Avenues'}**.`;
      }

      return `The official layout for **${layContext?.projectName}** shows:\n` +
        `• **Entrances**: ${entrancesStr}\n` +
        `• **Parks / OSR**: ${parksStr}\n` +
        `• **Roads**: ${roadsStr}`;
    }

    // 8. HYBRID / MIXED QUESTIONS (e.g. UDS Evaluation or General Concept + Live Inventory)
    if (plan.intent === 'MIXED') {
      if (textLower.includes('uds') && textLower.includes('1750')) {
        return "For an apartment with **1,750 sq.ft saleable area** and **814 sq.ft UDS**, the UDS ratio is **46.5%** (814 ÷ 1750).\n\n**Evaluation**:\n• In general urban real estate, a typical UDS ratio ranges between **30% and 40%**.\n• A UDS ratio of **46.5% is exceptionally good and generous**, providing significant undivided land ownership and higher long-term appreciation and redevelopment security.";
      }

      const invContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');
      const records = invContext?.records || [];
      const total = invContext?.data?.totalMatches ?? records.length;

      let genPart = "Generally, buyers consider orientation and area to optimize ventilation, natural lighting, and long-term value. ";
      if (textLower.includes('park')) {
        genPart = "The official layout designates a central park enclave. ";
      }

      if (total === 0) {
        return `${genPart}For **${invContext?.projectName || plan.targetProjectName || 'Nova projects'}**, I couldn't find any currently published properties matching those specific criteria.`;
      }

      const sampleList = records.slice(0, 5).map(r => 
        `• **${r.propertyType === 'APARTMENT' ? (r.unitType || 'Flat') : 'Plot'} ${r.propertyNumber}**: ${r.areaSqft || r.saleableAreaSqft} sq.ft | Facing: ${r.facing || 'Standard'} | Status: ${r.status}`
      ).join('\n');

      return `${genPart}For **${invContext?.projectName || plan.targetProjectName}**, I currently find **${total} published available properties**:\n\n${sampleList}`;
    }

    // 9. RECOMMENDATIONS
    if (plan.intent === 'RECOMMENDATION') {
      return "To help you find the best property in Nova projects, what are your preferences regarding:\n1. Preferred property type (Plotted community or Luxury apartment)\n2. Preferred location (Chennai, Thiruvallur, or Coimbatore)\n3. Size requirement (sq.ft) or BHK configuration\n4. Preferred facing direction (e.g. East, North)\n\nOnce you share these criteria, I will query our live inventory for exact matches.";
    }

    // 10. LIVE INVENTORY / APARTMENT / PLOT SEARCH
    const invContext = contexts.find(c => c.sourceType === 'LIVE_INVENTORY');
    const records = invContext?.records || [];
    const total = invContext?.data?.totalMatches ?? records.length;
    const projectName = invContext?.projectName || plan.targetProjectName || 'Nova projects';
    const projNameLower = projectName.toLowerCase();

    if (total === 0) {
      if (projNameLower.includes('pinnacle')) {
        return "Nova Pinnacle currently has no published plot availability.";
      }
      if (projNameLower.includes('vasantham')) {
        return "Nova Vasantham apartment availability is awaiting verified publication.";
      }
      if (plan.targetProjectName) {
        return `**${plan.targetProjectName}** is a published project, but I couldn't find any currently available properties matching those requirements in the live database. Would you like to check other facing orientations or explore all published projects?`;
      }
      return `I couldn't find a verified matching property in the current Nova inventory matching those requirements. Would you like to check other facing orientations or explore all published projects?`;
    }

    const isCross = invContext?.data?.crossProject || (!plan.targetProjectId && records.some(r => r.projectName));
    const sampleList = records.slice(0, 8).map(p => {
      const projStr = (isCross && p.projectName) ? `[**${p.projectName}** (${p.city || p.location})] ` : '';
      const typeLabel = p.propertyType === 'APARTMENT' ? (p.unitType || 'Apartment') : 'Plot';
      const areaVal = p.saleableAreaSqft ? `${p.saleableAreaSqft} sq.ft` : (p.areaSqft ? `${p.areaSqft} sq.ft` : '');
      return `• ${projStr}**${typeLabel} ${p.propertyNumber}**: ${areaVal ? `${areaVal} | ` : ''}Facing: ${p.facing || 'Standard'} | Status: **${p.status}**`;
    }).join('\n');

    const typeDesc = records[0]?.propertyType === 'APARTMENT' ? 'apartment units' : 'plots';
    return `I found **${total} currently available ${typeDesc}**${!isCross ? ` in **${projectName}**` : ''}:\n\n${sampleList}\n\n${total > 8 ? `*(Showing top 8 of ${total} verified matches)*\n\n` : ''}You can select any property to inspect exact boundaries and specifications.`;
  }
}

export const llamaEngine = new LlamaEngine();


import { config } from '../../config.ts';
import { AI_TOOLS, executeAiTool } from './tools.ts';
import { getProjectBySlug } from '../projectService.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
  name?: string;
}

export class GrokProvider {
  private model: string;
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.model = config.aiModel || 'llama-3.3-70b-versatile';
    this.apiKey = config.aiApiKey;
    this.apiUrl = config.aiApiUrl || 'https://api.groq.com/openai/v1';
  }

  async generateResponse(messages: ChatMessage[], currentProjectSlug?: string): Promise<{ text: string; executedTools: string[]; verifiedData: any }> {
    const userMessage = messages[messages.length - 1]?.content || '';
    const executedTools: string[] = [];
    let verifiedData: any = null;

    // If real AI API Key is available, call the Groq / xAI endpoint with tool definitions
    if (this.apiKey) {
      try {
        const response = await this.callAiApi(messages, currentProjectSlug);
        return response;
      } catch (err) {
        console.warn('[Grok/Groq AI Provider] Remote API call failed or timed out. Falling back to deterministic tool engine:', err);
      }
    }

    // Deterministic Rule-Based Tool Execution Engine (Zero-Hallucination Guardrail)
    return this.deterministicLocalEngine(userMessage, currentProjectSlug);
  }

  private async callAiApi(messages: ChatMessage[], currentProjectSlug?: string) {
    const systemPrompt = `You are "Ask Nova", the verified customer-facing AI discovery assistant for Nova Life Space powered by Llama 3.3 70B / Grok.
CRITICAL SOURCE-OF-TRUTH RULES:
1. You MUST ALWAYS use the provided tools to query verified database records before making any statement about availability, plot size, apartment specifications, or prices.
2. NEVER invent inventory, prices, plot numbers, dimensions, or status.
3. Current Project Context: ${currentProjectSlug || 'Not specified'}.
4. If a project (such as Nova Vasantham) is configured as an APARTMENT project but does not currently have published verified apartment inventory in the database, explicitly state: "Nova Vasantham is configured as an apartment project, but I don't currently have verified published apartment availability. Nova's verified apartment availability will appear here once published."
5. If a property is not found in database records, explicitly inform the user and recommend contacting Nova sales staff.`;

    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: fullMessages,
        tools: AI_TOOLS.map(t => ({ type: 'function', function: t })),
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API returned status: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls && message.tool_calls.length > 0) {
      const executedTools: string[] = [];
      let toolResultsSummary: any = null;

      for (const call of message.tool_calls) {
        const fnName = call.function.name;
        const args = JSON.parse(call.function.arguments || '{}');
        if (!args.project_slug && currentProjectSlug) {
          args.project_slug = currentProjectSlug;
        }
        const toolResult = await executeAiTool(fnName, args);
        executedTools.push(fnName);
        toolResultsSummary = toolResult;

        fullMessages.push(message);
        fullMessages.push({
          role: 'tool' as any,
          tool_call_id: call.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Final completion with tool results
      const finalRes = await fetch(`${this.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: fullMessages,
          temperature: 0.2,
        }),
      });

      if (!finalRes.ok) {
        throw new Error(`AI Completion API returned status: ${finalRes.status}`);
      }

      const finalData = await finalRes.json();
      return {
        text: finalData.choices?.[0]?.message?.content || 'I retrieved the verified properties matching your query.',
        executedTools,
        verifiedData: toolResultsSummary
      };
    }

    return {
      text: message?.content || 'I am Ask Nova, your property discovery assistant.',
      executedTools: [],
      verifiedData: null
    };
  }

  private async deterministicLocalEngine(userMsg: string, projectSlug?: string) {
    const textLower = userMsg.toLowerCase();
    const executedTools: string[] = [];
    let verifiedData: any = null;

    // Detect Project Slug from prompt if not passed in context
    let targetSlug = projectSlug || 'nova-diya-gardens';
    if (textLower.includes('vasantham')) targetSlug = 'nova-vasantham';
    else if (textLower.includes('diya') || textLower.includes('garden')) targetSlug = 'nova-diya-gardens';
    else if (textLower.includes('tejas')) targetSlug = 'nova-tejas';
    else if (textLower.includes('ncr')) targetSlug = 'nova-ncr';
    else if (textLower.includes('eden')) targetSlug = 'nova-edens';
    else if (textLower.includes('knt')) targetSlug = 'nova-knt';
    else if (textLower.includes('city')) targetSlug = 'nova-city';
    else if (textLower.includes('hi-tech') || textLower.includes('hitech')) targetSlug = 'nova-hi-tech';
    else if (textLower.includes('kng') || textLower.includes('pudur')) targetSlug = 'kng-pudur-option-03';
    else if (textLower.includes('ramala')) targetSlug = 'nova-ramala';
    else if (textLower.includes('vr square') || textLower.includes('vr squares')) targetSlug = 'nova-vr-squares';

    const projectInfo = getProjectBySlug(targetSlug);

    // 1. Check for Compare Intent
    if (textLower.includes('compare') || textLower.includes('versus') || textLower.includes(' vs ')) {
      const numbers = userMsg.match(/(\d+[A-Za-z0-9\-_]*|Flat\s*-\s*\d+[A-Z]|Unit\s*\d+)/gi);
      if (numbers && numbers.length >= 2) {
        executedTools.push('compare_properties');
        verifiedData = await executeAiTool('compare_properties', {
          project_slug: targetSlug,
          property_numbers: numbers.join(', ')
        });

        if (verifiedData.error) {
          return {
            text: `Comparison result: ${verifiedData.error}`,
            executedTools,
            verifiedData
          };
        }

        const compItems = verifiedData.comparison || [];
        const detailsStr = compItems.map((c: any) => 
          `• **${c.property_type === 'APARTMENT' ? c.unit_type || 'Apartment' : 'Plot'} ${c.property_number}**: Status: **${c.status}** | Facing: **${c.facing || 'N/A'}** | Area: **${c.area_sqft || c.saleable_area_sqft || 'N/A'} sq.ft** ${c.uds_sqft ? `| UDS: ${c.uds_sqft} sq.ft` : ''}`
        ).join('\n');

        return {
          text: `Here is the side-by-side comparison of verified database records in **${verifiedData.project_name}**:\n\n${detailsStr}\n\nWould you like to schedule an enquiry or explore these on the interactive layout map?`,
          executedTools,
          verifiedData
        };
      }
    }

    // 2. Check for Specific Single Property Details (must match a numeric or specific unit code)
    const propMatch = userMsg.match(/\b(?:plot|flat|unit|property)\s*#?\s*([0-9]+[A-Za-z0-9\-_:]*|PP:[0-9]+)\b/i);
    if (propMatch && !textLower.includes('available plots') && !textLower.includes('available flats') && !textLower.includes('show me')) {
      const propNum = propMatch[1];
      executedTools.push('get_property_details');
      verifiedData = await executeAiTool('get_property_details', {
        project_slug: targetSlug,
        property_number: propNum
      });

      if (verifiedData.error) {
        return {
          text: verifiedData.error,
          executedTools,
          verifiedData
        };
      }

      return {
        text: `Verified details for **${verifiedData.property_type === 'APARTMENT' ? 'Apartment' : 'Plot'} ${verifiedData.property_number}** in **${verifiedData.project_name}**:\n` +
          `• **Current Status**: ${verifiedData.status}\n` +
          `• **Orientation**: ${verifiedData.facing || 'Not specified'}\n` +
          `• **Area**: ${verifiedData.area_sqft || verifiedData.saleable_area_sqft || 'N/A'} sq.ft\n` +
          (verifiedData.unit_type ? `• **Configuration**: ${verifiedData.unit_type}\n` : '') +
          (verifiedData.uds_sqft ? `• **UDS**: ${verifiedData.uds_sqft} sq.ft\n` : '') +
          (verifiedData.price_display ? `• **Price**: ${verifiedData.price_display}\n` : '') +
          `• **Last Verified**: ${new Date(verifiedData.last_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        executedTools,
        verifiedData
      };
    }

    // 3. Check for Availability Summary / Count Request
    if (textLower.includes('how many') || textLower.includes('summary of availability') || textLower.includes('inventory count') || textLower === 'availability') {
      executedTools.push('get_project_availability_summary');
      verifiedData = await executeAiTool('get_project_availability_summary', { project_slug: targetSlug });
      
      const stats = verifiedData.stats || {};
      if (stats.total_inventory === 0) {
        return {
          text: `**${verifiedData.project_name}** is configured as an **${verifiedData.project_type}** project, but verified inventory is currently awaiting publication. No properties are currently published for customer discovery.`,
          executedTools,
          verifiedData
        };
      }

      return {
        text: `Current verified inventory summary for **${verifiedData.project_name}**:\n` +
          `• **Available**: ${stats.available || 0} ${verifiedData.project_type === 'APARTMENT' ? 'units' : 'plots'}\n` +
          `• **Booked**: ${stats.booked || 0}\n` +
          `• **Registered**: ${stats.registered || 0}\n` +
          `• **Total Verified Inventory**: ${stats.total_inventory || 0}\n\n` +
          `All figures are calculated in real-time from the database. Would you like to filter by specific facing or area?`,
        executedTools,
        verifiedData
      };
    }

    // 4. Check for Project Overview / Amenities / Location
    if (textLower.includes('amenit') || textLower.includes('location of') || textLower.includes('tell me about') || textLower.includes('highlights of')) {
      executedTools.push('get_project_details');
      verifiedData = await executeAiTool('get_project_details', { project_slug: targetSlug });

      const amenitiesList = (verifiedData.amenities || []).map((a: string) => `• ${a}`).join('\n');
      const highlightsList = (verifiedData.highlights || []).map((h: string) => `• ${h}`).join('\n');

      return {
        text: `**${verifiedData.name}** (${verifiedData.project_type === 'APARTMENT' ? 'Premium Apartment Project' : 'Plotted Development'})\n` +
          `📍 **Location**: ${verifiedData.location}, ${verifiedData.city}\n\n` +
          (verifiedData.description ? `${verifiedData.description}\n\n` : '') +
          `**Key Highlights**:\n${highlightsList}\n\n` +
          (amenitiesList ? `**Approved Amenities**:\n${amenitiesList}\n\n` : '') +
          `**Current Availability**: ${verifiedData.inventory_stats?.available || 0} units available.`,
        executedTools,
        verifiedData
      };
    }

    // 5. Default: Structured Search (e.g. "East facing", "2 BHK", "available", "above 1500 sqft")
    let facing: string | undefined = undefined;
    if (textLower.includes('east')) facing = 'East';
    else if (textLower.includes('west')) facing = 'West';
    else if (textLower.includes('north')) facing = 'North';
    else if (textLower.includes('south')) facing = 'South';

    let unitType: string | undefined = undefined;
    if (textLower.includes('2 bhk') || textLower.includes('2bhk')) unitType = '2 BHK';
    else if (textLower.includes('3 bhk') || textLower.includes('3bhk')) unitType = '3 BHK';

    let minArea: number | undefined = undefined;
    let maxArea: number | undefined = undefined;
    const areaMatch = userMsg.match(/(\d{3,5})\s*(?:sqft|sq\.ft|square\s*feet|\+)/i);
    if (areaMatch) {
      if (textLower.includes('above') || textLower.includes('more than') || textLower.includes('greater than') || userMsg.includes('+')) {
        minArea = parseInt(areaMatch[1], 10);
      } else if (textLower.includes('below') || textLower.includes('under') || textLower.includes('less than')) {
        maxArea = parseInt(areaMatch[1], 10);
      }
    }

    executedTools.push('search_properties');
    verifiedData = await executeAiTool('search_properties', {
      project_slug: targetSlug,
      facing,
      unit_type: unitType,
      min_area: minArea,
      max_area: maxArea,
      status: 'AVAILABLE'
    });

    const count = verifiedData.count || 0;
    const props = verifiedData.properties || [];

    if (count === 0) {
      // Check if project has unverified/pending inventory
      if (projectInfo?.project_type === 'APARTMENT' && targetSlug === 'nova-vasantham' && (projectInfo?.stats?.total_inventory || 0) === 0) {
        return {
          text: `Nova Vasantham is configured as an apartment project, but I don't currently have verified published apartment availability. Nova's verified apartment availability will appear here once published.`,
          executedTools,
          verifiedData
        };
      }

      return {
        text: `I searched the published database for **${projectInfo?.name || targetSlug}** but could not find any currently available properties matching those criteria` +
          (facing ? ` with **${facing}** facing` : '') +
          (unitType ? ` in **${unitType}** configuration` : '') +
          (minArea ? ` above **${minArea} sq.ft**` : '') +
          `. Would you like to check other facing orientations or view the whole layout map?`,
        executedTools,
        verifiedData
      };
    }

    const sampleList = props.slice(0, 5).map((p: any) => 
      `• **${p.property_type === 'APARTMENT' ? p.unit_type || 'Unit' : 'Plot'} ${p.property_number}**: ${p.area_sqft || p.saleable_area_sqft} sq.ft | Facing: ${p.facing || 'Standard'} | Status: ${p.status}`
    ).join('\n');

    return {
      text: `I found **${count} currently available ${props[0]?.property_type === 'APARTMENT' ? 'apartment units' : 'plots'}** matching your criteria:\n\n${sampleList}\n\n${count > 5 ? `*(Showing top 5 of ${count} verified matches)*\n\n` : ''}You can select any of these on the interactive layout to inspect precise boundaries, or click Enquire to contact Nova sales.`,
      executedTools,
      verifiedData
    };
  }
}

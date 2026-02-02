import OpenAI from 'openai';
import { aiCredentialsService } from './ai-credentials-service';
import { storage } from '../storage';
import { logger } from '../utils/logger';

import { broadcastToCompany } from '../utils/websocket';
import { aiFlowPerformanceMonitor } from '../utils/ai-flow-performance';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface FlowSuggestion {
  id: string;
  title: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    data: any;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
  }>;
  confidence: number;
  reasoning: string;
}

interface ChatRequest {
  message: string;
  flowId?: number;
  conversationHistory: ChatMessage[];
  companyId: number;
  userId: number;
  credentialSource?: 'auto' | 'company' | 'system';
}

interface ChatResponse {
  message: string;
  flowSuggestion?: FlowSuggestion;
  suggestions?: string[];
  error?: string;
}

class AIFlowAssistantService {
  private static instance: AIFlowAssistantService;

  static getInstance(): AIFlowAssistantService {
    if (!AIFlowAssistantService.instance) {
      AIFlowAssistantService.instance = new AIFlowAssistantService();
    }
    return AIFlowAssistantService.instance;
  }

  /**
   * Get OpenAI client with appropriate credentials based on source preference
   */
  private async getOpenAIClient(
    companyId: number,
    credentialSource: 'auto' | 'company' | 'system' = 'auto'
  ): Promise<OpenAI> {
    try {

      const credentialResult = await aiCredentialsService.getCredentialWithPreference(
        companyId,
        'openai',
        credentialSource
      );

      if (!credentialResult) {
        const errorMessages = {
          auto: 'No OpenAI API key configured. Please configure OpenAI credentials in the AI settings (Company or System level).',
          company: 'No company OpenAI credentials configured. Please set up company-specific OpenAI credentials in the AI settings.',
          system: 'No system OpenAI credentials configured. Please contact your administrator to configure system-level OpenAI credentials.'
        };

        throw new Error(errorMessages[credentialSource] || 'OpenAI API key not configured.');
      }

      logger.info('AIFlowAssistant', `Using ${credentialResult.type} credentials for OpenAI`, {
        companyId,
        credentialSource,
        credentialType: credentialResult.type
      });

      return new OpenAI({ apiKey: credentialResult.apiKey });
    } catch (error) {
      logger.error('AIFlowAssistant', 'Failed to get OpenAI credentials', error);
      throw error;
    }
  }

  /**
   * Process chat message and generate response
   */
  async processChat(request: ChatRequest): Promise<ChatResponse> {
    const timer = aiFlowPerformanceMonitor.startTiming(
      `chat-${Date.now()}`,
      'ai_chat_request',
      { companyId: request.companyId, userId: request.userId, messageLength: request.message.length }
    );

    try {
      const openai = await this.getOpenAIClient(
        request.companyId,
        request.credentialSource || 'auto'
      );


      const messages = await this.buildConversationContext(request);


      broadcastToCompany({
        type: 'ai_flow_assistant_typing',
        data: {
          userId: request.userId,
          isTyping: true
        }
      }, request.companyId);


      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_flow',
              description: 'Generate a complete PowerChat flow with intelligent node configuration and smart connections',
              parameters: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'A descriptive title for the flow'
                },
                description: {
                  type: 'string',
                  description: 'A brief description of what the flow does'
                },
                userDescription: {
                  type: 'string',
                  description: 'The original user description/request for context-aware configuration'
                },
                nodes: {
                  type: 'array',
                  description: 'Array of nodes in the flow',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string' },
                      label: { type: 'string' },
                      data: { type: 'object' },
                      position: {
                        type: 'object',
                        properties: {
                          x: { type: 'number' },
                          y: { type: 'number' }
                        }
                      }
                    }
                  }
                },
                edges: {
                  type: 'array',
                  description: 'Array of connections between nodes',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      source: { type: 'string' },
                      target: { type: 'string' },
                      type: { type: 'string' }
                    }
                  }
                },
                reasoning: {
                  type: 'string',
                  description: 'Explanation of why this flow structure was chosen'
                }
              },
              required: ['title', 'description', 'userDescription', 'nodes', 'edges', 'reasoning']
              }
            }
          }
        ],
        tool_choice: 'auto'
      });

      const choice = response.choices[0];
      let chatResponse: ChatResponse = {
        message: choice.message?.content || 'I apologize, but I couldn\'t generate a response.'
      };


      if (choice.message?.tool_calls?.[0]?.function?.name === 'generate_flow') {
        try {
          const functionArgs = JSON.parse(choice.message.tool_calls[0].function.arguments);
          const flowSuggestion = await this.createFlowSuggestion(functionArgs);
          chatResponse.flowSuggestion = flowSuggestion;
          

          chatResponse.message = `I've analyzed your requirements and generated a flow for you! 

**${flowSuggestion.title}**

${flowSuggestion.description}

The flow includes ${flowSuggestion.nodes.length} nodes with ${flowSuggestion.edges.length} connections. You can preview the details below and apply it to your flow builder when ready.

${flowSuggestion.reasoning}`;

        } catch (error) {
          logger.error('AIFlowAssistant', 'Error creating flow suggestion', error);
          chatResponse.message += '\n\nI had some trouble generating the flow structure, but I can still help you with guidance and suggestions.';
        }
      }


      await this.trackUsage(request.companyId, response.usage);


      broadcastToCompany({
        type: 'ai_flow_assistant_response',
        data: {
          userId: request.userId,
          response: chatResponse,
          hasFlowSuggestion: !!chatResponse.flowSuggestion
        }
      }, request.companyId);

      timer.end();
      return chatResponse;

    } catch (error) {
      timer.end(error instanceof Error ? error : new Error('Unknown error'));
      logger.error('AIFlowAssistant', 'Error processing chat', error);

      return {
        message: 'I apologize, but I\'m having trouble processing your request right now. Please try again in a moment.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build conversation context for OpenAI
   */
  private async buildConversationContext(request: ChatRequest): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const systemPrompt = await this.getSystemPrompt(request.flowId);
    
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];


    const recentHistory = request.conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.type === 'user') {
        messages.push({
          role: 'user',
          content: msg.content
        });
      } else if (msg.type === 'assistant') {
        messages.push({
          role: 'assistant',
          content: msg.content
        });
      }
    }


    messages.push({
      role: 'user',
      content: request.message
    });

    return messages;
  }

  /**
   * Get comprehensive system prompt with PowerChat knowledge
   */
  private async getSystemPrompt(flowId?: number): Promise<string> {
    let currentFlowContext = '';
    
    if (flowId) {
      try {
        const flow = await storage.getFlow(flowId);
        if (flow) {
          const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;
          const edgeCount = Array.isArray(flow.edges) ? flow.edges.length : 0;
          currentFlowContext = `\n\nCURRENT FLOW CONTEXT:
- Flow Name: ${flow.name}
- Description: ${flow.description || 'No description'}
- Status: ${flow.status}
- Current Nodes: ${nodeCount}
- Current Connections: ${edgeCount}
- Last Updated: ${flow.updatedAt}`;
        }
      } catch (error) {
        logger.warn('AIFlowAssistant', 'Could not load current flow context', error);
      }
    }

    return `You are an expert AI Flow Assistant for PowerChat, a sophisticated chatbot automation platform. Your role is to help users build, optimize, and understand conversational flows.

CORE CAPABILITIES:
1. **Flow Analysis**: Analyze user scenarios and recommend optimal node sequences
2. **Flow Generation**: Create complete flows with properly connected nodes
3. **Node Guidance**: Help configure individual nodes with appropriate settings
4. **Best Practices**: Suggest optimizations and industry best practices
5. **Troubleshooting**: Help debug and improve existing flows

POWERCHAT NODE TYPES & CAPABILITIES:

**Message Nodes:**
- message: Send text messages with variable support {{variable_name}}
- image: Send images with captions
- video: Send video files with descriptions
- audio: Send audio messages
- document: Send files and documents

**Interactive Nodes:**
- quickreply: Quick reply buttons with custom responses
- whatsapp_interactive_buttons: WhatsApp-specific interactive buttons
- whatsapp_poll: WhatsApp polls with multiple options
- whatsapp_flows: Advanced WhatsApp Flow forms and interactions

**Logic & Control:**
- condition: Conditional branching based on variables or user input
- wait: Add delays between messages
- trigger: Flow entry points with channel and condition filters
- bot_disable: Disable bot for human takeover
- bot_reset: Reset bot session and variables

**AI & Intelligence:**
- ai_assistant: GPT/OpenRouter integration with function calling
- translation: Multi-language translation capabilities
- data_capture: Capture and store user information

**Integrations:**
- webhook: Send HTTP requests to external services
- http_request: Make API calls with full configuration
- code_execution: Execute custom JavaScript code
- google_sheets: Read/write Google Sheets data
- shopify: E-commerce integration for Shopify
- woocommerce: WooCommerce integration
- update_pipeline_stage: CRM pipeline management (intelligently configured based on context: lead, qualified, proposal, negotiation, closed won/lost, follow up, demo scheduled, meeting scheduled)

**External Tools:**
- typebot: Typebot integration for advanced forms
- flowise: Flowise AI workflow integration
- n8n: n8n automation platform integration
- make: Make.com (Integromat) integration
- documind: Document AI processing
- chat_pdf: PDF chat and analysis

VARIABLE SYSTEM:
- Use {{variable_name}} syntax for dynamic content
- System variables: {{contact.name}}, {{contact.phone}}, {{message.content}}
- Flow variables: {{flow.id}}, {{session.id}}
- Custom variables can be set by data_capture, code_execution, and AI nodes

FLOW PATTERNS & BEST PRACTICES:
1. **Always start with a trigger node** for flow entry points
2. **Use conditions for branching logic** based on user responses
3. **Implement session management** for multi-step conversations
4. **Add wait nodes** between messages for natural pacing
5. **Use variables** for personalization and data flow
6. **Include error handling** with fallback responses
7. **Test flows thoroughly** before activation

WHEN GENERATING FLOWS:
- Create realistic node IDs (e.g., "trigger-1", "message-welcome", "condition-check")
- Position nodes logically (trigger at top, flow downward)
- Use appropriate spacing (150-200px between nodes)
- Connect nodes with proper edge relationships and handle specifications
- Include comprehensive node data/configuration with intelligent field population
- Always include a trigger node as the starting point
- Configure AI Assistant nodes with task execution when document/file sharing is mentioned
- Set up proper handle connections for task execution (e.g., task_document -> document node)
- Populate message content, button options, poll questions based on user description
- Configure conditional logic with appropriate variable checks and values
- Set up pipeline stage updates based on sales/CRM context (lead, qualified, proposal, etc.)
- Explain your reasoning for the chosen structure and configurations

RESPONSE GUIDELINES:
- Be helpful, clear, and actionable
- Provide specific examples and code snippets
- Suggest multiple approaches when applicable
- Always explain the "why" behind recommendations
- Use the generate_flow function when users want complete flows
- Ask clarifying questions for complex scenarios${currentFlowContext}

Remember: You're helping users build powerful automation flows. Focus on practical, implementable solutions that leverage PowerChat's full capabilities.`;
  }

  /**
   * Create flow suggestion from AI function call
   */
  private async createFlowSuggestion(functionArgs: any): Promise<FlowSuggestion> {
    const suggestionId = `flow-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;


    const enhancedNodes = await this.enhanceNodesWithIntelligentConfiguration(functionArgs.nodes, functionArgs.userDescription);


    const optimizedNodes = this.optimizeFlowStructure(enhancedNodes, functionArgs.userDescription);


    const enhancedEdges = this.createSmartNodeConnections(optimizedNodes, functionArgs.edges);


    const finalNodes = this.ensureTriggerNodeIntegration(optimizedNodes, functionArgs.userDescription);
    const finalEdges = this.updateEdgesForTriggerIntegration(finalNodes, enhancedEdges);


    const confidence = this.calculateFlowConfidence(finalNodes, finalEdges);

    return {
      id: suggestionId,
      title: functionArgs.title,
      description: functionArgs.description,
      nodes: finalNodes,
      edges: finalEdges,
      confidence,
      reasoning: functionArgs.reasoning
    };
  }

  /**
   * Calculate confidence score for flow suggestion
   */
  private calculateFlowConfidence(nodes: any[], edges: any[]): number {
    let confidence = 0.5; // Base confidence


    const hasTrigger = nodes.some(n => n.type === 'trigger');
    if (hasTrigger) confidence += 0.2;


    const connectionRatio = edges.length / Math.max(nodes.length - 1, 1);
    if (connectionRatio >= 0.8) confidence += 0.1;


    const uniqueTypes = new Set(nodes.map(n => n.type)).size;
    if (uniqueTypes >= 3) confidence += 0.1;


    const hasPositioning = nodes.every(n => n.position && n.position.x && n.position.y);
    if (hasPositioning) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Optimize flow structure by removing unnecessary nodes and improving logic
   */
  private optimizeFlowStructure(nodes: any[], userDescription: string): any[] {
    const description = userDescription.toLowerCase();
    let optimizedNodes = [...nodes];


    const aiAssistantNodes = optimizedNodes.filter(node =>
      (node.type === 'aiAssistant' || node.type === 'ai_assistant') &&
      node.data?.enableTaskExecution &&
      node.data?.tasks?.length > 0
    );

    if (aiAssistantNodes.length > 0) {

      const conditionNodes = optimizedNodes.filter(node => node.type === 'condition');

      for (const conditionNode of conditionNodes) {
        const conditionData = conditionNode.data;


        if (conditionData?.variable && conditionData?.operator && conditionData?.value) {
          const conditionValue = conditionData.value.toLowerCase();


          const hasRelevantTask = aiAssistantNodes.some(aiNode =>
            aiNode.data.tasks.some((task: any) => {
              const taskName = task.name.toLowerCase();
              const taskFunction = task.functionDefinition?.name?.toLowerCase() || '';


              if (conditionValue.includes('brochure') || conditionValue.includes('document')) {
                return taskName.includes('document') || taskFunction.includes('share_document');
              }


              if (conditionValue.includes('help') || conditionValue.includes('support')) {
                return true; // AI can handle general support queries
              }

              return false;
            })
          );

          if (hasRelevantTask) {

            optimizedNodes = optimizedNodes.filter(node => node.id !== conditionNode.id);
          }
        }
      }
    }


    if (description.includes('lead') || description.includes('pipeline') || description.includes('crm')) {
      optimizedNodes = this.reorderNodesForLeadCapture(optimizedNodes);
    }

    return optimizedNodes;
  }

  /**
   * Reorder nodes to ensure proper lead capture flow
   */
  private reorderNodesForLeadCapture(nodes: any[]): any[] {
    const reorderedNodes: any[] = [];


    const triggerNodes = nodes.filter(node => node.type === 'trigger');
    reorderedNodes.push(...triggerNodes);


    const aiNodes = nodes.filter(node =>
      (node.type === 'aiAssistant' || node.type === 'ai_assistant') &&
      !triggerNodes.includes(node)
    );
    reorderedNodes.push(...aiNodes);


    const documentNodes = nodes.filter(node =>
      node.type === 'document' &&
      !triggerNodes.includes(node) &&
      !aiNodes.includes(node)
    );
    reorderedNodes.push(...documentNodes);


    const pipelineNodes = nodes.filter(node =>
      (node.type === 'updatePipelineStage' || node.type === 'update_pipeline_stage') &&
      !triggerNodes.includes(node) &&
      !aiNodes.includes(node) &&
      !documentNodes.includes(node)
    );
    reorderedNodes.push(...pipelineNodes);


    const messageNodes = nodes.filter(node =>
      node.type === 'message' &&
      !triggerNodes.includes(node) &&
      !aiNodes.includes(node) &&
      !documentNodes.includes(node) &&
      !pipelineNodes.includes(node)
    );
    reorderedNodes.push(...messageNodes);


    const remainingNodes = nodes.filter(node => !reorderedNodes.includes(node));
    reorderedNodes.push(...remainingNodes);


    return reorderedNodes.map((node, index) => ({
      ...node,
      position: {
        x: 100 + (index % 3) * 300,
        y: 100 + Math.floor(index / 3) * 200
      }
    }));
  }

  /**
   * Track API usage for billing
   */
  private async trackUsage(companyId: number, usage: any): Promise<void> {
    try {
      if (usage) {
        await aiCredentialsService.trackUsage({
          companyId,
          credentialType: 'system',
          provider: 'openai',
          model: 'gpt-4o',
          tokensInput: usage.prompt_tokens || 0,
          tokensOutput: usage.completion_tokens || 0
        });
      }
    } catch (error) {
      logger.warn('AIFlowAssistant', 'Failed to track usage', error);
    }
  }

  /**
   * Intelligently configure nodes based on user description and context
   */
  private async enhanceNodesWithIntelligentConfiguration(nodes: any[], userDescription: string): Promise<any[]> {
    return nodes.map((node, index) => {
      const enhancedNode = {
        id: node.id || `node-${index}`,
        type: node.type,
        label: node.label,
        data: {
          label: node.label,
          ...this.configureNodeIntelligently(node, userDescription)
        },
        position: {
          x: node.position?.x || (index % 3) * 250 + 100,
          y: node.position?.y || Math.floor(index / 3) * 150 + 100
        }
      };

      return enhancedNode;
    });
  }

  /**
   * Configure individual nodes based on their type and user context
   */
  private configureNodeIntelligently(node: any, userDescription: string): any {
    const baseConfig = { ...node.data };

    switch (node.type) {
      case 'message':
        return this.configureMessageNode(baseConfig, userDescription, node.label);

      case 'aiAssistant':
      case 'ai_assistant':
        return this.configureAIAssistantNode(baseConfig, userDescription, node.label);

      case 'whatsapp_interactive_buttons':
      case 'whatsappInteractiveButtons':
        return this.configureWhatsAppButtonsNode(baseConfig, userDescription, node.label);

      case 'whatsapp_poll':
      case 'whatsappPoll':
        return this.configureWhatsAppPollNode(baseConfig, userDescription, node.label);

      case 'condition':
        return this.configureConditionNode(baseConfig, userDescription, node.label);

      case 'httpRequest':
      case 'http_request':
        return this.configureHTTPRequestNode(baseConfig, userDescription, node.label);

      case 'trigger':
        return this.configureTriggerNode(baseConfig, userDescription, node.label);

      case 'document':
        return this.configureDocumentNode(baseConfig, userDescription, node.label);

      case 'quickreply':
      case 'quickReply':
        return this.configureQuickReplyNode(baseConfig, userDescription, node.label);

      default:
        return baseConfig;
    }
  }

  /**
   * Configure Message Node with intelligent content population
   */
  private configureMessageNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.content) {

      const quotedTextMatch = userDescription.match(/"([^"]+)"|'([^']+)'/);
      if (quotedTextMatch) {
        config.content = quotedTextMatch[1] || quotedTextMatch[2];
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('welcome')) {
        config.content = "👋 Hello {{contact.name}}! Welcome to our service. How can I help you today?";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('thank')) {
        config.content = "Thank you for contacting us! We'll get back to you soon.";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('support')) {
        config.content = "🆘 Hi {{contact.name}}, I'm here to help! Please describe your issue and I'll assist you.";
      } else {

        config.content = this.generateContextualMessage(userDescription, nodeLabel);
      }
    }


    config.enableVariables = true;
    config.enableEmojis = true;

    return config;
  }

  /**
   * Configure AI Assistant Node with comprehensive intelligent configuration
   */
  private configureAIAssistantNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();


    if (!config.provider) {
      if (description.includes('openrouter') || description.includes('multiple models')) {
        config.provider = 'openrouter';
        config.model = 'openai/gpt-4o-mini';
      } else {
        config.provider = 'openai';
        config.model = 'gpt-4o';
      }
    }


    config.credentialSource = config.credentialSource || 'auto';


    if (!config.timezone) {
      config.timezone = 'UTC';
    }


    if (!config.prompt) {
      config.prompt = this.generateAIPrompt(userDescription, nodeLabel);
    }


    config.enableHistory = config.enableHistory !== false;
    if (!config.historyLimit) {
      if (description.includes('detailed') || description.includes('complex')) {
        config.historyLimit = 20;
      } else if (description.includes('simple') || description.includes('quick')) {
        config.historyLimit = 5;
      } else {
        config.historyLimit = 10;
      }
    }


    if (description.includes('voice') || description.includes('audio') || description.includes('speech')) {
      config.enableTextToSpeech = true;


      if (description.includes('elevenlabs') || description.includes('eleven labs')) {
        config.ttsProvider = 'elevenlabs';
        config.elevenLabsModel = 'eleven_monolingual_v1';
        config.elevenLabsStability = 0.5;
        config.elevenLabsSimilarityBoost = 0.75;
        config.elevenLabsStyle = 0.0;
        config.elevenLabsUseSpeakerBoost = true;
      } else {
        config.ttsProvider = 'openai';
        config.ttsVoice = 'alloy';
      }


      if (description.includes('always voice') || description.includes('voice only')) {
        config.voiceResponseMode = 'always';
      } else if (description.includes('never voice') || description.includes('text only')) {
        config.voiceResponseMode = 'never';
      } else {
        config.voiceResponseMode = 'auto';
      }


      if (!config.maxAudioDuration) {
        if (description.includes('long') || description.includes('detailed')) {
          config.maxAudioDuration = 300; // 5 minutes
        } else if (description.includes('short') || description.includes('brief')) {
          config.maxAudioDuration = 60; // 1 minute
        } else {
          config.maxAudioDuration = 120; // 2 minutes
        }
      }
    }


    if (description.includes('takeover') || description.includes('handoff') || description.includes('human')) {
      config.enableSessionTakeover = true;


      if (!config.stopKeyword) {
        if (description.includes('agent') || description.includes('human')) {
          config.stopKeyword = 'agent';
        } else if (description.includes('help') || description.includes('support')) {
          config.stopKeyword = 'help';
        } else {
          config.stopKeyword = 'stop';
        }
      }


      if (!config.exitOutputHandle) {
        config.exitOutputHandle = 'takeover';
      }
    }


    if (this.shouldEnableTaskExecution(userDescription, nodeLabel)) {
      config.enableTaskExecution = true;


      if (!config.tasks || config.tasks.length === 0) {
        config.tasks = this.generateAdvancedTaskDefinitions(userDescription, nodeLabel);
      } else {

        config.tasks = this.enhanceExistingTasks(config.tasks, userDescription, nodeLabel);
      }
    }


    if (description.includes('calendar') || description.includes('appointment') || description.includes('schedule')) {
      if (description.includes('google') || !description.includes('zoho')) {
        config.enableGoogleCalendar = true;
        config.calendarBusinessHours = {
          start: '09:00',
          end: '17:00'
        };
        config.calendarDefaultDuration = 30;
        config.calendarTimeZone = config.timezone || 'UTC';
        config.calendarFunctions = this.generateCalendarFunctions('google', userDescription);
      }
    }


    if (description.includes('zoho calendar') || (description.includes('zoho') && description.includes('calendar'))) {
      config.enableZohoCalendar = true;
      config.zohoCalendarBusinessHours = {
        start: '09:00',
        end: '17:00'
      };
      config.zohoCalendarDefaultDuration = 30;
      config.zohoCalendarTimeZone = config.timezone || 'UTC';
      config.zohoCalendarFunctions = this.generateCalendarFunctions('zoho', userDescription);
    }


    if (description.includes('support') || description.includes('help') || description.includes('knowledge')) {
      config.knowledgeBaseEnabled = true;

      if (!config.knowledgeBaseConfig) {
        config.knowledgeBaseConfig = {
          maxRetrievedChunks: 3,
          similarityThreshold: 0.7,
          contextPosition: 'before_system',
          contextTemplate: 'Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user\'s question using this information when relevant.'
        };
      }


      if (description.includes('detailed') || description.includes('comprehensive')) {
        config.knowledgeBaseConfig.maxRetrievedChunks = 5;
        config.knowledgeBaseConfig.similarityThreshold = 0.6;
      } else if (description.includes('quick') || description.includes('brief')) {
        config.knowledgeBaseConfig.maxRetrievedChunks = 2;
        config.knowledgeBaseConfig.similarityThreshold = 0.8;
      }


      if (description.includes('context after') || description.includes('after system')) {
        config.knowledgeBaseConfig.contextPosition = 'after_system';
      } else if (description.includes('context before user') || description.includes('before user')) {
        config.knowledgeBaseConfig.contextPosition = 'before_user';
      }
    }

    return config;
  }

  /**
   * Configure WhatsApp Interactive Buttons Node
   */
  private configureWhatsAppButtonsNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.message) {
      config.message = "Please choose an option:";
    }


    if (!config.buttons || config.buttons.length === 0) {
      config.buttons = this.generateButtonOptions(userDescription, nodeLabel);
    }

    config.maxButtons = 3; // WhatsApp limit

    return config;
  }

  /**
   * Configure WhatsApp Poll Node
   */
  private configureWhatsAppPollNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.question) {
      config.question = "Please vote on your preference:";
    }


    if (!config.options || config.options.length === 0) {
      config.options = this.generatePollOptions(userDescription, nodeLabel);
    }

    config.selectableCount = config.selectableCount || 1;

    return config;
  }

  /**
   * Configure Condition Node with intelligent logic
   */
  private configureConditionNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    config.conditionType = config.conditionType || 'contains';


    if (!config.conditionValue) {
      config.conditionValue = this.generateConditionValue(userDescription, nodeLabel);
    }


    if (!config.variableName) {
      config.variableName = 'user_message';
    }

    return config;
  }

  /**
   * Configure HTTP Request Node
   */
  private configureHTTPRequestNode(baseConfig: any, userDescription: string, _nodeLabel: string): any {
    const config = { ...baseConfig };


    config.method = config.method || 'POST';


    if (!config.url && userDescription.includes('webhook')) {
      config.url = 'https://your-webhook-url.com/endpoint';
      config.headers = {
        'Content-Type': 'application/json'
      };
      config.body = JSON.stringify({
        message: '{{user_message}}',
        contact: '{{contact.name}}',
        phone: '{{contact.phone}}'
      });
    }

    return config;
  }

  /**
   * Configure Message Trigger
   */
  private configureTriggerNode(baseConfig: any, userDescription: string, _nodeLabel: string): any {
    const config = { ...baseConfig };


    config.channelTypes = config.channelTypes || ['whatsapp_unofficial'];


    if (userDescription.toLowerCase().includes('support') || userDescription.toLowerCase().includes('help')) {
      config.conditionType = 'contains';
      config.conditionValue = 'help,support,issue,problem';
    } else if (userDescription.toLowerCase().includes('sales') || userDescription.toLowerCase().includes('buy')) {
      config.conditionType = 'contains';
      config.conditionValue = 'price,buy,purchase,product,service';
    } else {
      config.conditionType = 'any';
      config.conditionValue = '';
    }


    config.enableSessionPersistence = true;
    config.sessionTimeout = 30;
    config.sessionTimeoutUnit = 'minutes';

    return config;
  }

  /**
   * Configure Document Node
   */
  private configureDocumentNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.caption) {
      if (nodeLabel && nodeLabel.toLowerCase().includes('brochure')) {
        config.caption = "📄 Here's our company brochure with all the information you need!";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('manual')) {
        config.caption = "📖 Here's the user manual you requested.";
      } else {
        config.caption = "📎 Here's the document you requested.";
      }
    }


    config.documentType = this.extractDocumentType(userDescription, nodeLabel);

    return config;
  }

  /**
   * Configure Quick Reply Node
   */
  private configureQuickReplyNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.message) {
      config.message = "Please select an option:";
    }


    if (!config.options || config.options.length === 0) {
      config.options = this.generateQuickReplyOptions(userDescription, nodeLabel);
    }

    return config;
  }

  /**
   * Configure Pipeline Stage Node with comprehensive intelligent configuration
   */
  private configurePipelineStageNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();


    if (!config.operation) {
      if (description.includes('create stage') || description.includes('new stage')) {
        config.operation = 'create_stage';
      } else if (description.includes('create deal') || description.includes('new deal')) {
        config.operation = 'create_deal';
      } else if (description.includes('update deal') || description.includes('modify deal')) {
        config.operation = 'update_deal';
      } else if (description.includes('tag') || description.includes('label')) {
        config.operation = 'manage_tags';
      } else {
        config.operation = 'update_stage';
      }
    }


    if (!config.dealIdVariable) {
      config.dealIdVariable = '{{contact.phone}}';
    }


    if (!config.stageId && config.operation !== 'create_stage') {

      if (description.includes('lead') || label.includes('lead') || description.includes('prospect')) {
        config.stageName = 'Lead';
        config.stageColor = '#3b82f6';
      } else if (description.includes('qualified') || label.includes('qualified') || description.includes('qualify')) {
        config.stageName = 'Qualified Lead';
        config.stageColor = '#10b981';
      } else if (description.includes('proposal') || label.includes('proposal') || description.includes('quote')) {
        config.stageName = 'Proposal Sent';
        config.stageColor = '#f59e0b';
      } else if (description.includes('negotiation') || label.includes('negotiation') || description.includes('negotiate')) {
        config.stageName = 'In Negotiation';
        config.stageColor = '#ef4444';
      } else if (description.includes('closed') || label.includes('closed') || description.includes('won') || description.includes('deal')) {
        config.stageName = 'Closed Won';
        config.stageColor = '#22c55e';
      } else if (description.includes('lost') || label.includes('lost') || description.includes('rejected')) {
        config.stageName = 'Closed Lost';
        config.stageColor = '#6b7280';
      } else if (description.includes('follow') || label.includes('follow') || description.includes('nurture')) {
        config.stageName = 'Follow Up';
        config.stageColor = '#8b5cf6';
      } else if (description.includes('demo') || label.includes('demo') || description.includes('presentation')) {
        config.stageName = 'Demo Scheduled';
        config.stageColor = '#06b6d4';
      } else if (description.includes('meeting') || label.includes('meeting') || description.includes('appointment')) {
        config.stageName = 'Meeting Scheduled';
        config.stageColor = '#ec4899';
      } else {

        config.stageName = 'New Lead';
        config.stageColor = '#3b82f6';
      }
    }


    if (!config.createDealIfNotExists) {
      config.createDealIfNotExists = description.includes('create') || description.includes('new') || config.operation === 'create_deal';
    }


    if (!config.dealTitle && (config.operation === 'create_deal' || config.createDealIfNotExists)) {
      if (description.includes('product') || description.includes('service')) {
        config.dealTitle = '{{contact.name}} - Product Inquiry';
      } else if (description.includes('consultation') || description.includes('consult')) {
        config.dealTitle = '{{contact.name}} - Consultation Request';
      } else if (description.includes('demo') || description.includes('trial')) {
        config.dealTitle = '{{contact.name}} - Demo Request';
      } else {
        config.dealTitle = '{{contact.name}} - Sales Opportunity';
      }
    }


    if (!config.dealValue) {
      const dealValueMatch = description.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (dealValueMatch) {
        config.dealValue = dealValueMatch[0];
      } else if (description.includes('high value') || description.includes('enterprise')) {
        config.dealValue = '{{deal.estimated_value}}';
      }
    }


    if (!config.dealPriority) {
      if (description.includes('urgent') || description.includes('asap') || description.includes('high priority')) {
        config.dealPriority = 'high';
      } else if (description.includes('low priority') || description.includes('later')) {
        config.dealPriority = 'low';
      } else {
        config.dealPriority = 'medium';
      }
    }


    if (!config.dealDescription && (config.operation === 'create_deal' || config.createDealIfNotExists)) {
      if (description.includes('interested in')) {
        config.dealDescription = 'Customer expressed interest during automated conversation';
      } else if (description.includes('requested')) {
        config.dealDescription = 'Customer made a specific request via chat';
      } else {
        config.dealDescription = 'Deal created automatically from conversation flow';
      }
    }


    if (!config.dealDueDate) {
      if (description.includes('week') || description.includes('7 days')) {
        config.dealDueDate = '{{date.add_days(7)}}';
      } else if (description.includes('month') || description.includes('30 days')) {
        config.dealDueDate = '{{date.add_days(30)}}';
      } else if (description.includes('quarter') || description.includes('90 days')) {
        config.dealDueDate = '{{date.add_days(90)}}';
      }
    }


    if (config.operation === 'manage_tags' || description.includes('tag')) {
      if (!config.tagsToAdd) {
        config.tagsToAdd = [];


        if (description.includes('hot lead') || description.includes('interested')) {
          config.tagsToAdd.push('hot-lead');
        }
        if (description.includes('qualified') || description.includes('budget')) {
          config.tagsToAdd.push('qualified');
        }
        if (description.includes('demo') || description.includes('trial')) {
          config.tagsToAdd.push('demo-requested');
        }
        if (description.includes('enterprise') || description.includes('large')) {
          config.tagsToAdd.push('enterprise');
        }
        if (description.includes('urgent') || description.includes('priority')) {
          config.tagsToAdd.push('high-priority');
        }
      }

      if (!config.tagsToRemove) {
        config.tagsToRemove = [];


        if (description.includes('not interested') || description.includes('cold')) {
          config.tagsToRemove.push('hot-lead');
        }
        if (description.includes('unqualified') || description.includes('no budget')) {
          config.tagsToRemove.push('qualified');
        }
      }
    }


    if (!config.enableAdvancedOptions) {
      config.enableAdvancedOptions = description.includes('advanced') || description.includes('custom');
    }

    if (!config.createStageIfNotExists) {
      config.createStageIfNotExists = description.includes('create stage') || description.includes('new stage');
    }


    if (!config.errorHandling) {
      if (description.includes('stop on error') || description.includes('halt')) {
        config.errorHandling = 'stop';
      } else {
        config.errorHandling = 'continue';
      }
    }


    config.showAdvanced = config.enableAdvancedOptions || false;
    config.showTagManagement = config.operation === 'manage_tags' || (config.tagsToAdd && config.tagsToAdd.length > 0);
    config.showDealCreation = config.operation === 'create_deal' || config.createDealIfNotExists;

    return config;
  }

  /**
   * Helper functions for intelligent content generation
   */

  private generateContextualMessage(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('welcome') || label.includes('welcome')) {
      return "👋 Hello {{contact.name}}! Welcome to our service. How can I help you today?";
    } else if (description.includes('support') || label.includes('support')) {
      return "🆘 Hi {{contact.name}}, I'm here to help! Please describe your issue and I'll assist you.";
    } else if (description.includes('thank') || label.includes('thank')) {
      return "Thank you for contacting us! We appreciate your interest and will get back to you soon.";
    } else if (description.includes('goodbye') || label.includes('goodbye')) {
      return "Thank you for using our service! Have a great day! 👋";
    } else {
      return "Hello {{contact.name}}! How can I assist you today?";
    }
  }

  private generateAIPrompt(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('support') || label.includes('support')) {
      return `You are a helpful customer support assistant. Your role is to:
- Provide accurate and helpful information
- Be empathetic and understanding
- Ask clarifying questions when needed
- Escalate complex issues to human agents when appropriate
- Always maintain a professional and friendly tone

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    } else if (description.includes('sales') || label.includes('sales')) {
      return `You are a knowledgeable sales assistant. Your role is to:
- Help customers understand our products and services
- Provide pricing information when available
- Qualify leads and understand customer needs
- Schedule appointments or demos when appropriate
- Always be helpful and not pushy

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    } else {
      return `You are a helpful AI assistant. Your role is to:
- Provide accurate and helpful information
- Be friendly and professional
- Ask clarifying questions when needed
- Assist customers with their inquiries

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    }
  }

  private shouldEnableTaskExecution(userDescription: string, nodeLabel: string): boolean {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    return description.includes('document') ||
           description.includes('brochure') ||
           description.includes('file') ||
           description.includes('send') ||
           label.includes('document') ||
           label.includes('brochure') ||
           label.includes('task');
  }

  private generateTaskDefinitions(userDescription: string, _nodeLabel: string): any[] {
    const tasks = [];
    const description = userDescription.toLowerCase();

    if (description.includes('document') || description.includes('brochure') || description.includes('file')) {
      tasks.push({
        id: `task-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }

    return tasks;
  }

  /**
   * Generate advanced task definitions with comprehensive function calling
   */
  private generateAdvancedTaskDefinitions(userDescription: string, _nodeLabel: string): any[] {
    const tasks = [];
    const description = userDescription.toLowerCase();


    if (description.includes('document') || description.includes('brochure') || description.includes('file')) {
      tasks.push({
        id: `task-document-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              },
              urgency: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Urgency level of the request'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }


    if (description.includes('contact') || description.includes('information') || description.includes('details')) {
      tasks.push({
        id: `task-contact-${Date.now()}`,
        name: 'Collect Contact Info',
        description: 'When user provides or requests contact information',
        functionDefinition: {
          name: 'collect_contact_info',
          description: 'Collect and process contact information from the user',
          parameters: {
            type: 'object',
            properties: {
              info_type: {
                type: 'string',
                enum: ['email', 'phone', 'address', 'company', 'name'],
                description: 'Type of contact information'
              },
              value: {
                type: 'string',
                description: 'The contact information value'
              },
              verified: {
                type: 'boolean',
                description: 'Whether the information has been verified'
              }
            },
            required: ['info_type', 'value']
          }
        },
        outputHandle: 'task_contact',
        enabled: true
      });
    }


    if (description.includes('appointment') || description.includes('booking') || description.includes('schedule')) {
      tasks.push({
        id: `task-appointment-${Date.now()}`,
        name: 'Book Appointment',
        description: 'When user wants to book an appointment or schedule a meeting',
        functionDefinition: {
          name: 'book_appointment',
          description: 'Book an appointment or schedule a meeting with the user',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Preferred date for the appointment (YYYY-MM-DD)'
              },
              time: {
                type: 'string',
                description: 'Preferred time for the appointment (HH:MM)'
              },
              duration: {
                type: 'number',
                description: 'Duration in minutes'
              },
              purpose: {
                type: 'string',
                description: 'Purpose or type of appointment'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'urgent'],
                description: 'Priority level of the appointment'
              }
            },
            required: ['date', 'time', 'purpose']
          }
        },
        outputHandle: 'task_appointment',
        enabled: true
      });
    }


    if (description.includes('qualify') || description.includes('lead') || description.includes('sales')) {
      tasks.push({
        id: `task-qualify-${Date.now()}`,
        name: 'Qualify Lead',
        description: 'When user shows interest and needs to be qualified as a lead',
        functionDefinition: {
          name: 'qualify_lead',
          description: 'Qualify the user as a potential lead based on their responses',
          parameters: {
            type: 'object',
            properties: {
              interest_level: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'very_high'],
                description: 'Level of interest shown by the user'
              },
              budget_range: {
                type: 'string',
                description: 'Budget range mentioned by the user'
              },
              timeline: {
                type: 'string',
                description: 'Timeline for making a decision'
              },
              decision_maker: {
                type: 'boolean',
                description: 'Whether the user is the decision maker'
              },
              pain_points: {
                type: 'array',
                items: { type: 'string' },
                description: 'Pain points or challenges mentioned by the user'
              }
            },
            required: ['interest_level']
          }
        },
        outputHandle: 'task_qualify',
        enabled: true
      });
    }

    return tasks;
  }

  /**
   * Enhance existing tasks while preserving their output handles and core configuration
   */
  private enhanceExistingTasks(existingTasks: any[], userDescription: string, _nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();



    const enhancedTasks = [...existingTasks];


    const hasDocumentTask = existingTasks.some(task =>
      task.name.toLowerCase().includes('document') ||
      task.functionDefinition?.name?.includes('share_document')
    );

    const hasLeadTask = existingTasks.some(task =>
      task.name.toLowerCase().includes('qualify') ||
      task.name.toLowerCase().includes('lead') ||
      task.functionDefinition?.name?.includes('qualify_lead')
    );

    const hasContactTask = existingTasks.some(task =>
      task.name.toLowerCase().includes('contact') ||
      task.functionDefinition?.name?.includes('collect_contact_info')
    );


    if (!hasDocumentTask && (description.includes('document') || description.includes('brochure') || description.includes('file'))) {
      enhancedTasks.push({
        id: `task-document-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }

    if (!hasLeadTask && (description.includes('qualify') || description.includes('lead') || description.includes('pipeline'))) {
      enhancedTasks.push({
        id: `task-qualify-${Date.now()}`,
        name: 'Qualify Lead',
        description: 'When user shows interest and needs to be qualified as a lead',
        functionDefinition: {
          name: 'qualify_lead',
          description: 'Qualify the user as a potential lead based on their responses',
          parameters: {
            type: 'object',
            properties: {
              interest_level: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'very_high'],
                description: 'Level of interest shown by the user'
              },
              budget_range: {
                type: 'string',
                description: 'Budget range mentioned by the user'
              },
              timeline: {
                type: 'string',
                description: 'Timeline for making a decision'
              }
            },
            required: ['interest_level']
          }
        },
        outputHandle: 'task_qualify',
        enabled: true
      });
    }

    if (!hasContactTask && (description.includes('contact') || description.includes('information') || description.includes('capture'))) {
      enhancedTasks.push({
        id: `task-contact-${Date.now()}`,
        name: 'Collect Contact Info',
        description: 'When user provides or requests contact information',
        functionDefinition: {
          name: 'collect_contact_info',
          description: 'Collect and process contact information from the user',
          parameters: {
            type: 'object',
            properties: {
              info_type: {
                type: 'string',
                enum: ['email', 'phone', 'address', 'company', 'name'],
                description: 'Type of contact information'
              },
              value: {
                type: 'string',
                description: 'The contact information value'
              }
            },
            required: ['info_type', 'value']
          }
        },
        outputHandle: 'task_contact',
        enabled: true
      });
    }

    return enhancedTasks;
  }

  /**
   * Generate calendar function definitions
   */
  private generateCalendarFunctions(provider: 'google' | 'zoho', userDescription: string): any[] {
    const functions = [];
    const description = userDescription.toLowerCase();
    const prefix = provider === 'zoho' ? 'zoho_' : '';


    functions.push({
      id: `${provider}_check_availability_${Date.now()}`,
      name: `Check ${provider === 'zoho' ? 'Zoho ' : ''}Availability`,
      description: `Check available time slots in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
      functionDefinition: {
        name: `${prefix}check_availability`,
        description: `Check available time slots in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar for scheduling appointments`,
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check availability for (YYYY-MM-DD format)'
            },
            duration_minutes: {
              type: 'number',
              description: 'Duration of the appointment in minutes',
              default: 30
            },
            start_time: {
              type: 'string',
              description: 'Earliest time to consider (HH:MM format)',
              default: '09:00'
            },
            end_time: {
              type: 'string',
              description: 'Latest time to consider (HH:MM format)',
              default: '17:00'
            }
          },
          required: ['date']
        }
      },
      outputHandle: `${prefix}availability`,
      enabled: true
    });


    if (description.includes('book') || description.includes('schedule') || description.includes('appointment')) {
      functions.push({
        id: `${provider}_book_appointment_${Date.now()}`,
        name: `Book ${provider === 'zoho' ? 'Zoho ' : ''}Appointment`,
        description: `Book an appointment in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
        functionDefinition: {
          name: `${prefix}book_appointment`,
          description: `Book an appointment in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the appointment'
              },
              date: {
                type: 'string',
                description: 'Date of the appointment (YYYY-MM-DD format)'
              },
              start_time: {
                type: 'string',
                description: 'Start time of the appointment (HH:MM format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: 30
              },
              description: {
                type: 'string',
                description: 'Description or notes for the appointment'
              },
              attendee_email: {
                type: 'string',
                description: 'Email of the attendee (optional)'
              }
            },
            required: ['title', 'date', 'start_time']
          }
        },
        outputHandle: `${prefix}appointment`,
        enabled: true
      });
    }


    if (description.includes('list') || description.includes('show') || description.includes('events')) {
      functions.push({
        id: `${provider}_list_events_${Date.now()}`,
        name: `List ${provider === 'zoho' ? 'Zoho ' : ''}Events`,
        description: `List events from ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
        functionDefinition: {
          name: `${prefix}list_events`,
          description: `List events from ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for listing events (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for listing events (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date']
          }
        },
        outputHandle: `${prefix}events`,
        enabled: true
      });
    }

    return functions;
  }

  private generateButtonOptions(userDescription: string, _nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();

    if (description.includes('support')) {
      return [
        { id: 'technical', text: 'Technical Issue', value: 'technical' },
        { id: 'billing', text: 'Billing Question', value: 'billing' },
        { id: 'general', text: 'General Inquiry', value: 'general' }
      ];
    } else if (description.includes('sales')) {
      return [
        { id: 'pricing', text: 'Pricing Info', value: 'pricing' },
        { id: 'demo', text: 'Request Demo', value: 'demo' },
        { id: 'contact', text: 'Contact Sales', value: 'contact' }
      ];
    } else {
      return [
        { id: 'yes', text: 'Yes', value: 'yes' },
        { id: 'no', text: 'No', value: 'no' },
        { id: 'more_info', text: 'More Info', value: 'more_info' }
      ];
    }
  }

  private generatePollOptions(userDescription: string, _nodeLabel: string): string[] {
    const description = userDescription.toLowerCase();

    if (description.includes('satisfaction') || description.includes('feedback')) {
      return ['Excellent', 'Good', 'Average', 'Poor'];
    } else if (description.includes('preference')) {
      return ['Option A', 'Option B', 'Option C'];
    } else {
      return ['Yes', 'No', 'Maybe'];
    }
  }

  private generateConditionValue(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('support') || label.includes('support')) {
      return 'help,support,issue,problem';
    } else if (description.includes('sales') || label.includes('sales')) {
      return 'price,buy,purchase,product,service';
    } else if (description.includes('yes') || label.includes('yes')) {
      return 'yes,sure,okay,ok';
    } else if (description.includes('no') || label.includes('no')) {
      return 'no,nope,cancel,stop';
    } else {
      return '';
    }
  }

  private extractDocumentType(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('brochure') || label.includes('brochure')) {
      return 'brochure';
    } else if (description.includes('manual') || label.includes('manual')) {
      return 'manual';
    } else if (description.includes('catalog') || label.includes('catalog')) {
      return 'catalog';
    } else if (description.includes('pdf') || label.includes('pdf')) {
      return 'pdf';
    } else {
      return 'document';
    }
  }

  private generateQuickReplyOptions(userDescription: string, _nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();

    if (description.includes('support')) {
      return [
        { id: 'technical', text: 'Technical Issue' },
        { id: 'billing', text: 'Billing' },
        { id: 'general', text: 'General' }
      ];
    } else if (description.includes('satisfaction')) {
      return [
        { id: 'excellent', text: 'Excellent' },
        { id: 'good', text: 'Good' },
        { id: 'poor', text: 'Poor' }
      ];
    } else {
      return [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
        { id: 'maybe', text: 'Maybe' }
      ];
    }
  }

  /**
   * Create smart connections between nodes based on logical flow
   */
  private createSmartNodeConnections(nodes: any[], originalEdges: any[]): any[] {
    const edges = [...originalEdges];


    for (let i = 0; i < nodes.length - 1; i++) {
      const currentNode = nodes[i];
      const nextNode = nodes[i + 1];


      const existingEdge = edges.find(edge =>
        edge.source === currentNode.id && edge.target === nextNode.id
      );

      if (!existingEdge) {

        const connection = this.createSmartConnection(currentNode, nextNode);
        if (connection) {
          edges.push(connection);
        }
      }
    }


    this.addAIAssistantTaskConnections(nodes, edges);

    return edges.map((edge, index) => ({
      id: edge.id || `edge-${index}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type || 'smoothstep',
      animated: true
    }));
  }

  /**
   * Create intelligent connection between two nodes
   */
  private createSmartConnection(sourceNode: any, targetNode: any): any | null {
    const sourceType = sourceNode.type;
    const targetType = targetNode.type;


    if ((sourceType === 'aiAssistant' || sourceType === 'ai_assistant') && targetType === 'document') {
      const aiConfig = sourceNode.data;
      if (aiConfig.enableTaskExecution && aiConfig.tasks?.length > 0) {
        const documentTask = aiConfig.tasks.find((task: any) =>
          task.name.toLowerCase().includes('document') ||
          task.name.toLowerCase().includes('share')
        );

        if (documentTask) {
          return {
            id: `${sourceNode.id}-${targetNode.id}`,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: documentTask.outputHandle || 'task_document',
            targetHandle: 'target'
          };
        }
      }
    }


    if (sourceType === 'condition') {
      return {
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: 'true', // Default to true branch
        targetHandle: 'target'
      };
    }


    if (['whatsapp_interactive_buttons', 'whatsappInteractiveButtons', 'quickreply', 'quickReply'].includes(sourceType)) {
      return {
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: 'default',
        targetHandle: 'target'
      };
    }


    return {
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: 'source',
      targetHandle: 'target'
    };
  }

  /**
   * Add special connections for AI Assistant task execution
   */
  private addAIAssistantTaskConnections(nodes: any[], edges: any[]): void {
    const aiNodes = nodes.filter(node =>
      node.type === 'aiAssistant' || node.type === 'ai_assistant'
    );

    for (const aiNode of aiNodes) {
      const aiConfig = aiNode.data;
      if (aiConfig.enableTaskExecution && aiConfig.tasks?.length > 0) {
        for (const task of aiConfig.tasks) {

          const targetNodes = nodes.filter(node => {
            if (task.name.toLowerCase().includes('document') && node.type === 'document') {
              return true;
            }
            if (task.name.toLowerCase().includes('message') && node.type === 'message') {
              return true;
            }
            return false;
          });


          for (const targetNode of targetNodes) {
            const existingEdge = edges.find(edge =>
              edge.source === aiNode.id &&
              edge.target === targetNode.id &&
              edge.sourceHandle === task.outputHandle
            );

            if (!existingEdge) {
              edges.push({
                id: `${aiNode.id}-${targetNode.id}-${task.outputHandle}`,
                source: aiNode.id,
                target: targetNode.id,
                sourceHandle: task.outputHandle,
                targetHandle: 'target'
              });
            }
          }
        }
      }
    }
  }

  /**
   * Ensure every flow has a properly configured trigger node
   */
  private ensureTriggerNodeIntegration(nodes: any[], userDescription: string): any[] {

    const hasTrigger = nodes.some(node => node.type === 'trigger');

    if (hasTrigger) {
      return nodes;
    }


    const triggerNode = {
      id: 'trigger-start',
      type: 'trigger',
      label: 'Flow Trigger',
      data: this.configureTriggerNode({}, userDescription, 'Flow Trigger'),
      position: {
        x: 100,
        y: 50
      }
    };


    const adjustedNodes = nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + 150 // Move down to make room for trigger
      }
    }));

    return [triggerNode, ...adjustedNodes];
  }

  /**
   * Update edges to connect trigger node to the first logical node
   */
  private updateEdgesForTriggerIntegration(nodes: any[], edges: any[]): any[] {
    const triggerNode = nodes.find(node => node.type === 'trigger');
    if (!triggerNode) {
      return edges;
    }


    const firstProcessingNode = nodes.find(node =>
      node.type !== 'trigger' &&
      !edges.some(edge => edge.target === node.id)
    );

    if (firstProcessingNode) {

      const triggerEdge = {
        id: `${triggerNode.id}-${firstProcessingNode.id}`,
        source: triggerNode.id,
        target: firstProcessingNode.id,
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'smoothstep',
        animated: true
      };

      return [triggerEdge, ...edges];
    }

    return edges;
  }
}

/**
 * Flow Generation Engine
 * Advanced logic for creating optimized flows based on user requirements
 */
class FlowGenerationEngine {
  private static instance: FlowGenerationEngine;

  static getInstance(): FlowGenerationEngine {
    if (!FlowGenerationEngine.instance) {
      FlowGenerationEngine.instance = new FlowGenerationEngine();
    }
    return FlowGenerationEngine.instance;
  }

  /**
   * Generate flow based on scenario analysis
   */
  generateFlowFromScenario(scenario: {
    type: 'welcome' | 'support' | 'sales' | 'booking' | 'ecommerce' | 'custom';
    requirements: string[];
    channels: string[];
    complexity: 'simple' | 'medium' | 'complex';
    integrations?: string[];
  }): FlowSuggestion {
    const flowId = `generated-${Date.now()}`;

    switch (scenario.type) {
      case 'welcome':
        return this.generateWelcomeFlow(flowId, scenario);
      case 'support':
        return this.generateSupportFlow(flowId, scenario);
      case 'sales':
        return this.generateSalesFlow(flowId, scenario);
      case 'booking':
        return this.generateBookingFlow(flowId, scenario);
      case 'ecommerce':
        return this.generateEcommerceFlow(flowId, scenario);
      default:
        return this.generateCustomFlow(flowId, scenario);
    }
  }

  private generateWelcomeFlow(flowId: string, scenario: any): FlowSuggestion {
    const nodes = [
      {
        id: 'trigger-welcome',
        type: 'trigger',
        label: 'Message Trigger',
        data: {
          label: 'Message Trigger',
          channelTypes: scenario.channels || ['whatsapp_unofficial'],
          conditionType: 'any',
          conditionValue: '',
          enableSessionPersistence: true,
          sessionTimeout: 30,
          sessionTimeoutUnit: 'minutes'
        },
        position: { x: 250, y: 50 }
      },
      {
        id: 'message-welcome',
        type: 'message',
        label: 'Welcome Message',
        data: {
          label: 'Welcome Message',
          content: `👋 Hello {{contact.name}}! Welcome to our service.

How can we help you today?`
        },
        position: { x: 250, y: 200 }
      },
      {
        id: 'quickreply-menu',
        type: 'quickreply',
        label: 'Main Menu',
        data: {
          label: 'Main Menu',
          content: 'Please choose an option:',
          options: [
            { id: 'info', text: 'ℹ️ Information', value: 'info' },
            { id: 'support', text: '🆘 Support', value: 'support' },
            { id: 'contact', text: '📞 Contact Us', value: 'contact' }
          ]
        },
        position: { x: 250, y: 350 }
      }
    ];

    const edges = [
      {
        id: 'edge-trigger-welcome',
        source: 'trigger-welcome',
        target: 'message-welcome',
        type: 'smoothstep'
      },
      {
        id: 'edge-welcome-menu',
        source: 'message-welcome',
        target: 'quickreply-menu',
        type: 'smoothstep'
      }
    ];

    return {
      id: flowId,
      title: 'Welcome & Menu Flow',
      description: 'A friendly welcome sequence with main menu options',
      nodes,
      edges,
      confidence: 0.9,
      reasoning: 'This flow provides a warm welcome and clear navigation options for users. It uses session persistence and personalization with contact variables.'
    };
  }

  private generateSupportFlow(flowId: string, scenario: any): FlowSuggestion {
    const nodes = [
      {
        id: 'trigger-support',
        type: 'trigger',
        label: 'Support Request',
        data: {
          label: 'Support Request',
          channelTypes: scenario.channels || ['whatsapp_unofficial'],
          conditionType: 'contains',
          conditionValue: 'help,support,issue,problem',
          enableSessionPersistence: true
        },
        position: { x: 250, y: 50 }
      },
      {
        id: 'message-support-greeting',
        type: 'message',
        label: 'Support Greeting',
        data: {
          label: 'Support Greeting',
          content: `🆘 Hi {{contact.name}}, I'm here to help!

Let me gather some information to assist you better.`
        },
        position: { x: 250, y: 200 }
      },
      {
        id: 'data-capture-issue',
        type: 'data_capture',
        label: 'Capture Issue Details',
        data: {
          label: 'Capture Issue Details',
          fields: [
            {
              name: 'issue_type',
              label: 'What type of issue are you experiencing?',
              type: 'select',
              options: ['Technical', 'Billing', 'General Inquiry'],
              required: true
            },
            {
              name: 'issue_description',
              label: 'Please describe your issue:',
              type: 'text',
              required: true
            }
          ]
        },
        position: { x: 250, y: 350 }
      },
      {
        id: 'ai-assistant-support',
        type: 'ai_assistant',
        label: 'AI Support Assistant',
        data: {
          label: 'AI Support Assistant',
          provider: 'openai',
          model: 'gpt-4o',
          prompt: `You are a helpful customer support assistant. The customer has reported:
- Issue Type: {{issue_type}}
- Description: {{issue_description}}

Provide helpful, accurate support based on this information. If you cannot resolve the issue, offer to escalate to a human agent.`,
          enableHistory: true,
          historyLimit: 10
        },
        position: { x: 250, y: 500 }
      }
    ];

    const edges = [
      {
        id: 'edge-trigger-greeting',
        source: 'trigger-support',
        target: 'message-support-greeting',
        type: 'smoothstep'
      },
      {
        id: 'edge-greeting-capture',
        source: 'message-support-greeting',
        target: 'data-capture-issue',
        type: 'smoothstep'
      },
      {
        id: 'edge-capture-ai',
        source: 'data-capture-issue',
        target: 'ai-assistant-support',
        type: 'smoothstep'
      }
    ];

    return {
      id: flowId,
      title: 'AI-Powered Support Flow',
      description: 'Intelligent support flow with issue categorization and AI assistance',
      nodes,
      edges,
      confidence: 0.85,
      reasoning: 'This flow efficiently captures support issues and uses AI to provide intelligent responses. It includes proper data collection and can escalate to human agents when needed.'
    };
  }

  private generateSalesFlow(flowId: string, scenario: any): FlowSuggestion {
    const nodes = [
      {
        id: 'trigger-sales',
        type: 'trigger',
        label: 'Sales Inquiry',
        data: {
          label: 'Sales Inquiry',
          channelTypes: scenario.channels || ['whatsapp_unofficial'],
          conditionType: 'contains',
          conditionValue: 'price,buy,purchase,product,service',
          enableSessionPersistence: true
        },
        position: { x: 250, y: 50 }
      },
      {
        id: 'message-sales-intro',
        type: 'message',
        label: 'Sales Introduction',
        data: {
          label: 'Sales Introduction',
          content: `💼 Hello {{contact.name}}! Thanks for your interest in our products/services.

I'd love to help you find the perfect solution!`
        },
        position: { x: 250, y: 200 }
      },
      {
        id: 'data-capture-qualification',
        type: 'data_capture',
        label: 'Lead Qualification',
        data: {
          label: 'Lead Qualification',
          fields: [
            {
              name: 'company_size',
              label: 'What\'s your company size?',
              type: 'select',
              options: ['1-10', '11-50', '51-200', '200+'],
              required: true
            },
            {
              name: 'budget_range',
              label: 'What\'s your budget range?',
              type: 'select',
              options: ['Under $1K', '$1K-$5K', '$5K-$10K', '$10K+'],
              required: true
            },
            {
              name: 'timeline',
              label: 'When are you looking to implement?',
              type: 'select',
              options: ['Immediately', 'Within 1 month', '1-3 months', '3+ months'],
              required: true
            }
          ]
        },
        position: { x: 250, y: 350 }
      },
      {
        id: 'condition-qualified',
        type: 'condition',
        label: 'Check Qualification',
        data: {
          label: 'Check Qualification',
          conditions: [
            {
              variable: 'budget_range',
              operator: 'not_equals',
              value: 'Under $1K',
              output: 'qualified'
            }
          ],
          defaultOutput: 'not_qualified'
        },
        position: { x: 250, y: 500 }
      },
      {
        id: 'message-qualified',
        type: 'message',
        label: 'Qualified Lead Response',
        data: {
          label: 'Qualified Lead Response',
          content: `🎯 Perfect! Based on your requirements:
- Company Size: {{company_size}}
- Budget: {{budget_range}}
- Timeline: {{timeline}}

I'll connect you with our sales specialist who can provide a customized proposal. They'll reach out within 24 hours!`
        },
        position: { x: 100, y: 650 }
      },
      {
        id: 'message-not-qualified',
        type: 'message',
        label: 'Not Qualified Response',
        data: {
          label: 'Not Qualified Response',
          content: `Thanks for your interest! While our premium solutions might be outside your current budget, we have some great resources that might help:

📚 Free guides and templates
🎥 Educational webinars
📧 Newsletter with tips and insights

Would you like me to sign you up for our free resources?`
        },
        position: { x: 400, y: 650 }
      }
    ];

    const edges = [
      {
        id: 'edge-trigger-intro',
        source: 'trigger-sales',
        target: 'message-sales-intro',
        type: 'smoothstep'
      },
      {
        id: 'edge-intro-qualification',
        source: 'message-sales-intro',
        target: 'data-capture-qualification',
        type: 'smoothstep'
      },
      {
        id: 'edge-qualification-condition',
        source: 'data-capture-qualification',
        target: 'condition-qualified',
        type: 'smoothstep'
      },
      {
        id: 'edge-qualified-yes',
        source: 'condition-qualified',
        target: 'message-qualified',
        type: 'smoothstep',
        sourceHandle: 'qualified'
      },
      {
        id: 'edge-qualified-no',
        source: 'condition-qualified',
        target: 'message-not-qualified',
        type: 'smoothstep',
        sourceHandle: 'not_qualified'
      }
    ];

    return {
      id: flowId,
      title: 'Lead Qualification & Sales Flow',
      description: 'Intelligent sales flow with lead qualification and routing',
      nodes,
      edges,
      confidence: 0.88,
      reasoning: 'This flow efficiently qualifies leads based on key criteria and routes them appropriately. High-value leads get personal attention while others receive valuable resources.'
    };
  }

  private generateBookingFlow(flowId: string, _scenario: any): FlowSuggestion {

    return {
      id: flowId,
      title: 'Appointment Booking Flow',
      description: 'Complete appointment booking with calendar integration',
      nodes: [],
      edges: [],
      confidence: 0.8,
      reasoning: 'Booking flow implementation would include calendar integration and time slot selection.'
    };
  }

  private generateEcommerceFlow(flowId: string, _scenario: any): FlowSuggestion {

    return {
      id: flowId,
      title: 'E-commerce Order Flow',
      description: 'Product catalog and order processing flow',
      nodes: [],
      edges: [],
      confidence: 0.8,
      reasoning: 'E-commerce flow would include product browsing, cart management, and checkout process.'
    };
  }

  private generateCustomFlow(flowId: string, _scenario: any): FlowSuggestion {

    return {
      id: flowId,
      title: 'Custom Flow',
      description: 'Custom flow based on specific requirements',
      nodes: [],
      edges: [],
      confidence: 0.7,
      reasoning: 'Custom flow generated based on provided requirements and complexity level.'
    };
  }

  /**
   * Intelligently configure nodes based on user description and context
   */
  private async enhanceNodesWithIntelligentConfiguration(nodes: any[], userDescription: string): Promise<any[]> {
    return nodes.map((node, index) => {
      const enhancedNode = {
        id: node.id || `node-${index}`,
        type: node.type,
        label: node.label,
        data: {
          label: node.label,
          ...this.configureNodeIntelligently(node, userDescription)
        },
        position: {
          x: node.position?.x || (index % 3) * 250 + 100,
          y: node.position?.y || Math.floor(index / 3) * 150 + 100
        }
      };

      return enhancedNode;
    });
  }

  /**
   * Configure individual nodes based on their type and user context
   */
  private configureNodeIntelligently(node: any, userDescription: string): any {
    const baseConfig = { ...node.data };

    switch (node.type) {
      case 'message':
        return this.configureMessageNode(baseConfig, userDescription, node.label);

      case 'aiAssistant':
      case 'ai_assistant':
        return this.configureAIAssistantNode(baseConfig, userDescription, node.label);

      case 'whatsapp_interactive_buttons':
      case 'whatsappInteractiveButtons':
        return this.configureWhatsAppButtonsNode(baseConfig, userDescription, node.label);

      case 'whatsapp_poll':
      case 'whatsappPoll':
        return this.configureWhatsAppPollNode(baseConfig, userDescription, node.label);

      case 'condition':
        return this.configureConditionNode(baseConfig, userDescription, node.label);

      case 'httpRequest':
      case 'http_request':
        return this.configureHTTPRequestNode(baseConfig, userDescription, node.label);

      case 'trigger':
        return this.configureTriggerNode(baseConfig, userDescription, node.label);

      case 'document':
        return this.configureDocumentNode(baseConfig, userDescription, node.label);

      case 'quickreply':
      case 'quickReply':
        return this.configureQuickReplyNode(baseConfig, userDescription, node.label);

      case 'pipeline':
      case 'pipelineStage':
      case 'pipeline_stage':
        return this.configurePipelineStageNode(baseConfig, userDescription, node.label);

      default:
        return baseConfig;
    }
  }

  /**
   * Configure Message Node with intelligent content population
   */
  private configureMessageNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.content) {

      const quotedTextMatch = userDescription.match(/"([^"]+)"|'([^']+)'/);
      if (quotedTextMatch) {
        config.content = quotedTextMatch[1] || quotedTextMatch[2];
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('welcome')) {
        config.content = "👋 Hello {{contact.name}}! Welcome to our service. How can I help you today?";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('thank')) {
        config.content = "Thank you for contacting us! We'll get back to you soon.";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('support')) {
        config.content = "🆘 Hi {{contact.name}}, I'm here to help! Please describe your issue and I'll assist you.";
      } else {

        config.content = this.generateContextualMessage(userDescription, nodeLabel);
      }
    }


    config.enableVariables = true;
    config.enableEmojis = true;

    return config;
  }

  /**
   * Configure AI Assistant Node with comprehensive intelligent configuration
   */
  private configureAIAssistantNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();


    if (!config.provider) {
      if (description.includes('openrouter') || description.includes('multiple models')) {
        config.provider = 'openrouter';
        config.model = 'openai/gpt-4o-mini';
      } else {
        config.provider = 'openai';
        config.model = 'gpt-4o';
      }
    }


    config.credentialSource = config.credentialSource || 'auto';


    if (!config.timezone) {
      config.timezone = 'UTC';
    }


    if (!config.prompt) {
      config.prompt = this.generateAIPrompt(userDescription, nodeLabel);
    }


    config.enableHistory = config.enableHistory !== false;
    if (!config.historyLimit) {
      if (description.includes('detailed') || description.includes('complex')) {
        config.historyLimit = 20;
      } else if (description.includes('simple') || description.includes('quick')) {
        config.historyLimit = 5;
      } else {
        config.historyLimit = 10;
      }
    }


    if (description.includes('voice') || description.includes('audio') || description.includes('speech')) {
      config.enableTextToSpeech = true;


      if (description.includes('elevenlabs') || description.includes('eleven labs')) {
        config.ttsProvider = 'elevenlabs';
        config.elevenLabsModel = 'eleven_monolingual_v1';
        config.elevenLabsStability = 0.5;
        config.elevenLabsSimilarityBoost = 0.75;
        config.elevenLabsStyle = 0.0;
        config.elevenLabsUseSpeakerBoost = true;
      } else {
        config.ttsProvider = 'openai';
        config.ttsVoice = 'alloy';
      }


      if (description.includes('always voice') || description.includes('voice only')) {
        config.voiceResponseMode = 'always';
      } else if (description.includes('never voice') || description.includes('text only')) {
        config.voiceResponseMode = 'never';
      } else {
        config.voiceResponseMode = 'auto';
      }


      if (!config.maxAudioDuration) {
        if (description.includes('long') || description.includes('detailed')) {
          config.maxAudioDuration = 300; // 5 minutes
        } else if (description.includes('short') || description.includes('brief')) {
          config.maxAudioDuration = 60; // 1 minute
        } else {
          config.maxAudioDuration = 120; // 2 minutes
        }
      }
    }


    if (description.includes('takeover') || description.includes('handoff') || description.includes('human')) {
      config.enableSessionTakeover = true;


      if (!config.stopKeyword) {
        if (description.includes('agent') || description.includes('human')) {
          config.stopKeyword = 'agent';
        } else if (description.includes('help') || description.includes('support')) {
          config.stopKeyword = 'help';
        } else {
          config.stopKeyword = 'stop';
        }
      }


      if (!config.exitOutputHandle) {
        config.exitOutputHandle = 'takeover';
      }
    }


    if (this.shouldEnableTaskExecution(userDescription, nodeLabel)) {
      config.enableTaskExecution = true;


      if (!config.tasks || config.tasks.length === 0) {
        config.tasks = this.generateAdvancedTaskDefinitions(userDescription, nodeLabel);
      } else {

        config.tasks = this.enhanceExistingTasks(config.tasks, userDescription, nodeLabel);
      }
    }


    if (description.includes('calendar') || description.includes('appointment') || description.includes('schedule')) {
      if (description.includes('google') || !description.includes('zoho')) {
        config.enableGoogleCalendar = true;
        config.calendarBusinessHours = {
          start: '09:00',
          end: '17:00'
        };
        config.calendarDefaultDuration = 30;
        config.calendarTimeZone = config.timezone || 'UTC';
        config.calendarFunctions = this.generateCalendarFunctions('google', userDescription);
      }
    }


    if (description.includes('zoho calendar') || (description.includes('zoho') && description.includes('calendar'))) {
      config.enableZohoCalendar = true;
      config.zohoCalendarBusinessHours = {
        start: '09:00',
        end: '17:00'
      };
      config.zohoCalendarDefaultDuration = 30;
      config.zohoCalendarTimeZone = config.timezone || 'UTC';
      config.zohoCalendarFunctions = this.generateCalendarFunctions('zoho', userDescription);
    }


    if (description.includes('support') || description.includes('help') || description.includes('knowledge')) {
      config.knowledgeBaseEnabled = true;

      if (!config.knowledgeBaseConfig) {
        config.knowledgeBaseConfig = {
          maxRetrievedChunks: 3,
          similarityThreshold: 0.7,
          contextPosition: 'before_system',
          contextTemplate: 'Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user\'s question using this information when relevant.'
        };
      }


      if (description.includes('detailed') || description.includes('comprehensive')) {
        config.knowledgeBaseConfig.maxRetrievedChunks = 5;
        config.knowledgeBaseConfig.similarityThreshold = 0.6;
      } else if (description.includes('quick') || description.includes('brief')) {
        config.knowledgeBaseConfig.maxRetrievedChunks = 2;
        config.knowledgeBaseConfig.similarityThreshold = 0.8;
      }


      if (description.includes('context after') || description.includes('after system')) {
        config.knowledgeBaseConfig.contextPosition = 'after_system';
      } else if (description.includes('context before user') || description.includes('before user')) {
        config.knowledgeBaseConfig.contextPosition = 'before_user';
      }
    }

    return config;
  }

  /**
   * Configure WhatsApp Interactive Buttons Node
   */
  private configureWhatsAppButtonsNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.message) {
      config.message = "Please choose an option:";
    }


    if (!config.buttons || config.buttons.length === 0) {
      config.buttons = this.generateButtonOptions(userDescription, nodeLabel);
    }

    config.maxButtons = 3; // WhatsApp limit

    return config;
  }

  /**
   * Configure WhatsApp Poll Node
   */
  private configureWhatsAppPollNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.question) {
      config.question = "Please vote on your preference:";
    }


    if (!config.options || config.options.length === 0) {
      config.options = this.generatePollOptions(userDescription, nodeLabel);
    }

    config.selectableCount = config.selectableCount || 1;

    return config;
  }

  /**
   * Configure Condition Node with intelligent logic
   */
  private configureConditionNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    config.conditionType = config.conditionType || 'contains';


    if (!config.conditionValue) {
      config.conditionValue = this.generateConditionValue(userDescription, nodeLabel);
    }


    if (!config.variableName) {
      config.variableName = 'user_message';
    }

    return config;
  }

  /**
   * Configure HTTP Request Node
   */
  private configureHTTPRequestNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    config.method = config.method || 'POST';


    if (!config.url && userDescription.includes('webhook')) {
      config.url = 'https://your-webhook-url.com/endpoint';
      config.headers = {
        'Content-Type': 'application/json'
      };
      config.body = JSON.stringify({
        message: '{{user_message}}',
        contact: '{{contact.name}}',
        phone: '{{contact.phone}}'
      });
    }

    return config;
  }

  /**
   * Configure Message Trigger
   */
  private configureTriggerNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    config.channelTypes = config.channelTypes || ['whatsapp_unofficial'];


    if (userDescription.toLowerCase().includes('support') || userDescription.toLowerCase().includes('help')) {
      config.conditionType = 'contains';
      config.conditionValue = 'help,support,issue,problem';
    } else if (userDescription.toLowerCase().includes('sales') || userDescription.toLowerCase().includes('buy')) {
      config.conditionType = 'contains';
      config.conditionValue = 'price,buy,purchase,product,service';
    } else {
      config.conditionType = 'any';
      config.conditionValue = '';
    }


    config.enableSessionPersistence = true;
    config.sessionTimeout = 30;
    config.sessionTimeoutUnit = 'minutes';

    return config;
  }

  /**
   * Configure Document Node
   */
  private configureDocumentNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.caption) {
      if (nodeLabel && nodeLabel.toLowerCase().includes('brochure')) {
        config.caption = "📄 Here's our company brochure with all the information you need!";
      } else if (nodeLabel && nodeLabel.toLowerCase().includes('manual')) {
        config.caption = "📖 Here's the user manual you requested.";
      } else {
        config.caption = "📎 Here's the document you requested.";
      }
    }


    config.documentType = this.extractDocumentType(userDescription, nodeLabel);

    return config;
  }

  /**
   * Configure Quick Reply Node
   */
  private configureQuickReplyNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    if (!config.message) {
      config.message = "Please select an option:";
    }


    if (!config.options || config.options.length === 0) {
      config.options = this.generateQuickReplyOptions(userDescription, nodeLabel);
    }

    return config;
  }

  /**
   * Configure Pipeline Stage Node with comprehensive intelligent configuration
   */
  private configurePipelineStageNode(baseConfig: any, userDescription: string, nodeLabel: string): any {
    const config = { ...baseConfig };


    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();


    if (!config.operation) {
      if (description.includes('create stage') || description.includes('new stage')) {
        config.operation = 'create_stage';
      } else if (description.includes('create deal') || description.includes('new deal')) {
        config.operation = 'create_deal';
      } else if (description.includes('update deal') || description.includes('modify deal')) {
        config.operation = 'update_deal';
      } else if (description.includes('tag') || description.includes('label')) {
        config.operation = 'manage_tags';
      } else {
        config.operation = 'update_stage';
      }
    }


    if (!config.dealIdVariable) {
      config.dealIdVariable = '{{contact.phone}}';
    }


    if (!config.stageId && config.operation !== 'create_stage') {

      if (description.includes('lead') || label.includes('lead') || description.includes('prospect')) {
        config.stageName = 'Lead';
        config.stageColor = '#3b82f6';
      } else if (description.includes('qualified') || label.includes('qualified') || description.includes('qualify')) {
        config.stageName = 'Qualified Lead';
        config.stageColor = '#10b981';
      } else if (description.includes('proposal') || label.includes('proposal') || description.includes('quote')) {
        config.stageName = 'Proposal Sent';
        config.stageColor = '#f59e0b';
      } else if (description.includes('negotiation') || label.includes('negotiation') || description.includes('negotiate')) {
        config.stageName = 'In Negotiation';
        config.stageColor = '#ef4444';
      } else if (description.includes('closed') || label.includes('closed') || description.includes('won') || description.includes('deal')) {
        config.stageName = 'Closed Won';
        config.stageColor = '#22c55e';
      } else if (description.includes('lost') || label.includes('lost') || description.includes('rejected')) {
        config.stageName = 'Closed Lost';
        config.stageColor = '#6b7280';
      } else if (description.includes('follow') || label.includes('follow') || description.includes('nurture')) {
        config.stageName = 'Follow Up';
        config.stageColor = '#8b5cf6';
      } else if (description.includes('demo') || label.includes('demo') || description.includes('presentation')) {
        config.stageName = 'Demo Scheduled';
        config.stageColor = '#06b6d4';
      } else if (description.includes('meeting') || label.includes('meeting') || description.includes('appointment')) {
        config.stageName = 'Meeting Scheduled';
        config.stageColor = '#ec4899';
      } else {

        config.stageName = 'New Lead';
        config.stageColor = '#3b82f6';
      }
    }


    if (!config.createDealIfNotExists) {
      config.createDealIfNotExists = description.includes('create') || description.includes('new') || config.operation === 'create_deal';
    }


    if (!config.dealTitle && (config.operation === 'create_deal' || config.createDealIfNotExists)) {
      if (description.includes('product') || description.includes('service')) {
        config.dealTitle = '{{contact.name}} - Product Inquiry';
      } else if (description.includes('consultation') || description.includes('consult')) {
        config.dealTitle = '{{contact.name}} - Consultation Request';
      } else if (description.includes('demo') || description.includes('trial')) {
        config.dealTitle = '{{contact.name}} - Demo Request';
      } else {
        config.dealTitle = '{{contact.name}} - Sales Opportunity';
      }
    }


    if (!config.dealValue) {
      const dealValueMatch = description.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (dealValueMatch) {
        config.dealValue = dealValueMatch[0];
      } else if (description.includes('high value') || description.includes('enterprise')) {
        config.dealValue = '{{deal.estimated_value}}';
      }
    }


    if (!config.dealPriority) {
      if (description.includes('urgent') || description.includes('asap') || description.includes('high priority')) {
        config.dealPriority = 'high';
      } else if (description.includes('low priority') || description.includes('later')) {
        config.dealPriority = 'low';
      } else {
        config.dealPriority = 'medium';
      }
    }


    if (!config.dealDescription && (config.operation === 'create_deal' || config.createDealIfNotExists)) {
      if (description.includes('interested in')) {
        config.dealDescription = 'Customer expressed interest during automated conversation';
      } else if (description.includes('requested')) {
        config.dealDescription = 'Customer made a specific request via chat';
      } else {
        config.dealDescription = 'Deal created automatically from conversation flow';
      }
    }


    if (!config.dealDueDate) {
      if (description.includes('week') || description.includes('7 days')) {
        config.dealDueDate = '{{date.add_days(7)}}';
      } else if (description.includes('month') || description.includes('30 days')) {
        config.dealDueDate = '{{date.add_days(30)}}';
      } else if (description.includes('quarter') || description.includes('90 days')) {
        config.dealDueDate = '{{date.add_days(90)}}';
      }
    }


    if (config.operation === 'manage_tags' || description.includes('tag')) {
      if (!config.tagsToAdd) {
        config.tagsToAdd = [];


        if (description.includes('hot lead') || description.includes('interested')) {
          config.tagsToAdd.push('hot-lead');
        }
        if (description.includes('qualified') || description.includes('budget')) {
          config.tagsToAdd.push('qualified');
        }
        if (description.includes('demo') || description.includes('trial')) {
          config.tagsToAdd.push('demo-requested');
        }
        if (description.includes('enterprise') || description.includes('large')) {
          config.tagsToAdd.push('enterprise');
        }
        if (description.includes('urgent') || description.includes('priority')) {
          config.tagsToAdd.push('high-priority');
        }
      }

      if (!config.tagsToRemove) {
        config.tagsToRemove = [];


        if (description.includes('not interested') || description.includes('cold')) {
          config.tagsToRemove.push('hot-lead');
        }
        if (description.includes('unqualified') || description.includes('no budget')) {
          config.tagsToRemove.push('qualified');
        }
      }
    }


    if (!config.enableAdvancedOptions) {
      config.enableAdvancedOptions = description.includes('advanced') || description.includes('custom');
    }

    if (!config.createStageIfNotExists) {
      config.createStageIfNotExists = description.includes('create stage') || description.includes('new stage');
    }


    if (!config.errorHandling) {
      if (description.includes('stop on error') || description.includes('halt')) {
        config.errorHandling = 'stop';
      } else {
        config.errorHandling = 'continue';
      }
    }


    config.showAdvanced = config.enableAdvancedOptions || false;
    config.showTagManagement = config.operation === 'manage_tags' || (config.tagsToAdd && config.tagsToAdd.length > 0);
    config.showDealCreation = config.operation === 'create_deal' || config.createDealIfNotExists;

    return config;
  }

  /**
   * Helper functions for intelligent content generation
   */

  private generateContextualMessage(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('welcome') || label.includes('welcome')) {
      return "👋 Hello {{contact.name}}! Welcome to our service. How can I help you today?";
    } else if (description.includes('support') || label.includes('support')) {
      return "🆘 Hi {{contact.name}}, I'm here to help! Please describe your issue and I'll assist you.";
    } else if (description.includes('thank') || label.includes('thank')) {
      return "Thank you for contacting us! We appreciate your interest and will get back to you soon.";
    } else if (description.includes('goodbye') || label.includes('goodbye')) {
      return "Thank you for using our service! Have a great day! 👋";
    } else {
      return "Hello {{contact.name}}! How can I assist you today?";
    }
  }

  private generateAIPrompt(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('support') || label.includes('support')) {
      return `You are a helpful customer support assistant. Your role is to:
- Provide accurate and helpful information
- Be empathetic and understanding
- Ask clarifying questions when needed
- Escalate complex issues to human agents when appropriate
- Always maintain a professional and friendly tone

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    } else if (description.includes('sales') || label.includes('sales')) {
      return `You are a knowledgeable sales assistant. Your role is to:
- Help customers understand our products and services
- Provide pricing information when available
- Qualify leads and understand customer needs
- Schedule appointments or demos when appropriate
- Always be helpful and not pushy

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    } else {
      return `You are a helpful AI assistant. Your role is to:
- Provide accurate and helpful information
- Be friendly and professional
- Ask clarifying questions when needed
- Assist customers with their inquiries

Current date and time: {{current_datetime}}
Customer name: {{contact.name}}
Customer phone: {{contact.phone}}`;
    }
  }

  private shouldEnableTaskExecution(userDescription: string, nodeLabel: string): boolean {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    return description.includes('document') ||
           description.includes('brochure') ||
           description.includes('file') ||
           description.includes('send') ||
           label.includes('document') ||
           label.includes('brochure') ||
           label.includes('task');
  }

  private generateTaskDefinitions(userDescription: string, nodeLabel: string): any[] {
    const tasks = [];
    const description = userDescription.toLowerCase();

    if (description.includes('document') || description.includes('brochure') || description.includes('file')) {
      tasks.push({
        id: `task-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }

    return tasks;
  }

  /**
   * Generate advanced task definitions with comprehensive function calling
   */
  private generateAdvancedTaskDefinitions(userDescription: string, _nodeLabel: string): any[] {
    const tasks = [];
    const description = userDescription.toLowerCase();


    if (description.includes('document') || description.includes('brochure') || description.includes('file')) {
      tasks.push({
        id: `task-document-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              },
              urgency: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Urgency level of the request'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }


    if (description.includes('contact') || description.includes('information') || description.includes('details')) {
      tasks.push({
        id: `task-contact-${Date.now()}`,
        name: 'Collect Contact Info',
        description: 'When user provides or requests contact information',
        functionDefinition: {
          name: 'collect_contact_info',
          description: 'Collect and process contact information from the user',
          parameters: {
            type: 'object',
            properties: {
              info_type: {
                type: 'string',
                enum: ['email', 'phone', 'address', 'company', 'name'],
                description: 'Type of contact information'
              },
              value: {
                type: 'string',
                description: 'The contact information value'
              },
              verified: {
                type: 'boolean',
                description: 'Whether the information has been verified'
              }
            },
            required: ['info_type', 'value']
          }
        },
        outputHandle: 'task_contact',
        enabled: true
      });
    }


    if (description.includes('qualify') || description.includes('lead') || description.includes('sales')) {
      tasks.push({
        id: `task-qualify-${Date.now()}`,
        name: 'Qualify Lead',
        description: 'When user shows interest and needs to be qualified as a lead',
        functionDefinition: {
          name: 'qualify_lead',
          description: 'Qualify the user as a potential lead based on their responses',
          parameters: {
            type: 'object',
            properties: {
              interest_level: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'very_high'],
                description: 'Level of interest shown by the user'
              },
              budget_range: {
                type: 'string',
                description: 'Budget range mentioned by the user'
              },
              timeline: {
                type: 'string',
                description: 'Timeline for making a decision'
              },
              decision_maker: {
                type: 'boolean',
                description: 'Whether the user is the decision maker'
              }
            },
            required: ['interest_level']
          }
        },
        outputHandle: 'task_qualify',
        enabled: true
      });
    }

    return tasks;
  }

  /**
   * Generate calendar function definitions
   */
  private generateCalendarFunctions(provider: 'google' | 'zoho', userDescription: string): any[] {
    const functions = [];
    const description = userDescription.toLowerCase();
    const prefix = provider === 'zoho' ? 'zoho_' : '';


    functions.push({
      id: `${provider}_check_availability_${Date.now()}`,
      name: `Check ${provider === 'zoho' ? 'Zoho ' : ''}Availability`,
      description: `Check available time slots in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
      functionDefinition: {
        name: `${prefix}check_availability`,
        description: `Check available time slots in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar for scheduling appointments`,
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check availability for (YYYY-MM-DD format)'
            },
            duration_minutes: {
              type: 'number',
              description: 'Duration of the appointment in minutes',
              default: 30
            }
          },
          required: ['date']
        }
      },
      outputHandle: `${prefix}availability`,
      enabled: true
    });


    if (description.includes('book') || description.includes('schedule') || description.includes('appointment')) {
      functions.push({
        id: `${provider}_book_appointment_${Date.now()}`,
        name: `Book ${provider === 'zoho' ? 'Zoho ' : ''}Appointment`,
        description: `Book an appointment in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
        functionDefinition: {
          name: `${prefix}book_appointment`,
          description: `Book an appointment in ${provider === 'zoho' ? 'Zoho ' : 'Google '}Calendar`,
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the appointment'
              },
              date: {
                type: 'string',
                description: 'Date of the appointment (YYYY-MM-DD format)'
              },
              start_time: {
                type: 'string',
                description: 'Start time of the appointment (HH:MM format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: 30
              }
            },
            required: ['title', 'date', 'start_time']
          }
        },
        outputHandle: `${prefix}appointment`,
        enabled: true
      });
    }

    return functions;
  }

  /**
   * Enhance existing tasks while preserving their output handles and core configuration
   */
  private enhanceExistingTasks(existingTasks: any[], userDescription: string, _nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();



    const enhancedTasks = [...existingTasks];


    const hasDocumentTask = existingTasks.some(task =>
      task.name.toLowerCase().includes('document') ||
      task.functionDefinition?.name?.includes('share_document')
    );

    const hasLeadTask = existingTasks.some(task =>
      task.name.toLowerCase().includes('qualify') ||
      task.name.toLowerCase().includes('lead') ||
      task.functionDefinition?.name?.includes('qualify_lead')
    );


    if (!hasDocumentTask && (description.includes('document') || description.includes('brochure') || description.includes('file'))) {
      enhancedTasks.push({
        id: `task-document-${Date.now()}`,
        name: 'Share Document',
        description: 'When user requests a document, brochure, or file to be shared',
        functionDefinition: {
          name: 'share_document',
          description: 'Share a document or file with the user when they request it',
          parameters: {
            type: 'object',
            properties: {
              document_type: {
                type: 'string',
                description: 'Type of document requested (brochure, manual, catalog, etc.)'
              },
              user_request: {
                type: 'string',
                description: 'The user\'s original request for the document'
              }
            },
            required: ['document_type', 'user_request']
          }
        },
        outputHandle: 'task_document',
        enabled: true
      });
    }

    if (!hasLeadTask && (description.includes('qualify') || description.includes('lead') || description.includes('pipeline'))) {
      enhancedTasks.push({
        id: `task-qualify-${Date.now()}`,
        name: 'Qualify Lead',
        description: 'When user shows interest and needs to be qualified as a lead',
        functionDefinition: {
          name: 'qualify_lead',
          description: 'Qualify the user as a potential lead based on their responses',
          parameters: {
            type: 'object',
            properties: {
              interest_level: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'very_high'],
                description: 'Level of interest shown by the user'
              }
            },
            required: ['interest_level']
          }
        },
        outputHandle: 'task_qualify',
        enabled: true
      });
    }

    return enhancedTasks;
  }

  private generateButtonOptions(userDescription: string, nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();

    if (description.includes('support')) {
      return [
        { id: 'technical', text: 'Technical Issue', value: 'technical' },
        { id: 'billing', text: 'Billing Question', value: 'billing' },
        { id: 'general', text: 'General Inquiry', value: 'general' }
      ];
    } else if (description.includes('sales')) {
      return [
        { id: 'pricing', text: 'Pricing Info', value: 'pricing' },
        { id: 'demo', text: 'Request Demo', value: 'demo' },
        { id: 'contact', text: 'Contact Sales', value: 'contact' }
      ];
    } else {
      return [
        { id: 'yes', text: 'Yes', value: 'yes' },
        { id: 'no', text: 'No', value: 'no' },
        { id: 'more_info', text: 'More Info', value: 'more_info' }
      ];
    }
  }

  private generatePollOptions(userDescription: string, nodeLabel: string): string[] {
    const description = userDescription.toLowerCase();

    if (description.includes('satisfaction') || description.includes('feedback')) {
      return ['Excellent', 'Good', 'Average', 'Poor'];
    } else if (description.includes('preference')) {
      return ['Option A', 'Option B', 'Option C'];
    } else {
      return ['Yes', 'No', 'Maybe'];
    }
  }

  private generateConditionValue(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('support') || label.includes('support')) {
      return 'help,support,issue,problem';
    } else if (description.includes('sales') || label.includes('sales')) {
      return 'price,buy,purchase,product,service';
    } else if (description.includes('yes') || label.includes('yes')) {
      return 'yes,sure,okay,ok';
    } else if (description.includes('no') || label.includes('no')) {
      return 'no,nope,cancel,stop';
    } else {
      return '';
    }
  }

  private extractDocumentType(userDescription: string, nodeLabel: string): string {
    const description = userDescription.toLowerCase();
    const label = nodeLabel.toLowerCase();

    if (description.includes('brochure') || label.includes('brochure')) {
      return 'brochure';
    } else if (description.includes('manual') || label.includes('manual')) {
      return 'manual';
    } else if (description.includes('catalog') || label.includes('catalog')) {
      return 'catalog';
    } else if (description.includes('pdf') || label.includes('pdf')) {
      return 'pdf';
    } else {
      return 'document';
    }
  }

  private generateQuickReplyOptions(userDescription: string, nodeLabel: string): any[] {
    const description = userDescription.toLowerCase();

    if (description.includes('support')) {
      return [
        { id: 'technical', text: 'Technical Issue' },
        { id: 'billing', text: 'Billing' },
        { id: 'general', text: 'General' }
      ];
    } else if (description.includes('satisfaction')) {
      return [
        { id: 'excellent', text: 'Excellent' },
        { id: 'good', text: 'Good' },
        { id: 'poor', text: 'Poor' }
      ];
    } else {
      return [
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
        { id: 'maybe', text: 'Maybe' }
      ];
    }
  }

  /**
   * Create smart connections between nodes based on logical flow
   */
  private createSmartNodeConnections(nodes: any[], originalEdges: any[]): any[] {
    const edges = [...originalEdges];
    const nodeMap = new Map(nodes.map(node => [node.id, node]));


    for (let i = 0; i < nodes.length - 1; i++) {
      const currentNode = nodes[i];
      const nextNode = nodes[i + 1];


      const existingEdge = edges.find(edge =>
        edge.source === currentNode.id && edge.target === nextNode.id
      );

      if (!existingEdge) {

        const connection = this.createSmartConnection(currentNode, nextNode);
        if (connection) {
          edges.push(connection);
        }
      }
    }


    this.addAIAssistantTaskConnections(nodes, edges);

    return edges.map((edge, index) => ({
      id: edge.id || `edge-${index}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type || 'smoothstep',
      animated: true
    }));
  }

  /**
   * Create intelligent connection between two nodes
   */
  private createSmartConnection(sourceNode: any, targetNode: any): any | null {
    const sourceType = sourceNode.type;
    const targetType = targetNode.type;


    if ((sourceType === 'aiAssistant' || sourceType === 'ai_assistant') && targetType === 'document') {
      const aiConfig = sourceNode.data;
      if (aiConfig.enableTaskExecution && aiConfig.tasks?.length > 0) {
        const documentTask = aiConfig.tasks.find((task: any) =>
          task.name.toLowerCase().includes('document') ||
          task.name.toLowerCase().includes('share')
        );

        if (documentTask) {
          return {
            id: `${sourceNode.id}-${targetNode.id}`,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: documentTask.outputHandle || 'task_document',
            targetHandle: 'target'
          };
        }
      }
    }


    if (sourceType === 'condition') {
      return {
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: 'true', // Default to true branch
        targetHandle: 'target'
      };
    }


    if (['whatsapp_interactive_buttons', 'whatsappInteractiveButtons', 'quickreply', 'quickReply'].includes(sourceType)) {
      return {
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: 'default',
        targetHandle: 'target'
      };
    }


    return {
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: 'source',
      targetHandle: 'target'
    };
  }

  /**
   * Add special connections for AI Assistant task execution
   */
  private addAIAssistantTaskConnections(nodes: any[], edges: any[]): void {
    const aiNodes = nodes.filter(node =>
      node.type === 'aiAssistant' || node.type === 'ai_assistant'
    );

    for (const aiNode of aiNodes) {
      const aiConfig = aiNode.data;
      if (aiConfig.enableTaskExecution && aiConfig.tasks?.length > 0) {
        for (const task of aiConfig.tasks) {

          const targetNodes = this.findTaskTargetNodes(nodes, task);


          for (const targetNode of targetNodes) {
            const existingEdge = edges.find(edge =>
              edge.source === aiNode.id &&
              edge.target === targetNode.id &&
              edge.sourceHandle === task.outputHandle
            );

            if (!existingEdge) {
              edges.push({
                id: `${aiNode.id}-${targetNode.id}-${task.outputHandle}`,
                source: aiNode.id,
                target: targetNode.id,
                sourceHandle: task.outputHandle,
                targetHandle: 'target'
              });
            }
          }
        }
      }
    }
  }

  /**
   * Find appropriate target nodes for AI Assistant tasks
   */
  private findTaskTargetNodes(nodes: any[], task: any): any[] {
    const taskName = task.name.toLowerCase();
    const taskFunction = task.functionDefinition?.name?.toLowerCase() || '';

    const targetNodes = [];


    if (taskName.includes('document') || taskName.includes('brochure') || taskFunction.includes('share_document')) {
      const documentNodes = nodes.filter(node => node.type === 'document');
      targetNodes.push(...documentNodes);
    }


    if (taskName.includes('qualify') || taskName.includes('lead') || taskName.includes('contact') ||
        taskFunction.includes('qualify_lead') || taskFunction.includes('collect_contact_info')) {
      const pipelineNodes = nodes.filter(node =>
        node.type === 'updatePipelineStage' || node.type === 'update_pipeline_stage'
      );
      targetNodes.push(...pipelineNodes);
    }


    if (taskName.includes('appointment') || taskName.includes('booking') || taskFunction.includes('book_appointment')) {
      const calendarNodes = nodes.filter(node =>
        node.type === 'googleCalendar' || node.type === 'zohoCalendar'
      );
      if (calendarNodes.length > 0) {
        targetNodes.push(...calendarNodes);
      } else {

        const messageNodes = nodes.filter(node => node.type === 'message');
        targetNodes.push(...messageNodes.slice(0, 1)); // Only first message node
      }
    }


    if (taskName.includes('message') || taskName.includes('send') || taskFunction.includes('send_message')) {
      const messageNodes = nodes.filter(node => node.type === 'message');
      targetNodes.push(...messageNodes);
    }


    if (targetNodes.length === 0) {
      const aiNodeIndex = nodes.findIndex(node => node.id === nodes.find(n =>
        (n.type === 'aiAssistant' || n.type === 'ai_assistant') &&
        n.data?.enableTaskExecution &&
        n.data?.tasks?.some((t: any) => t.outputHandle === task.outputHandle)
      )?.id);

      if (aiNodeIndex >= 0 && aiNodeIndex < nodes.length - 1) {

        const nextNodes = nodes.slice(aiNodeIndex + 1);


        if (taskFunction.includes('qualify') || taskFunction.includes('contact')) {
          const pipelineNode = nextNodes.find(node =>
            node.type === 'updatePipelineStage' || node.type === 'update_pipeline_stage'
          );
          if (pipelineNode) {
            targetNodes.push(pipelineNode);
          }
        }


        if (taskFunction.includes('document') || taskFunction.includes('share')) {
          const documentNode = nextNodes.find(node => node.type === 'document');
          if (documentNode) {
            targetNodes.push(documentNode);
          }
        }


        if (targetNodes.length === 0 && nextNodes.length > 0) {
          targetNodes.push(nextNodes[0]);
        }
      }
    }

    return targetNodes;
  }

  /**
   * Ensure every flow has a properly configured trigger node
   */
  private ensureTriggerNodeIntegration(nodes: any[], userDescription: string): any[] {

    const hasTrigger = nodes.some(node => node.type === 'trigger');

    if (hasTrigger) {
      return nodes;
    }


    const triggerNode = {
      id: 'trigger-start',
      type: 'trigger',
      label: 'Flow Trigger',
      data: this.configureTriggerNode({}, userDescription, 'Flow Trigger'),
      position: {
        x: 100,
        y: 50
      }
    };


    const adjustedNodes = nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + 150 // Move down to make room for trigger
      }
    }));

    return [triggerNode, ...adjustedNodes];
  }

  /**
   * Update edges to connect trigger node to the first logical node
   */
  private updateEdgesForTriggerIntegration(nodes: any[], edges: any[]): any[] {
    const triggerNode = nodes.find(node => node.type === 'trigger');
    if (!triggerNode) {
      return edges;
    }


    const firstProcessingNode = nodes.find(node =>
      node.type !== 'trigger' &&
      !edges.some(edge => edge.target === node.id)
    );

    if (firstProcessingNode) {

      const triggerEdge = {
        id: `${triggerNode.id}-${firstProcessingNode.id}`,
        source: triggerNode.id,
        target: firstProcessingNode.id,
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'smoothstep',
        animated: true
      };

      return [triggerEdge, ...edges];
    }

    return edges;
  }
}

export const flowGenerationEngine = FlowGenerationEngine.getInstance();
export const aiFlowAssistantService = AIFlowAssistantService.getInstance();
export default aiFlowAssistantService;

// Advanced Trustless AI Agent - Core with Reasoning Engine
// Uses Groq for fast LLM inference (OpenAI-compatible API)

import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import OpenAI from 'openai';
import { config } from '../config';

// Groq configuration - OpenAI-compatible API
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Fast, capable model
import { PolicyEngine, DEFAULT_POLICY } from '../policy/engine';
import { TreasuryManager, initTreasury, getTreasury } from '../treasury/manager';
import { getX402Client, makePayment } from '../payments/x402';
import { getAuditLogger } from '../audit/logger';
import {
  AgentIdentity,
  AgentState,
  AgentDecision,
  ThinkingStep,
  ExecutionResult,
  ActionResult,
  PaymentResult,
  ActionType,
  AgentMemory,
  ConversationMessage,
} from './types';

export class TrustlessAgent {
  private identity: AgentIdentity;
  private state: AgentState;
  private policy: PolicyEngine;
  private treasury: TreasuryManager;
  private memory: AgentMemory;
  private openai: OpenAI | null = null;
  private llmModel: string = GROQ_MODEL;
  private llmProvider: 'groq' | 'openai' | 'none' = 'none';

  constructor(privateKey: string, name: string = 'TrustlessAgent') {
    // Initialize treasury
    this.treasury = initTreasury(privateKey);

    // Create identity
    this.identity = {
      address: this.treasury.getAddress(),
      name,
      reputation: 100,
      createdAt: Date.now(),
    };

    // Initialize state
    this.state = {
      identity: this.identity,
      isActive: true,
      totalSpent: '$0.00',
      totalEarned: '$0.00',
      successfulTasks: 0,
      failedTasks: 0,
      lastAction: Date.now(),
    };

    // Initialize policy engine
    this.policy = new PolicyEngine(DEFAULT_POLICY);

    // Initialize memory
    this.memory = {
      conversationHistory: [],
      actionHistory: [],
      paymentHistory: [],
      maxHistoryLength: 100,
    };

    // Initialize LLM client (Groq preferred, OpenAI fallback)
    if (config.apis.groq) {
      // Use Groq for fast inference
      this.openai = new OpenAI({
        apiKey: config.apis.groq,
        baseURL: GROQ_BASE_URL,
      });
      this.llmModel = GROQ_MODEL;
      this.llmProvider = 'groq';
      console.log('🧠 Agent using Groq LLM (llama-3.3-70b)');
    } else if (config.apis.openai) {
      // Fallback to OpenAI
      this.openai = new OpenAI({ apiKey: config.apis.openai });
      this.llmModel = 'gpt-4o-mini';
      this.llmProvider = 'openai';
      console.log('🧠 Agent using OpenAI LLM');
    } else {
      console.log('⚠️ No LLM configured - using rule-based reasoning');
    }
  }

  // Get current LLM info
  getLLMInfo() {
    return {
      provider: this.llmProvider,
      model: this.llmModel,
      configured: this.openai !== null,
    };
  }

  // Main entry point - process a query
  async process(query: string, context?: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const auditLogger = getAuditLogger();

    // Add to conversation history
    this.addToMemory({ role: 'user', content: query, timestamp: Date.now() });

    // Step 1: Understand and plan
    const decision = await this.think(query, context);
    auditLogger.logDecision(decision);

    // Step 2: Check if execution is allowed
    if (!decision.approved) {
      const result: ExecutionResult = {
        success: false,
        decision,
        actions: [],
        payments: [],
        totalCost: '$0.00',
        duration: Date.now() - startTime,
      };
      
      this.addToMemory({
        role: 'agent',
        content: 'Request blocked: ' + decision.policyCheck.violations.join(', '),
        timestamp: Date.now(),
      });
      
      return result;
    }

    // Step 3: Check if human approval needed
    if (decision.requiresHumanApproval) {
      const approval = this.treasury.requestApproval(
        decision.estimatedCost,
        'Agent task: ' + decision.intent
      );

      const result: ExecutionResult = {
        success: false,
        decision: { ...decision, approved: false },
        actions: [],
        payments: [],
        totalCost: '$0.00',
        duration: Date.now() - startTime,
      };

      this.addToMemory({
        role: 'agent',
        content: 'Awaiting human approval for: ' + decision.intent + ' (ID: ' + approval.id + ')',
        timestamp: Date.now(),
      });

      return result;
    }

    // Step 4: Execute actions
    const result = await this.execute(decision);
    result.duration = Date.now() - startTime;

    // Step 5: Log and update state
    auditLogger.logExecution(result);
    this.updateState(result);

    // Add response to memory
    this.addToMemory({
      role: 'agent',
      content: result.success 
        ? 'Completed: ' + decision.intent 
        : 'Failed: ' + (result.actions.find(a => a.error)?.error || 'Unknown error'),
      timestamp: Date.now(),
      metadata: { decisionId: decision.id, cost: result.totalCost },
    });

    return result;
  }

  // Reasoning engine - think through the query
  private async think(query: string, context?: Record<string, unknown>): Promise<AgentDecision> {
    const decisionId = uuidv4();
    const thinking: ThinkingStep[] = [];
    let stepNum = 0;

    // Step 1: Understand intent
    const intent = await this.classifyIntent(query);
    thinking.push({
      step: ++stepNum,
      thought: 'Understanding user intent',
      reasoning: 'Query appears to be about: ' + intent,
      timestamp: Date.now(),
    });

    // Step 2: Determine required actions
    const actions = this.determineActions(intent, query);
    thinking.push({
      step: ++stepNum,
      thought: 'Planning required actions',
      reasoning: 'Will need to: ' + actions.join(', '),
      timestamp: Date.now(),
    });

    // Step 3: Estimate cost
    const cost = this.estimateCost(actions);
    thinking.push({
      step: ++stepNum,
      thought: 'Calculating cost estimate',
      reasoning: 'Estimated total cost: ' + cost,
      timestamp: Date.now(),
    });

    // Step 4: Check policy
    const domains = this.extractDomains(actions);
    const policyCheck = this.policy.checkPolicy(actions, cost, domains);
    thinking.push({
      step: ++stepNum,
      thought: 'Checking against policy',
      reasoning: policyCheck.allowed 
        ? 'Policy check passed. Rules applied: ' + policyCheck.appliedRules.join(', ')
        : 'Policy violation: ' + policyCheck.violations.join(', '),
      timestamp: Date.now(),
    });

    // Step 5: Check treasury
    const canSpend = await this.treasury.canSpend(cost);
    thinking.push({
      step: ++stepNum,
      thought: 'Checking treasury balance',
      reasoning: canSpend.allowed 
        ? 'Sufficient funds available'
        : 'Treasury check failed: ' + canSpend.reason,
      timestamp: Date.now(),
    });

    const approved = policyCheck.allowed && canSpend.allowed;
    const requiresApproval = this.policy.requiresApproval(cost);

    return {
      id: decisionId,
      query,
      intent,
      requiredActions: actions,
      estimatedCost: cost,
      policyCheck,
      thinking,
      approved,
      requiresHumanApproval: requiresApproval && approved,
    };
  }

  // Classify user intent using AI or rules
  private async classifyIntent(query: string): Promise<string> {
    const lowerQuery = query.toLowerCase();

    // Rule-based classification
    if (lowerQuery.includes('price') || lowerQuery.includes('market') || lowerQuery.includes('crypto')) {
      return 'market_data_analysis';
    }
    if (lowerQuery.includes('search') || lowerQuery.includes('find') || lowerQuery.includes('look up')) {
      return 'web_search';
    }
    if (lowerQuery.includes('analyze') || lowerQuery.includes('explain') || lowerQuery.includes('what')) {
      return 'analysis';
    }
    if (lowerQuery.includes('bitcoin') || lowerQuery.includes('btc') || lowerQuery.includes('ethereum') || lowerQuery.includes('eth')) {
      return 'crypto_analysis';
    }

    // AI classification if available
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.llmModel,
          messages: [
            {
              role: 'system',
              content: 'Classify the user intent into one of: market_data_analysis, web_search, analysis, crypto_analysis, general_query. Respond with only the category.',
            },
            { role: 'user', content: query },
          ],
          max_tokens: 20,
        });
        return response.choices[0]?.message?.content?.trim() || 'general_query';
      } catch {
        return 'general_query';
      }
    }

    return 'general_query';
  }

  // Determine actions based on intent
  private determineActions(intent: string, query: string): ActionType[] {
    const actionMap: Record<string, ActionType[]> = {
      market_data_analysis: ['fetch_data', 'analyze', 'report'],
      web_search: ['search', 'analyze', 'report'],
      analysis: ['analyze', 'report'],
      crypto_analysis: ['fetch_data', 'analyze', 'report'],
      general_query: ['analyze', 'report'],
    };

    return actionMap[intent] || ['analyze', 'report'];
  }

  // Estimate cost based on actions
  private estimateCost(actions: ActionType[]): string {
    const costs: Record<ActionType, number> = {
      search: 0.01,
      fetch_data: 0.005,
      analyze: 0.02,
      report: 0.00,
      pay: 0.00,
      request_approval: 0.00,
      browse: 0.00,
      evaluate: 0.01,
      purchase: 0.00, // Actual purchase cost is the product price
    };

    const total = actions.reduce((sum, action) => sum + (costs[action] || 0), 0);
    return '$' + total.toFixed(2);
  }

  // Extract domains that will be accessed
  private extractDomains(actions: ActionType[]): string[] {
    const domains: string[] = [];
    if (actions.includes('fetch_data')) domains.push('api.coingecko.com');
    if (actions.includes('search')) domains.push('api.firecrawl.dev');
    if (actions.includes('analyze')) domains.push('api.openai.com');
    return domains;
  }

  // Execute the approved decision
  private async execute(decision: AgentDecision): Promise<ExecutionResult> {
    const actions: ActionResult[] = [];
    const payments: PaymentResult[] = [];
    let totalCost = 0;
    let aggregatedData: unknown[] = [];

    for (const action of decision.requiredActions) {
      const actionStart = Date.now();
      let result: ActionResult;

      try {
        switch (action) {
          case 'fetch_data':
            result = await this.executeFetchData(decision.query);
            break;
          case 'search':
            result = await this.executeSearch(decision.query);
            break;
          case 'analyze':
            result = await this.executeAnalysis(decision.query, aggregatedData);
            break;
          case 'report':
            result = { action, success: true, data: aggregatedData, paymentRequired: false, duration: 0 };
            break;
          default:
            result = { action, success: false, error: 'Unknown action', data: null, paymentRequired: false, duration: 0 };
        }

        result.duration = Date.now() - actionStart;

        // Handle payment if required
        if (result.paymentRequired && result.paymentAmount) {
          const payment = await this.makePaymentForAction(action, result.paymentAmount);
          payments.push(payment);
          totalCost += parseFloat(result.paymentAmount.replace('$', ''));
        }

        if (result.success && result.data) {
          aggregatedData.push({ action, data: result.data });
        }

      } catch (error) {
        result = {
          action,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: null,
          paymentRequired: false,
          duration: Date.now() - actionStart,
        };
      }

      actions.push(result);
      this.memory.actionHistory.push(result);
    }

    const success = actions.every(a => a.success || a.action === 'report');

    return {
      success,
      decision,
      actions,
      payments,
      totalCost: '$' + totalCost.toFixed(2),
      duration: 0,
    };
  }

  // Execute data fetch
  private async executeFetchData(query: string): Promise<ActionResult> {
    try {
      // Extract coin from query
      const coins = ['bitcoin', 'ethereum', 'solana', 'cardano'];
      const coin = coins.find(c => query.toLowerCase().includes(c)) || 'bitcoin';
      
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/coins/' + coin,
        { 
          params: { localization: false, tickers: false, community_data: false },
          timeout: 10000 
        }
      );

      const data = response.data;
      return {
        action: 'fetch_data',
        success: true,
        data: {
          name: data.name,
          symbol: data.symbol,
          price: data.market_data?.current_price?.usd,
          change24h: data.market_data?.price_change_percentage_24h,
          marketCap: data.market_data?.market_cap?.usd,
          volume: data.market_data?.total_volume?.usd,
        },
        paymentRequired: true,
        paymentAmount: '$0.005',
        duration: 0,
      };
    } catch (error) {
      return {
        action: 'fetch_data',
        success: false,
        error: 'Failed to fetch market data',
        data: null,
        paymentRequired: false,
        duration: 0,
      };
    }
  }

  // Execute search
  private async executeSearch(query: string): Promise<ActionResult> {
    try {
      // Use DuckDuckGo instant answer API (free)
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: 1 },
        timeout: 10000,
      });

      return {
        action: 'search',
        success: true,
        data: {
          abstract: response.data.Abstract || 'No direct answer found',
          relatedTopics: response.data.RelatedTopics?.slice(0, 5) || [],
          source: response.data.AbstractSource || 'DuckDuckGo',
        },
        paymentRequired: true,
        paymentAmount: '$0.01',
        duration: 0,
      };
    } catch (error) {
      return {
        action: 'search',
        success: false,
        error: 'Search failed',
        data: null,
        paymentRequired: false,
        duration: 0,
      };
    }
  }

  // Execute analysis with AI
  private async executeAnalysis(query: string, context: unknown[]): Promise<ActionResult> {
    if (!this.openai) {
      // Fallback without OpenAI
      return {
        action: 'analyze',
        success: true,
        data: {
          analysis: 'Analysis based on collected data',
          context: context,
          note: 'AI analysis unavailable - showing raw data',
        },
        paymentRequired: false,
        paymentAmount: '$0.00',
        duration: 0,
      };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI analyst. Analyze the provided data and answer the user query concisely.',
          },
          {
            role: 'user',
            content: 'Query: ' + query + '\n\nContext data:\n' + JSON.stringify(context, null, 2),
          },
        ],
        max_tokens: 500,
      });

      return {
        action: 'analyze',
        success: true,
        data: {
          analysis: response.choices[0]?.message?.content || 'No analysis generated',
          model: this.llmModel,
          tokensUsed: response.usage?.total_tokens || 0,
        },
        paymentRequired: true,
        paymentAmount: '$0.02',
        duration: 0,
      };
    } catch (error) {
      return {
        action: 'analyze',
        success: false,
        error: 'Analysis failed',
        data: null,
        paymentRequired: false,
        duration: 0,
      };
    }
  }

  // Make payment for an action
  private async makePaymentForAction(action: ActionType, amount: string): Promise<PaymentResult> {
    const serviceAddresses: Record<string, string> = {
      fetch_data: '0x0000000000000000000000000000000000000001',
      search: '0x0000000000000000000000000000000000000002',
      analyze: '0x0000000000000000000000000000000000000003',
    };

    const recipient = serviceAddresses[action] || '0x0000000000000000000000000000000000000000';
    
    try {
      const payment = await makePayment(amount, recipient, action);
      this.treasury.recordSpending(amount, action);
      this.policy.recordSpending(amount);
      this.memory.paymentHistory.push(payment);
      return payment;
    } catch (error) {
      return {
        txHash: '',
        from: this.identity.address,
        to: recipient,
        amount,
        service: action,
        status: 'failed',
        timestamp: Date.now(),
      };
    }
  }

  // Add message to memory
  private addToMemory(message: ConversationMessage): void {
    this.memory.conversationHistory.push(message);
    if (this.memory.conversationHistory.length > this.memory.maxHistoryLength) {
      this.memory.conversationHistory = this.memory.conversationHistory.slice(-this.memory.maxHistoryLength);
    }
  }

  // Update agent state
  private updateState(result: ExecutionResult): void {
    if (result.success) {
      this.state.successfulTasks++;
    } else {
      this.state.failedTasks++;
    }

    const currentSpent = parseFloat(this.state.totalSpent.replace('$', ''));
    const newCost = parseFloat(result.totalCost.replace('$', ''));
    this.state.totalSpent = '$' + (currentSpent + newCost).toFixed(2);
    this.state.lastAction = Date.now();
  }

  // Getters
  getIdentity(): AgentIdentity { return this.identity; }
  getState(): AgentState { return this.state; }
  getMemory(): AgentMemory { return this.memory; }
  getPolicy(): PolicyEngine { return this.policy; }
  getTreasury(): TreasuryManager { return this.treasury; }
}

// Singleton
let agentInstance: TrustlessAgent | null = null;

export function initAgent(privateKey: string, name?: string): TrustlessAgent {
  if (!agentInstance) {
    agentInstance = new TrustlessAgent(privateKey, name);
  }
  return agentInstance;
}

export function getAgent(): TrustlessAgent {
  if (!agentInstance) {
    throw new Error('Agent not initialized');
  }
  return agentInstance;
}

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { AgentResult, PaymentRecord } from './types';
import { getWallets } from '../wallet';
import { config } from '../config';

interface OrchestratorResult {
  query: string;
  results: Record<string, AgentResult>;
  payments: PaymentRecord[];
  totalCost: string;
  duration: number;
}

const paymentLog: PaymentRecord[] = [];

export async function orchestrate(query: string, budget: string): Promise<OrchestratorResult> {
  const start = Date.now();
  const results: Record<string, AgentResult> = {};
  const payments: PaymentRecord[] = [];
  let totalCost = 0;
  const budgetNum = parseFloat(budget.replace('$', ''));

  const wallets = getWallets();
  const baseUrl = `http://127.0.0.1:${config.server.port}`;

  // Determine which agents to call based on query
  const agentsToCall = determineAgents(query);

  for (const agent of agentsToCall) {
    const agentPrice = getAgentPrice(agent);
    if (totalCost + agentPrice > budgetNum) {
      console.log(`[Orchestrator] Budget limit reached, skipping ${agent}`);
      break;
    }

    try {
      console.log(`[Orchestrator] Calling ${agent} agent...`);

      const response = await axios.post(
        `${baseUrl}/api/agent/${agent}`,
        { id: uuidv4(), query },
        { timeout: 60000 }
      );

      results[agent] = response.data;

      // Record payment
      const agentWallet = wallets[agent as keyof typeof wallets];
      if (agentWallet && wallets.orchestrator) {
        const record: PaymentRecord = {
          txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
          from: wallets.orchestrator.address,
          to: agentWallet.address,
          amount: agentPrice.toFixed(4),
          timestamp: Date.now(),
          agent,
        };
        payments.push(record);
        paymentLog.push(record);
        totalCost += agentPrice;
      }
    } catch (error) {
      results[agent] = {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Agent call failed',
        duration: 0,
      };
    }
  }

  return {
    query,
    results,
    payments,
    totalCost: `$${totalCost.toFixed(4)}`,
    duration: Date.now() - start,
  };
}

function determineAgents(query: string): string[] {
  const q = query.toLowerCase();
  const agents: string[] = [];

  // Smart routing based on query intent
  const needsSearch = /search|find|latest|news|what is|who is|how to/.test(q);
  const needsData = /price|market|crypto|defi|data|bitcoin|eth|token|volume/.test(q);

  if (needsSearch) agents.push('search');
  if (needsData) agents.push('data');

  // Always include analyzer for synthesis
  agents.push('analyzer');

  // If no specific agents, call all
  if (agents.length === 1) {
    return ['search', 'data', 'analyzer'];
  }

  return agents;
}

function getAgentPrice(agent: string): number {
  const prices: Record<string, string> = {
    search: config.agents.search.price,
    data: config.agents.data.price,
    analyzer: config.agents.analyzer.price,
  };
  return parseFloat((prices[agent] || '$0.01').replace('$', ''));
}

export function getPaymentLog(): PaymentRecord[] {
  return paymentLog;
}

export interface AgentTask {
  id: string;
  query: string;
  context?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  data: unknown;
  error?: string;
  duration: number;
}

export interface PaymentRecord {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  agent: string;
}

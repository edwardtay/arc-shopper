// Core Agent Types for Trustless AI Agent

export type ActionType =
  | 'search'
  | 'fetch_data'
  | 'analyze'
  | 'report'
  | 'pay'
  | 'request_approval'
  | 'browse'
  | 'evaluate'
  | 'purchase';

export interface AgentIdentity {
  address: string;
  name: string;
  did?: string; // Decentralized Identifier
  reputation: number; // 0-100 based on history
  createdAt: number;
}

export interface ThinkingStep {
  step: number;
  thought: string;
  action?: ActionType;
  reasoning: string;
  timestamp: number;
}

export interface AgentDecision {
  id: string;
  query: string;
  intent: string;
  requiredActions: ActionType[];
  estimatedCost: string;
  policyCheck: PolicyCheckResult;
  thinking: ThinkingStep[];
  approved: boolean;
  requiresHumanApproval: boolean;
}

export interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
  warnings: string[];
  appliedRules: string[];
}

export interface ExecutionResult {
  success: boolean;
  decision: AgentDecision;
  actions: ActionResult[];
  payments: PaymentResult[];
  totalCost: string;
  auditHash?: string;
  duration: number;
}

export interface ActionResult {
  action: ActionType;
  success: boolean;
  data: unknown;
  error?: string;
  paymentRequired: boolean;
  paymentAmount?: string;
  duration: number;
}

export interface PaymentResult {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  service: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  blockNumber?: number;
}

export interface AgentCapability {
  name: string;
  description: string;
  action: ActionType;
  costPerUse: string;
  endpoint?: string;
  requiresApiKey: boolean;
}

export interface AgentState {
  identity: AgentIdentity;
  isActive: boolean;
  currentTask?: string;
  totalSpent: string;
  totalEarned: string;
  successfulTasks: number;
  failedTasks: number;
  lastAction: number;
}

export interface ConversationMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMemory {
  conversationHistory: ConversationMessage[];
  actionHistory: ActionResult[];
  paymentHistory: PaymentResult[];
  maxHistoryLength: number;
}

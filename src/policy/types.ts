// Policy Engine Types

export interface SpendingLimit {
  maxSinglePayment: string;    // e.g., "$10.00"
  dailyLimit: string;          // e.g., "$100.00"
  weeklyLimit: string;         // e.g., "$500.00"
  monthlyLimit: string;        // e.g., "$2000.00"
}

export interface ApprovalThreshold {
  amount: string;              // Above this amount requires approval
  cooldownMinutes: number;     // Time between large transactions
}

export interface DomainRule {
  domain: string;
  allowed: boolean;
  maxCostPerRequest: string;
  rateLimit: number;           // requests per minute
}

export interface ActionRule {
  action: string;
  allowed: boolean;
  requiresApproval: boolean;
  maxCost?: string;
}

export interface TimeRestriction {
  allowedHoursStart: number;   // 0-23
  allowedHoursEnd: number;     // 0-23
  allowedDays: number[];       // 0=Sunday, 6=Saturday
  timezone: string;
}

export interface AgentPolicy {
  version: string;
  name: string;
  description: string;
  
  // Spending controls
  spending: SpendingLimit;
  
  // Approval settings
  approval: ApprovalThreshold;
  
  // Domain whitelist/blacklist
  domains: DomainRule[];
  
  // Action permissions
  actions: ActionRule[];
  
  // Time restrictions (optional)
  timeRestrictions?: TimeRestriction;
  
  // Emergency settings
  emergencyStop: boolean;
  emergencyContact?: string;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface PolicyViolation {
  rule: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  blocksExecution: boolean;
}

export interface SpendingTracker {
  today: string;
  thisWeek: string;
  thisMonth: string;
  lastReset: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

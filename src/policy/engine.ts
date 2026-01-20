// Policy Engine - Evaluates actions against configured policies

import { 
  AgentPolicy, 
  PolicyViolation, 
  SpendingTracker,
  SpendingLimit 
} from './types';
import { ActionType, PolicyCheckResult } from '../agent/types';

export class PolicyEngine {
  private policy: AgentPolicy;
  private spending: SpendingTracker;

  constructor(policy: AgentPolicy) {
    this.policy = policy;
    this.spending = this.initSpendingTracker();
  }

  private initSpendingTracker(): SpendingTracker {
    const now = Date.now();
    return {
      today: '$0.00',
      thisWeek: '$0.00',
      thisMonth: '$0.00',
      lastReset: {
        daily: now,
        weekly: now,
        monthly: now,
      },
    };
  }

  private parseAmount(amount: string): number {
    return parseFloat(amount.replace('$', ''));
  }

  private formatAmount(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  private resetSpendingIfNeeded(): void {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    if (now - this.spending.lastReset.daily > oneDay) {
      this.spending.today = '$0.00';
      this.spending.lastReset.daily = now;
    }
    if (now - this.spending.lastReset.weekly > oneWeek) {
      this.spending.thisWeek = '$0.00';
      this.spending.lastReset.weekly = now;
    }
    if (now - this.spending.lastReset.monthly > oneMonth) {
      this.spending.thisMonth = '$0.00';
      this.spending.lastReset.monthly = now;
    }
  }

  checkPolicy(
    actions: ActionType[],
    estimatedCost: string,
    targetDomains: string[] = []
  ): PolicyCheckResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    const appliedRules: string[] = [];

    // Check emergency stop
    if (this.policy.emergencyStop) {
      violations.push('Emergency stop is active - all actions blocked');
      return { allowed: false, violations, warnings, appliedRules: ['emergency_stop'] };
    }

    this.resetSpendingIfNeeded();

    // Check spending limits
    const cost = this.parseAmount(estimatedCost);
    const spendingViolations = this.checkSpendingLimits(cost);
    violations.push(...spendingViolations.violations);
    warnings.push(...spendingViolations.warnings);
    appliedRules.push(...spendingViolations.rules);

    // Check action permissions
    for (const action of actions) {
      const actionResult = this.checkAction(action);
      violations.push(...actionResult.violations);
      warnings.push(...actionResult.warnings);
      appliedRules.push(...actionResult.rules);
    }

    // Check domain permissions
    for (const domain of targetDomains) {
      const domainResult = this.checkDomain(domain);
      violations.push(...domainResult.violations);
      warnings.push(...domainResult.warnings);
      appliedRules.push(...domainResult.rules);
    }

    // Check time restrictions
    if (this.policy.timeRestrictions) {
      const timeResult = this.checkTimeRestrictions();
      violations.push(...timeResult.violations);
      appliedRules.push(...timeResult.rules);
    }

    return {
      allowed: violations.length === 0,
      violations,
      warnings,
      appliedRules: [...new Set(appliedRules)],
    };
  }

  private checkSpendingLimits(cost: number): { violations: string[]; warnings: string[]; rules: string[] } {
    const violations: string[] = [];
    const warnings: string[] = [];
    const rules: string[] = [];

    const maxSingle = this.parseAmount(this.policy.spending.maxSinglePayment);
    const dailyLimit = this.parseAmount(this.policy.spending.dailyLimit);
    const weeklyLimit = this.parseAmount(this.policy.spending.weeklyLimit);
    const monthlyLimit = this.parseAmount(this.policy.spending.monthlyLimit);

    const todaySpent = this.parseAmount(this.spending.today);
    const weekSpent = this.parseAmount(this.spending.thisWeek);
    const monthSpent = this.parseAmount(this.spending.thisMonth);

    // Check single payment limit
    if (cost > maxSingle) {
      violations.push(`Payment $${cost.toFixed(2)} exceeds max single payment limit of ${this.policy.spending.maxSinglePayment}`);
      rules.push('max_single_payment');
    }

    // Check daily limit
    if (todaySpent + cost > dailyLimit) {
      violations.push(`Would exceed daily limit of ${this.policy.spending.dailyLimit} (spent today: ${this.spending.today})`);
      rules.push('daily_limit');
    } else if (todaySpent + cost > dailyLimit * 0.8) {
      warnings.push(`Approaching daily limit (80%+ used)`);
    }

    // Check weekly limit
    if (weekSpent + cost > weeklyLimit) {
      violations.push(`Would exceed weekly limit of ${this.policy.spending.weeklyLimit}`);
      rules.push('weekly_limit');
    }

    // Check monthly limit
    if (monthSpent + cost > monthlyLimit) {
      violations.push(`Would exceed monthly limit of ${this.policy.spending.monthlyLimit}`);
      rules.push('monthly_limit');
    }

    // Check approval threshold
    const approvalAmount = this.parseAmount(this.policy.approval.amount);
    if (cost > approvalAmount) {
      warnings.push(`Amount exceeds approval threshold of ${this.policy.approval.amount} - requires human approval`);
      rules.push('approval_threshold');
    }

    return { violations, warnings, rules };
  }

  private checkAction(action: ActionType): { violations: string[]; warnings: string[]; rules: string[] } {
    const violations: string[] = [];
    const warnings: string[] = [];
    const rules: string[] = [];

    const actionRule = this.policy.actions.find(a => a.action === action);
    
    if (!actionRule) {
      // Action not explicitly defined - allow by default with warning
      warnings.push(`Action '${action}' not explicitly defined in policy`);
      return { violations, warnings, rules };
    }

    if (!actionRule.allowed) {
      violations.push(`Action '${action}' is not allowed by policy`);
      rules.push(`action_${action}_blocked`);
    }

    if (actionRule.requiresApproval) {
      warnings.push(`Action '${action}' requires approval`);
      rules.push(`action_${action}_approval`);
    }

    return { violations, warnings, rules };
  }

  private checkDomain(domain: string): { violations: string[]; warnings: string[]; rules: string[] } {
    const violations: string[] = [];
    const warnings: string[] = [];
    const rules: string[] = [];

    const domainRule = this.policy.domains.find(d => 
      domain.includes(d.domain) || d.domain === '*'
    );

    if (!domainRule) {
      violations.push(`Domain '${domain}' is not in allowed list`);
      rules.push('domain_not_allowed');
      return { violations, warnings, rules };
    }

    if (!domainRule.allowed) {
      violations.push(`Domain '${domain}' is explicitly blocked`);
      rules.push('domain_blocked');
    }

    return { violations, warnings, rules };
  }

  private checkTimeRestrictions(): { violations: string[]; rules: string[] } {
    const violations: string[] = [];
    const rules: string[] = [];

    if (!this.policy.timeRestrictions) {
      return { violations, rules };
    }

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    const { allowedHoursStart, allowedHoursEnd, allowedDays } = this.policy.timeRestrictions;

    if (hour < allowedHoursStart || hour >= allowedHoursEnd) {
      violations.push(`Current hour (${hour}) is outside allowed hours (${allowedHoursStart}-${allowedHoursEnd})`);
      rules.push('time_restriction_hours');
    }

    if (!allowedDays.includes(day)) {
      violations.push(`Today is not an allowed day for agent operations`);
      rules.push('time_restriction_days');
    }

    return { violations, rules };
  }

  recordSpending(amount: string): void {
    const cost = this.parseAmount(amount);
    this.spending.today = this.formatAmount(this.parseAmount(this.spending.today) + cost);
    this.spending.thisWeek = this.formatAmount(this.parseAmount(this.spending.thisWeek) + cost);
    this.spending.thisMonth = this.formatAmount(this.parseAmount(this.spending.thisMonth) + cost);
  }

  requiresApproval(amount: string): boolean {
    const cost = this.parseAmount(amount);
    const threshold = this.parseAmount(this.policy.approval.amount);
    return cost > threshold;
  }

  getSpendingStatus(): SpendingTracker {
    this.resetSpendingIfNeeded();
    return { ...this.spending };
  }

  getPolicy(): AgentPolicy {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<AgentPolicy>): void {
    this.policy = {
      ...this.policy,
      ...updates,
      updatedAt: Date.now(),
    };
  }

  setEmergencyStop(active: boolean): void {
    this.policy.emergencyStop = active;
    this.policy.updatedAt = Date.now();
  }
}

// Default policy for the agent - Commerce-enabled for hackathon demo
export const DEFAULT_POLICY: AgentPolicy = {
  version: '1.0.0',
  name: 'Trustless Agent Policy',
  description: 'Policy for autonomous commerce on Arc testnet',

  spending: {
    maxSinglePayment: '$10.00',
    dailyLimit: '$100.00',
    weeklyLimit: '$500.00',
    monthlyLimit: '$1000.00',
  },

  approval: {
    amount: '$25.00',
    cooldownMinutes: 5,
  },

  domains: [
    { domain: 'api.coingecko.com', allowed: true, maxCostPerRequest: '$0.01', rateLimit: 30 },
    { domain: 'api.openai.com', allowed: true, maxCostPerRequest: '$0.10', rateLimit: 10 },
    { domain: 'api.firecrawl.dev', allowed: true, maxCostPerRequest: '$0.05', rateLimit: 20 },
    { domain: 'duckduckgo.com', allowed: true, maxCostPerRequest: '$0.00', rateLimit: 30 },
    { domain: 'marketplace', allowed: true, maxCostPerRequest: '$100.00', rateLimit: 60 },
    { domain: 'api.commerce.coinbase.com', allowed: true, maxCostPerRequest: '$100.00', rateLimit: 30 },
    { domain: '*', allowed: true, maxCostPerRequest: '$1.00', rateLimit: 10 }, // Fallback for demo
  ],

  actions: [
    { action: 'search', allowed: true, requiresApproval: false },
    { action: 'fetch_data', allowed: true, requiresApproval: false },
    { action: 'analyze', allowed: true, requiresApproval: false },
    { action: 'report', allowed: true, requiresApproval: false },
    { action: 'pay', allowed: true, requiresApproval: false, maxCost: '$100.00' },
    { action: 'request_approval', allowed: true, requiresApproval: false },
    { action: 'browse', allowed: true, requiresApproval: false },
    { action: 'evaluate', allowed: true, requiresApproval: false },
    { action: 'purchase', allowed: true, requiresApproval: false, maxCost: '$100.00' },
  ],

  emergencyStop: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdBy: 'system',
};

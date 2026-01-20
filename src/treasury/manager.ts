// Treasury Manager - Multi-tier wallet management with guardrails

import { ethers } from 'ethers';
import { config } from '../config';

export interface TreasuryTier {
  name: 'hot' | 'warm' | 'cold';
  wallet: ethers.Wallet;
  address: string;
  maxBalance: string;
  autoRefillThreshold: string;
  requiresApproval: boolean;
}

export interface TreasuryState {
  tiers: Record<string, TreasuryTier>;
  totalBalance: string;
  pendingApprovals: PendingApproval[];
  lastAudit: number;
}

export interface PendingApproval {
  id: string;
  amount: string;
  reason: string;
  requestedAt: number;
  expiresAt: number;
  fromTier: string;
  toTier: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export class TreasuryManager {
  private provider: ethers.JsonRpcProvider;
  private tiers: Map<string, TreasuryTier> = new Map();
  private pendingApprovals: PendingApproval[] = [];
  private spendingHistory: { amount: string; timestamp: number; purpose: string }[] = [];

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
    this.initializeTiers(privateKey);
  }

  private initializeTiers(masterKey: string): void {
    const hotWallet = new ethers.Wallet(masterKey, this.provider);
    
    this.tiers.set('hot', {
      name: 'hot',
      wallet: hotWallet,
      address: hotWallet.address,
      maxBalance: '$20.00',
      autoRefillThreshold: '$5.00',
      requiresApproval: false,
    });

    this.tiers.set('warm', {
      name: 'warm',
      wallet: hotWallet,
      address: hotWallet.address,
      maxBalance: '$200.00',
      autoRefillThreshold: '$50.00',
      requiresApproval: false,
    });

    this.tiers.set('cold', {
      name: 'cold',
      wallet: hotWallet,
      address: hotWallet.address,
      maxBalance: '$10000.00',
      autoRefillThreshold: '$1000.00',
      requiresApproval: true,
    });
  }

  async getBalance(tier: string = 'hot'): Promise<string> {
    const tierConfig = this.tiers.get(tier);
    if (!tierConfig) throw new Error('Unknown tier: ' + tier);

    try {
      const balance = await this.provider.getBalance(tierConfig.address);
      return ethers.formatUnits(balance, 18);
    } catch {
      return '0.00';
    }
  }

  getHotWallet(): ethers.Wallet {
    const hot = this.tiers.get('hot');
    if (!hot) throw new Error('Hot wallet not initialized');
    return hot.wallet;
  }

  getAddress(): string {
    const hot = this.tiers.get('hot');
    if (!hot) throw new Error('Hot wallet not initialized');
    return hot.address;
  }

  async canSpend(amount: string): Promise<{ allowed: boolean; reason?: string }> {
    const amountNum = parseFloat(amount.replace('$', ''));
    const balance = parseFloat(await this.getBalance('hot'));
    
    if (balance < amountNum) {
      return { 
        allowed: false, 
        reason: 'Insufficient balance. Have: $' + balance.toFixed(2) + ', Need: $' + amountNum.toFixed(2)
      };
    }

    const hot = this.tiers.get('hot')!;
    const maxHot = parseFloat(hot.maxBalance.replace('$', ''));
    if (amountNum > maxHot) {
      return {
        allowed: false,
        reason: 'Amount exceeds hot wallet limit of ' + hot.maxBalance
      };
    }

    return { allowed: true };
  }

  recordSpending(amount: string, purpose: string): void {
    this.spendingHistory.push({
      amount,
      timestamp: Date.now(),
      purpose,
    });

    if (this.spendingHistory.length > 1000) {
      this.spendingHistory = this.spendingHistory.slice(-1000);
    }
  }

  requestApproval(amount: string, reason: string): PendingApproval {
    const approval: PendingApproval = {
      id: 'approval_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      amount,
      reason,
      requestedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      fromTier: 'warm',
      toTier: 'hot',
      status: 'pending',
    };

    this.pendingApprovals.push(approval);
    return approval;
  }

  approveRequest(approvalId: string): boolean {
    const approval = this.pendingApprovals.find(a => a.id === approvalId);
    if (!approval || approval.status !== 'pending') return false;
    if (Date.now() > approval.expiresAt) {
      approval.status = 'expired';
      return false;
    }
    approval.status = 'approved';
    return true;
  }

  getPendingApprovals(): PendingApproval[] {
    const now = Date.now();
    this.pendingApprovals = this.pendingApprovals.map(a => {
      if (a.status === 'pending' && now > a.expiresAt) {
        return { ...a, status: 'expired' as const };
      }
      return a;
    });
    return this.pendingApprovals.filter(a => a.status === 'pending');
  }

  getSpendingHistory(limit: number = 100): { amount: string; timestamp: number; purpose: string }[] {
    return this.spendingHistory.slice(-limit);
  }

  async signMessage(message: string): Promise<string> {
    return this.getHotWallet().signMessage(message);
  }
}

let treasuryInstance: TreasuryManager | null = null;

export function initTreasury(privateKey: string): TreasuryManager {
  if (!treasuryInstance) {
    treasuryInstance = new TreasuryManager(privateKey);
  }
  return treasuryInstance;
}

export function getTreasury(): TreasuryManager {
  if (!treasuryInstance) {
    throw new Error('Treasury not initialized');
  }
  return treasuryInstance;
}

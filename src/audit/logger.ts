// On-chain Audit Logger - Transparent decision trail

import { ethers } from 'ethers';
import { config } from '../config';
import { getTreasury } from '../treasury/manager';
import { AgentDecision, ExecutionResult, ThinkingStep } from '../agent/types';

export interface AuditEntry {
  id: string;
  timestamp: number;
  type: 'decision' | 'payment' | 'action' | 'error';
  hash: string;
  data: AuditData;
  onChainTx?: string;
}

export interface AuditData {
  decisionId?: string;
  query?: string;
  intent?: string;
  actions?: string[];
  cost?: string;
  result?: string;
  error?: string;
  thinkingHash?: string;
}

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
  }

  // Hash thinking steps for privacy while maintaining verifiability
  hashThinking(steps: ThinkingStep[]): string {
    const serialized = JSON.stringify(steps.map(s => ({
      step: s.step,
      thought: s.thought,
      action: s.action,
      reasoning: s.reasoning,
    })));
    return ethers.keccak256(ethers.toUtf8Bytes(serialized));
  }

  // Hash decision for audit trail
  hashDecision(decision: AgentDecision): string {
    const data = {
      id: decision.id,
      query: decision.query,
      intent: decision.intent,
      actions: decision.requiredActions,
      cost: decision.estimatedCost,
      approved: decision.approved,
      thinkingHash: this.hashThinking(decision.thinking),
    };
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
  }

  // Log a decision
  logDecision(decision: AgentDecision): AuditEntry {
    const entry: AuditEntry = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      type: 'decision',
      hash: this.hashDecision(decision),
      data: {
        decisionId: decision.id,
        query: decision.query,
        intent: decision.intent,
        actions: decision.requiredActions,
        cost: decision.estimatedCost,
        thinkingHash: this.hashThinking(decision.thinking),
      },
    };

    this.entries.push(entry);
    return entry;
  }

  // Log execution result
  logExecution(result: ExecutionResult): AuditEntry {
    const entry: AuditEntry = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      type: 'action',
      hash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
        decisionId: result.decision.id,
        success: result.success,
        totalCost: result.totalCost,
        actionsCount: result.actions.length,
        paymentsCount: result.payments.length,
      }))),
      data: {
        decisionId: result.decision.id,
        result: result.success ? 'success' : 'failed',
        cost: result.totalCost,
      },
    };

    this.entries.push(entry);
    return entry;
  }

  // Log error
  logError(decisionId: string, error: string): AuditEntry {
    const entry: AuditEntry = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      type: 'error',
      hash: ethers.keccak256(ethers.toUtf8Bytes(decisionId + ':' + error)),
      data: {
        decisionId,
        error,
      },
    };

    this.entries.push(entry);
    return entry;
  }

  // Publish audit hash on-chain (optional, for high-value decisions)
  async publishOnChain(entry: AuditEntry): Promise<string | null> {
    try {
      const treasury = getTreasury();
      const wallet = treasury.getHotWallet();

      // Send minimal tx with audit hash in data field
      const tx = await wallet.sendTransaction({
        to: wallet.address, // Self-transfer
        value: 0,
        data: ethers.hexlify(ethers.toUtf8Bytes('x402-audit:' + entry.hash)),
      });

      const receipt = await tx.wait();
      entry.onChainTx = receipt?.hash || tx.hash;
      
      return entry.onChainTx;
    } catch (error) {
      console.log('On-chain audit publish failed (non-critical)');
      return null;
    }
  }

  // Get audit trail
  getAuditTrail(limit: number = 100): AuditEntry[] {
    return this.entries.slice(-limit);
  }

  // Get entries for specific decision
  getDecisionAudit(decisionId: string): AuditEntry[] {
    return this.entries.filter(e => e.data.decisionId === decisionId);
  }

  // Verify an entry hash
  verifyEntry(entry: AuditEntry, originalData: unknown): boolean {
    const computedHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(originalData)));
    return computedHash === entry.hash;
  }

  // Export audit log for external verification
  exportAuditLog(): { entries: AuditEntry[]; exportedAt: number; totalEntries: number } {
    return {
      entries: this.entries,
      exportedAt: Date.now(),
      totalEntries: this.entries.length,
    };
  }

  // Clear old entries (keep last N)
  prune(keepLast: number = 1000): number {
    const removed = Math.max(0, this.entries.length - keepLast);
    if (removed > 0) {
      this.entries = this.entries.slice(-keepLast);
    }
    return removed;
  }
}

// Singleton
let auditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger();
  }
  return auditLogger;
}

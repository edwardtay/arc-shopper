// Payment Streaming - Pay-per-use for API credits
import { ethers } from 'ethers';
import crypto from 'crypto';
import { transferUsdc, getArcWalletInfo } from '../arc-wallet';

const MERCHANT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const COST_PER_CREDIT = 0.015; // $0.015 per credit (100 credits = $1.50)

// In-memory credit balances (use Redis in production)
const creditBalances: Map<string, CreditAccount> = new Map();

interface CreditAccount {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  transactions: CreditTransaction[];
}

interface CreditTransaction {
  type: 'purchase' | 'use';
  amount: number;
  txHash?: string;
  description?: string;
  timestamp: number;
}

// Get or create credit account
function getAccount(userId: string): CreditAccount {
  if (!creditBalances.has(userId)) {
    creditBalances.set(userId, {
      balance: 0,
      totalPurchased: 0,
      totalUsed: 0,
      transactions: [],
    });
  }
  return creditBalances.get(userId)!;
}

// Add credits after payment
export function addCredits(userId: string, credits: number, txHash: string): CreditAccount {
  const account = getAccount(userId);
  account.balance += credits;
  account.totalPurchased += credits;
  account.transactions.push({
    type: 'purchase',
    amount: credits,
    txHash,
    timestamp: Date.now(),
  });
  return account;
}

// Use credits (returns remaining or -1 if insufficient)
export function useCredits(userId: string, credits: number, description: string): number {
  const account = getAccount(userId);
  if (account.balance < credits) {
    return -1;
  }
  account.balance -= credits;
  account.totalUsed += credits;
  account.transactions.push({
    type: 'use',
    amount: credits,
    description,
    timestamp: Date.now(),
  });
  return account.balance;
}

// API endpoint
export default async function handler(req: any, res: any) {
  const { userId, action, credits, description } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  // GET - check balance
  if (req.method === 'GET' || action === 'balance') {
    const account = getAccount(req.query.userId || userId);
    return res.json({
      userId: req.query.userId || userId,
      credits: account.balance,
      totalPurchased: account.totalPurchased,
      totalUsed: account.totalUsed,
      costPerCredit: COST_PER_CREDIT,
      recentTransactions: account.transactions.slice(-10),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // POST - buy credits or use credits
  if (action === 'buy') {
    const numCredits = parseInt(credits) || 100;
    const cost = numCredits * COST_PER_CREDIT;

    // Check user balance
    const walletInfo = await getArcWalletInfo(userId);
    const userBalance = parseFloat(walletInfo.usdc);

    if (userBalance < cost) {
      return res.json({
        success: false,
        error: `Insufficient balance. Need $${cost.toFixed(2)}, have $${userBalance.toFixed(2)}`,
        required: cost,
        available: userBalance,
      });
    }

    // Execute payment
    const result = await transferUsdc(userId, MERCHANT_ADDRESS, cost);

    if (!result.success) {
      return res.json({
        success: false,
        error: result.error,
      });
    }

    // Add credits
    const account = addCredits(userId, numCredits, result.txHash!);

    return res.json({
      success: true,
      action: 'credits_purchased',
      creditsPurchased: numCredits,
      cost: cost.toFixed(2),
      txHash: result.txHash,
      newBalance: account.balance,
      explorer: `https://testnet.arcscan.app/tx/${result.txHash}`,
    });
  }

  if (action === 'use') {
    const numCredits = parseInt(credits) || 1;
    const desc = description || 'API call';

    const remaining = useCredits(userId, numCredits, desc);

    if (remaining === -1) {
      const account = getAccount(userId);
      return res.json({
        success: false,
        error: 'Insufficient credits',
        required: numCredits,
        available: account.balance,
        buyUrl: '/api/x402/stream',
      });
    }

    return res.json({
      success: true,
      action: 'credits_used',
      creditsUsed: numCredits,
      description: desc,
      remainingCredits: remaining,
    });
  }

  res.status(400).json({ error: 'Invalid action. Use: balance, buy, use' });
}

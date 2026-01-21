// Purchase History - Store and retrieve user purchases
import crypto from 'crypto';

// In-memory store (use Redis/DB in production)
const purchaseHistory: Map<string, Purchase[]> = new Map();

export interface Purchase {
  id: string;
  productId: string;
  productName: string;
  amount: string;
  txHash: string;
  contentHash: string;
  receipt: any;
  timestamp: number;
  userId: string;
}

// Add a purchase to history
export function addPurchase(userId: string, purchase: Omit<Purchase, 'id' | 'timestamp'>): Purchase {
  const id = 'purchase_' + crypto.randomBytes(8).toString('hex');
  const fullPurchase: Purchase = {
    ...purchase,
    id,
    timestamp: Date.now(),
  };

  const userHistory = purchaseHistory.get(userId) || [];
  userHistory.push(fullPurchase);
  purchaseHistory.set(userId, userHistory);

  return fullPurchase;
}

// Get user's purchase history
export function getPurchases(userId: string): Purchase[] {
  return purchaseHistory.get(userId) || [];
}

// Check if user already purchased a product
export function hasPurchased(userId: string, productId: string): Purchase | undefined {
  const history = purchaseHistory.get(userId) || [];
  return history.find(p => p.productId === productId);
}

// API endpoint
export default async function handler(req: any, res: any) {
  const userId = req.query.userId || req.body?.userId;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  if (req.method === 'GET') {
    const purchases = getPurchases(userId);
    return res.json({
      userId,
      purchases,
      total: purchases.length,
      totalSpent: purchases.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(2),
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

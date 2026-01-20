// Circle Developer-Controlled Wallets Integration
// Server-managed wallets for AI agent shopping

import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';

const CIRCLE_API_URL = 'https://api.circle.com/v1/w3s';

// In-memory cache for user wallets
const userWalletCache: Map<string, {
  walletId: string;
  walletAddress: string;
  walletSetId: string;
  createdAt: number;
}> = new Map();

// Wallet set ID (created once, reused for all users)
let globalWalletSetId: string | null = null;

function getApiKey(): string {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) throw new Error('CIRCLE_API_KEY not configured');
  return key;
}

function getEntitySecret(): string {
  // Entity secret should be stored securely - for demo, derive from API key
  const secret = process.env.CIRCLE_ENTITY_SECRET;
  if (!secret) {
    // Generate a deterministic secret for demo (in production, use proper secret management)
    return crypto.createHash('sha256').update(getApiKey() + '-entity-secret').digest('hex');
  }
  return secret;
}

// Encrypt entity secret for API requests
async function getEntitySecretCiphertext(): Promise<string> {
  // For Circle API, we need to encrypt the entity secret with their public key
  // In production, fetch the public key from Circle and encrypt properly
  // For demo, we'll use a placeholder approach
  const entitySecret = getEntitySecret();
  return Buffer.from(entitySecret).toString('base64');
}

export function isCircleConfigured(): boolean {
  return !!process.env.CIRCLE_API_KEY;
}

// Create headers for Circle API
function getHeaders() {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

// Create a wallet set (done once)
async function getOrCreateWalletSet(): Promise<string> {
  if (globalWalletSetId) return globalWalletSetId;

  try {
    // Try to list existing wallet sets first
    const listResponse = await axios.get(
      `${CIRCLE_API_URL}/developer/walletSets`,
      { headers: getHeaders(), timeout: 10000 }
    );

    const existingSets = listResponse.data?.data?.walletSets || [];
    if (existingSets.length > 0) {
      globalWalletSetId = existingSets[0].id;
      console.log('Using existing Circle wallet set:', globalWalletSetId);
      return globalWalletSetId;
    }

    // Create new wallet set
    const entitySecretCiphertext = await getEntitySecretCiphertext();
    const createResponse = await axios.post(
      `${CIRCLE_API_URL}/developer/walletSets`,
      {
        idempotencyKey: crypto.randomUUID(),
        name: 'ArcShopper-Agents',
        entitySecretCiphertext,
      },
      { headers: getHeaders(), timeout: 15000 }
    );

    globalWalletSetId = createResponse.data?.data?.walletSet?.id;
    console.log('Created Circle wallet set:', globalWalletSetId);
    return globalWalletSetId!;
  } catch (error: any) {
    console.error('Failed to create wallet set:', error.response?.data || error.message);
    throw new Error('Failed to initialize Circle wallet set');
  }
}

// Create a wallet for a user
export async function createUserWallet(userId: string): Promise<{
  walletId: string;
  walletAddress: string;
}> {
  // Check cache first
  const cached = userWalletCache.get(userId.toLowerCase());
  if (cached) {
    return { walletId: cached.walletId, walletAddress: cached.walletAddress };
  }

  try {
    const walletSetId = await getOrCreateWalletSet();
    const entitySecretCiphertext = await getEntitySecretCiphertext();

    const response = await axios.post(
      `${CIRCLE_API_URL}/developer/wallets`,
      {
        idempotencyKey: crypto.randomUUID(),
        walletSetId,
        blockchains: ['ETH-SEPOLIA'], // Use Sepolia testnet
        count: 1,
        entitySecretCiphertext,
        metadata: [{ name: 'userId', refId: userId.toLowerCase() }],
      },
      { headers: getHeaders(), timeout: 15000 }
    );

    const wallet = response.data?.data?.wallets?.[0];
    if (!wallet) throw new Error('No wallet created');

    const result = {
      walletId: wallet.id,
      walletAddress: wallet.address,
    };

    // Cache the wallet
    userWalletCache.set(userId.toLowerCase(), {
      ...result,
      walletSetId,
      createdAt: Date.now(),
    });

    console.log(`Created Circle wallet ${wallet.address} for user ${userId}`);
    return result;
  } catch (error: any) {
    console.error('Failed to create wallet:', error.response?.data || error.message);
    throw new Error('Failed to create Circle wallet');
  }
}

// Get or create wallet for user
export async function getOrCreateUserWallet(userId: string): Promise<{
  walletId: string;
  walletAddress: string;
  isNew: boolean;
}> {
  // Check cache
  const cached = userWalletCache.get(userId.toLowerCase());
  if (cached) {
    return { walletId: cached.walletId, walletAddress: cached.walletAddress, isNew: false };
  }

  // Try to find existing wallet
  try {
    const wallets = await listUserWallets(userId);
    if (wallets.length > 0) {
      const wallet = wallets[0];
      userWalletCache.set(userId.toLowerCase(), {
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        walletSetId: globalWalletSetId || '',
        createdAt: Date.now(),
      });
      return { walletId: wallet.walletId, walletAddress: wallet.walletAddress, isNew: false };
    }
  } catch (e) {
    // Continue to create new wallet
  }

  // Create new wallet
  const created = await createUserWallet(userId);
  return { ...created, isNew: true };
}

// List wallets for a user
export async function listUserWallets(userId: string): Promise<Array<{
  walletId: string;
  walletAddress: string;
  blockchain: string;
}>> {
  try {
    const response = await axios.get(
      `${CIRCLE_API_URL}/developer/wallets`,
      {
        headers: getHeaders(),
        params: { refId: userId.toLowerCase() },
        timeout: 10000,
      }
    );

    return (response.data?.data?.wallets || []).map((w: any) => ({
      walletId: w.id,
      walletAddress: w.address,
      blockchain: w.blockchain,
    }));
  } catch (error: any) {
    console.error('Failed to list wallets:', error.response?.data || error.message);
    return [];
  }
}

// Get wallet balance
export async function getWalletBalance(walletId: string): Promise<{
  native: string;
  usdc: string;
}> {
  try {
    const response = await axios.get(
      `${CIRCLE_API_URL}/developer/wallets/${walletId}/balances`,
      { headers: getHeaders(), timeout: 10000 }
    );

    const balances = response.data?.data?.tokenBalances || [];
    let native = '0';
    let usdc = '0';

    for (const b of balances) {
      if (b.token?.symbol === 'ETH' || b.token?.isNative) {
        native = b.amount || '0';
      }
      if (b.token?.symbol === 'USDC') {
        usdc = b.amount || '0';
      }
    }

    return { native, usdc };
  } catch (error: any) {
    console.error('Failed to get balance:', error.response?.data || error.message);
    return { native: '0', usdc: '0' };
  }
}

// Transfer tokens (for agent payments)
export async function transferTokens(
  walletId: string,
  destinationAddress: string,
  amount: string,
  tokenAddress?: string // null for native token
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    const entitySecretCiphertext = await getEntitySecretCiphertext();

    const payload: any = {
      idempotencyKey: crypto.randomUUID(),
      walletId,
      destinationAddress,
      amounts: [amount],
      entitySecretCiphertext,
      feeLevel: 'MEDIUM',
    };

    if (tokenAddress) {
      payload.tokenAddress = tokenAddress;
    }

    const response = await axios.post(
      `${CIRCLE_API_URL}/developer/transactions/transfer`,
      payload,
      { headers: getHeaders(), timeout: 30000 }
    );

    const tx = response.data?.data;
    return {
      success: true,
      txHash: tx?.txHash || tx?.id,
    };
  } catch (error: any) {
    console.error('Transfer failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

// Estimate gas for a transaction
export async function estimateGas(
  walletId: string,
  destinationAddress: string,
  amount: string
): Promise<{ gasLimit: string; gasFee: string } | null> {
  try {
    const response = await axios.post(
      `${CIRCLE_API_URL}/developer/transactions/transfer/estimateFee`,
      {
        walletId,
        destinationAddress,
        amounts: [amount],
      },
      { headers: getHeaders(), timeout: 10000 }
    );

    const fee = response.data?.data;
    return {
      gasLimit: fee?.gasLimit || '21000',
      gasFee: fee?.maxFee || '0',
    };
  } catch (error) {
    return null;
  }
}

// Check user exists (by checking if they have wallets)
export async function checkUserExists(userId: string): Promise<boolean> {
  const cached = userWalletCache.get(userId.toLowerCase());
  if (cached) return true;

  const wallets = await listUserWallets(userId);
  return wallets.length > 0;
}

// Get full user status
export async function getUserWalletStatus(userId: string): Promise<{
  exists: boolean;
  walletId?: string;
  walletAddress?: string;
  balance?: { native: string; usdc: string };
}> {
  try {
    const wallet = await getOrCreateUserWallet(userId);
    const balance = await getWalletBalance(wallet.walletId);

    return {
      exists: true,
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      balance,
    };
  } catch (error) {
    return { exists: false };
  }
}

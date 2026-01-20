// Circle API Integration - Direct USDC Payments
// Enables programmable wallets and direct USDC transfers on Arc

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const CIRCLE_API_URL = 'https://api.circle.com/v1';

export interface CircleWallet {
  walletId: string;
  entityId: string;
  type: string;
  description?: string;
  balances: CircleBalance[];
}

export interface CircleBalance {
  amount: string;
  currency: string;
}

export interface CircleTransfer {
  id: string;
  source: { type: string; id: string };
  destination: { type: string; address: string; chain: string };
  amount: { amount: string; currency: string };
  status: 'pending' | 'complete' | 'failed';
  transactionHash?: string;
  createDate: string;
}

export interface CirclePayoutRequest {
  idempotencyKey: string;
  amount: string;
  currency: string;
  destinationAddress: string;
  chain: string;
  metadata?: Record<string, string>;
}

export class CircleClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.apis.circleApiKey || '';

    this.client = axios.create({
      baseURL: CIRCLE_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  // Get USDC balance for a wallet
  async getBalance(walletId: string): Promise<CircleBalance[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const response = await this.client.get(`/wallets/${walletId}/balances`);
      return response.data.data;
    } catch (error) {
      console.error('Circle getBalance error:', error);
      return [];
    }
  }

  // Create a blockchain payout (USDC transfer)
  async createPayout(request: CirclePayoutRequest): Promise<CircleTransfer | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await this.client.post('/payouts', {
        idempotencyKey: request.idempotencyKey,
        amount: {
          amount: request.amount,
          currency: request.currency,
        },
        destination: {
          type: 'blockchain',
          address: request.destinationAddress,
          chain: request.chain,
        },
        metadata: request.metadata,
      });

      return {
        id: response.data.data.id,
        source: { type: 'wallet', id: 'master' },
        destination: {
          type: 'blockchain',
          address: request.destinationAddress,
          chain: request.chain,
        },
        amount: { amount: request.amount, currency: request.currency },
        status: response.data.data.status,
        transactionHash: response.data.data.transactionHash,
        createDate: response.data.data.createDate,
      };
    } catch (error) {
      console.error('Circle createPayout error:', error);
      return null;
    }
  }

  // Create a transfer intent for USDC
  async createTransferIntent(
    amount: string,
    destinationAddress: string,
    description?: string
  ): Promise<{ intentId: string; paymentUrl: string } | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await this.client.post('/payments/intents', {
        idempotencyKey: uuidv4(),
        amount: { amount, currency: 'USD' },
        settlementCurrency: 'USD',
        paymentMethods: [{ type: 'blockchain', chain: 'ETH' }],
        metadata: {
          description: description || 'Agent payment',
          destinationAddress,
        },
      });

      return {
        intentId: response.data.data.id,
        paymentUrl: response.data.data.checkoutUrl || '',
      };
    } catch (error) {
      console.error('Circle createTransferIntent error:', error);
      return null;
    }
  }

  // Get transfer status
  async getTransferStatus(transferId: string): Promise<CircleTransfer | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await this.client.get(`/transfers/${transferId}`);
      return response.data.data;
    } catch (error) {
      console.error('Circle getTransferStatus error:', error);
      return null;
    }
  }
}

// USDC Payment Service - Combines Circle with on-chain
export class USDCPaymentService {
  private circle: CircleClient;

  constructor() {
    this.circle = new CircleClient();
  }

  // Pay a merchant using USDC via Circle
  async payMerchant(
    amount: string,
    merchantAddress: string,
    orderId: string,
    productName: string
  ): Promise<{
    success: boolean;
    method: 'circle' | 'onchain';
    transferId?: string;
    txHash?: string;
    error?: string;
  }> {
    if (!this.circle.isConfigured()) {
      return {
        success: false,
        method: 'circle',
        error: 'Circle API not configured',
      };
    }

    const payout = await this.circle.createPayout({
      idempotencyKey: uuidv4(),
      amount: amount.replace('$', ''),
      currency: 'USD',
      destinationAddress: merchantAddress,
      chain: 'ETH',
      metadata: {
        orderId,
        productName,
        source: 'trustless-agent',
      },
    });

    if (payout) {
      return {
        success: true,
        method: 'circle',
        transferId: payout.id,
        txHash: payout.transactionHash,
      };
    }

    return {
      success: false,
      method: 'circle',
      error: 'Payment failed',
    };
  }

  // Get available payment balance
  async getAvailableBalance(): Promise<string> {
    if (!this.circle.isConfigured()) {
      return '$0.00';
    }
    const balances = await this.circle.getBalance('master');
    const usdBalance = balances.find(b => b.currency === 'USD');
    return usdBalance ? `$${usdBalance.amount}` : '$0.00';
  }

  // Create a payment request for a product
  async createPaymentRequest(
    product: { name: string; price: string; merchant: string },
    buyerAddress: string
  ): Promise<{
    requestId: string;
    amount: string;
    currency: string;
    paymentUrl?: string;
    expiresAt: number;
  }> {
    const amount = product.price.replace('$', '');
    const intent = await this.circle.createTransferIntent(
      amount,
      buyerAddress,
      `Purchase: ${product.name} from ${product.merchant}`
    );

    return {
      requestId: intent?.intentId || 'req_' + Date.now().toString(36),
      amount: product.price,
      currency: 'USDC',
      paymentUrl: intent?.paymentUrl,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    };
  }
}

// Singleton instances
let circleClient: CircleClient | null = null;
let usdcService: USDCPaymentService | null = null;

export function getCircleClient(): CircleClient {
  if (!circleClient) {
    circleClient = new CircleClient();
  }
  return circleClient;
}

export function getUSDCService(): USDCPaymentService {
  if (!usdcService) {
    usdcService = new USDCPaymentService();
  }
  return usdcService;
}

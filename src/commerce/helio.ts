// Helio Integration
// Solana payment links, subscriptions, and commerce

import axios, { AxiosInstance } from 'axios';

const HELIO_API_URL = 'https://api.hel.io/v1';

export interface HelioConfig {
  apiKey: string;
  secretKey?: string;
}

export interface HelioPayLink {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: 'USDC' | 'SOL' | 'USDT';
  paymentUrl: string;
  qrCodeUrl?: string;
  recipient: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface HelioTransaction {
  id: string;
  payLinkId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  payer?: string;
  transactionSignature?: string;
  createdAt: string;
}

export interface HelioSubscription {
  id: string;
  name: string;
  price: number;
  currency: 'USDC' | 'SOL';
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  subscriberWallet?: string;
  status: 'active' | 'cancelled' | 'paused';
  nextPaymentDate?: string;
}

export class HelioClient {
  private client: AxiosInstance;
  private apiKey: string;
  private secretKey: string;

  constructor(config?: Partial<HelioConfig>) {
    this.apiKey = config?.apiKey || process.env.HELIO_API_KEY || '';
    this.secretKey = config?.secretKey || process.env.HELIO_SECRET_KEY || '';

    this.client = axios.create({
      baseURL: HELIO_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  // Create a payment link
  async createPayLink(
    name: string,
    price: number,
    currency: 'USDC' | 'SOL' | 'USDT' = 'USDC',
    options?: {
      description?: string;
      recipientWallet?: string;
      redirectUrl?: string;
      webhookUrl?: string;
    }
  ): Promise<HelioPayLink | null> {
    if (!this.isConfigured()) {
      // Return demo pay link when not configured
      return this.createDemoPayLink(name, price, currency, options);
    }

    try {
      const response = await this.client.post('/paylink', {
        name,
        price,
        currency,
        description: options?.description,
        recipientWallet: options?.recipientWallet,
        redirectUrl: options?.redirectUrl,
        webhookUrl: options?.webhookUrl,
      });

      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        price: response.data.price,
        currency: response.data.currency,
        paymentUrl: response.data.paymentUrl,
        qrCodeUrl: response.data.qrCodeUrl,
        recipient: response.data.recipientWallet,
        status: 'active',
        createdAt: response.data.createdAt,
      };
    } catch (error) {
      console.error('Helio createPayLink error:', error);
      return this.createDemoPayLink(name, price, currency, options);
    }
  }

  // Demo pay link for when API key not configured
  private createDemoPayLink(
    name: string,
    price: number,
    currency: 'USDC' | 'SOL' | 'USDT',
    options?: { description?: string; recipientWallet?: string }
  ): HelioPayLink {
    const id = 'demo_' + Date.now().toString(36);
    return {
      id,
      name,
      description: options?.description,
      price,
      currency,
      paymentUrl: `https://app.hel.io/pay/${id}`,
      qrCodeUrl: `https://api.hel.io/qr/${id}`,
      recipient: options?.recipientWallet || 'demo-wallet',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  // Get pay link details
  async getPayLink(payLinkId: string): Promise<HelioPayLink | null> {
    if (!this.isConfigured() || payLinkId.startsWith('demo_')) {
      return null;
    }

    try {
      const response = await this.client.get(`/paylink/${payLinkId}`);
      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description,
        price: response.data.price,
        currency: response.data.currency,
        paymentUrl: response.data.paymentUrl,
        qrCodeUrl: response.data.qrCodeUrl,
        recipient: response.data.recipientWallet,
        status: response.data.status,
        createdAt: response.data.createdAt,
      };
    } catch (error) {
      console.error('Helio getPayLink error:', error);
      return null;
    }
  }

  // List all pay links
  async listPayLinks(): Promise<HelioPayLink[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get('/paylinks');
      return (response.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        paymentUrl: p.paymentUrl,
        recipient: p.recipientWallet,
        status: p.status,
        createdAt: p.createdAt,
      }));
    } catch (error) {
      console.error('Helio listPayLinks error:', error);
      return [];
    }
  }

  // Get transactions for a pay link
  async getTransactions(payLinkId: string): Promise<HelioTransaction[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get(`/paylink/${payLinkId}/transactions`);
      return (response.data || []).map((t: any) => ({
        id: t.id,
        payLinkId: t.payLinkId,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        payer: t.payer,
        transactionSignature: t.transactionSignature,
        createdAt: t.createdAt,
      }));
    } catch (error) {
      console.error('Helio getTransactions error:', error);
      return [];
    }
  }

  // Create a subscription
  async createSubscription(
    name: string,
    price: number,
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
    currency: 'USDC' | 'SOL' = 'USDC',
    options?: {
      description?: string;
      recipientWallet?: string;
    }
  ): Promise<HelioSubscription | null> {
    if (!this.isConfigured()) {
      return {
        id: 'demo_sub_' + Date.now().toString(36),
        name,
        price,
        currency,
        interval,
        status: 'active',
      };
    }

    try {
      const response = await this.client.post('/subscription', {
        name,
        price,
        currency,
        interval,
        description: options?.description,
        recipientWallet: options?.recipientWallet,
      });

      return {
        id: response.data.id,
        name: response.data.name,
        price: response.data.price,
        currency: response.data.currency,
        interval: response.data.interval,
        status: 'active',
      };
    } catch (error) {
      console.error('Helio createSubscription error:', error);
      return null;
    }
  }

  // Quick pay - generate payment URL for immediate use
  async quickPay(
    amount: number,
    productName: string,
    currency: 'USDC' | 'SOL' = 'USDC'
  ): Promise<{ paymentUrl: string; payLinkId: string } | null> {
    const payLink = await this.createPayLink(productName, amount, currency, {
      description: `Payment for ${productName}`,
    });

    if (!payLink) return null;

    return {
      paymentUrl: payLink.paymentUrl,
      payLinkId: payLink.id,
    };
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      apiUrl: HELIO_API_URL,
    };
  }
}

// Singleton
let helioClient: HelioClient | null = null;

export function getHelioClient(config?: Partial<HelioConfig>): HelioClient {
  if (!helioClient) {
    helioClient = new HelioClient(config);
  }
  return helioClient;
}

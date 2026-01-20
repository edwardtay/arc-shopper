// Stripe Integration - Products & Payments
// Access real merchant catalogs and process payments

import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { Product } from './types';

const STRIPE_API_URL = 'https://api.stripe.com/v1';

export interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  images: string[];
  metadata: Record<string, string>;
  default_price?: string;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  };
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'canceled';
  client_secret: string;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired';
}

export class StripeClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.apis.stripeSecretKey || '';

    this.client = axios.create({
      baseURL: STRIPE_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.startsWith('sk_');
  }

  // List products from Stripe catalog
  async listProducts(limit: number = 20): Promise<StripeProduct[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get('/products', {
        params: { limit, active: true },
      });
      return response.data.data;
    } catch (error) {
      console.error('Stripe listProducts error:', error);
      return [];
    }
  }

  // Get product by ID
  async getProduct(productId: string): Promise<StripeProduct | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      console.error('Stripe getProduct error:', error);
      return null;
    }
  }

  // List prices for a product
  async listPrices(productId?: string): Promise<StripePrice[]> {
    if (!this.isConfigured()) return [];

    try {
      const params: Record<string, any> = { limit: 50, active: true };
      if (productId) params.product = productId;

      const response = await this.client.get('/prices', { params });
      return response.data.data;
    } catch (error) {
      console.error('Stripe listPrices error:', error);
      return [];
    }
  }

  // Create a payment intent
  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    metadata?: Record<string, string>
  ): Promise<StripePaymentIntent | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await this.client.post('/payment_intents',
        new URLSearchParams({
          amount: amount.toString(),
          currency,
          'automatic_payment_methods[enabled]': 'true',
          ...Object.entries(metadata || {}).reduce((acc, [k, v]) => {
            acc[`metadata[${k}]`] = v;
            return acc;
          }, {} as Record<string, string>),
        })
      );
      return response.data;
    } catch (error) {
      console.error('Stripe createPaymentIntent error:', error);
      return null;
    }
  }

  // Create a checkout session
  async createCheckoutSession(
    lineItems: { price: string; quantity: number }[],
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>
  ): Promise<StripeCheckoutSession | null> {
    if (!this.isConfigured()) return null;

    try {
      const params = new URLSearchParams({
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      lineItems.forEach((item, i) => {
        params.append(`line_items[${i}][price]`, item.price);
        params.append(`line_items[${i}][quantity]`, item.quantity.toString());
      });

      Object.entries(metadata || {}).forEach(([k, v]) => {
        params.append(`metadata[${k}]`, v);
      });

      const response = await this.client.post('/checkout/sessions', params);
      return response.data;
    } catch (error) {
      console.error('Stripe createCheckoutSession error:', error);
      return null;
    }
  }

  // Convert Stripe products to our Product format
  async getProductsAsUnified(): Promise<Product[]> {
    const [products, prices] = await Promise.all([
      this.listProducts(),
      this.listPrices(),
    ]);

    if (products.length === 0) return [];

    const priceMap = new Map<string, StripePrice>();
    prices.forEach(p => {
      if (typeof p.product === 'string') {
        priceMap.set(p.product, p);
      }
    });

    return products.map(p => {
      const price = priceMap.get(p.id);
      const amount = price ? (price.unit_amount / 100).toFixed(2) : '0.00';

      return {
        id: `stripe_${p.id}`,
        name: p.name,
        description: p.description || '',
        price: `$${amount}`,
        currency: price?.currency?.toUpperCase() || 'USD',
        category: p.metadata.category || 'general',
        merchant: 'stripe',
        imageUrl: p.images[0],
        inStock: p.active,
        attributes: {
          source: 'stripe',
          stripeProductId: p.id,
          stripePriceId: price?.id || '',
          priceType: price?.type || 'one_time',
        },
      };
    });
  }
}

// Singleton
let stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
  if (!stripeClient) {
    stripeClient = new StripeClient();
  }
  return stripeClient;
}

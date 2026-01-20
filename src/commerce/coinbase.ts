// Commerce Integration - Coinbase Commerce + Circle USDC
// Supports multiple payment methods: x402, Circle, Coinbase Commerce

import axios from 'axios';
import { config } from '../config';
import { CoinbaseCharge, Product, Order, PaymentMethodType } from './types';
import { getTreasury } from '../treasury/manager';
import { makePayment } from '../payments/x402';
import { getUSDCService } from './circle';

const COINBASE_API_URL = 'https://api.commerce.coinbase.com';
const API_VERSION = '2018-03-22';

export class CoinbaseCommerceClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.apis.coinbaseCommerce;
  }

  private getHeaders() {
    return {
      'X-CC-Api-Key': this.apiKey,
      'X-CC-Version': API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  // Create a charge for a product
  async createCharge(product: Product, metadata?: Record<string, string>): Promise<CoinbaseCharge | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await axios.post(
        COINBASE_API_URL + '/charges',
        {
          name: product.name,
          description: product.description,
          pricing_type: 'fixed_price',
          local_price: {
            amount: product.price.replace('$', ''),
            currency: 'USD',
          },
          metadata: {
            product_id: product.id,
            merchant: product.merchant,
            ...metadata,
          },
        },
        { headers: this.getHeaders(), timeout: 15000 }
      );

      return response.data.data as CoinbaseCharge;
    } catch (error) {
      console.error('Failed to create Coinbase charge:', error);
      return null;
    }
  }

  // Get charge status
  async getCharge(chargeId: string): Promise<CoinbaseCharge | null> {
    if (!this.apiKey || chargeId.startsWith('demo_')) {
      return null;
    }

    try {
      const response = await axios.get(
        COINBASE_API_URL + '/charges/' + chargeId,
        { headers: this.getHeaders(), timeout: 10000 }
      );
      return response.data.data as CoinbaseCharge;
    } catch (error) {
      console.error('Failed to get charge:', error);
      return null;
    }
  }

  // List all charges
  async listCharges(limit: number = 25): Promise<CoinbaseCharge[]> {
    if (!this.apiKey) return [];

    try {
      const response = await axios.get(
        COINBASE_API_URL + '/charges',
        { 
          headers: this.getHeaders(), 
          params: { limit },
          timeout: 10000 
        }
      );
      return response.data.data as CoinbaseCharge[];
    } catch (error) {
      console.error('Failed to list charges:', error);
      return [];
    }
  }
}

// Re-export payment method type and create local alias
export type PaymentMethod = PaymentMethodType;

// Order Manager - handles the full purchase flow with multiple payment options
export class OrderManager {
  private coinbase: CoinbaseCommerceClient;
  private orders: Order[] = [];

  constructor() {
    this.coinbase = new CoinbaseCommerceClient();
  }

  // Create an order and initiate payment
  async createOrder(
    product: Product,
    agentAddress: string,
    paymentMethod: PaymentMethod = 'circle'
  ): Promise<Order> {
    const orderId = 'order_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    // Create Coinbase charge for tracking (optional)
    const charge = await this.coinbase.createCharge(product, {
      agent_address: agentAddress,
      order_id: orderId,
    });

    const order: Order = {
      id: orderId,
      product,
      quantity: 1,
      totalAmount: product.price,
      paymentMethod,
      paymentStatus: 'pending',
      chargeId: charge?.id,
      createdAt: Date.now(),
    };

    this.orders.push(order);
    return order;
  }

  // Execute payment using Circle USDC
  async executeCirclePayment(orderId: string): Promise<Order> {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found: ' + orderId);

    order.paymentStatus = 'processing';
    order.paymentMethod = 'circle';

    try {
      const { ethers } = await import('ethers');
      const merchantHash = ethers.keccak256(
        ethers.toUtf8Bytes(order.product.merchant + ':' + order.product.id)
      );
      const merchantAddress = ethers.getAddress('0x' + merchantHash.slice(26));

      const usdcService = getUSDCService();
      const result = await usdcService.payMerchant(
        order.totalAmount,
        merchantAddress,
        order.id,
        order.product.name
      );

      order.txHash = result.txHash;
      order.paymentStatus = result.success ? 'confirmed' : 'failed';
      order.completedAt = Date.now();

      return order;
    } catch (error) {
      order.paymentStatus = 'failed';
      throw error;
    }
  }

  // Execute payment using x402 protocol
  async executeX402Payment(orderId: string): Promise<Order> {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found: ' + orderId);

    order.paymentStatus = 'processing';
    order.paymentMethod = 'x402';

    try {
      // Demo merchant address - real on-chain recipient for hackathon
      // Using a fixed address so transactions are verifiable on explorer
      const DEMO_MERCHANT_ADDRESS = '0xB4c60b630b0eD7009C66D139d6aD1b876F54A1EA';

      const paymentResult = await makePayment(
        order.totalAmount,
        DEMO_MERCHANT_ADDRESS,
        'purchase:' + order.product.id
      );

      order.txHash = paymentResult.txHash;
      order.paymentStatus = paymentResult.status === 'confirmed' ? 'confirmed' : 'pending';
      order.completedAt = Date.now();

      return order;
    } catch (error) {
      order.paymentStatus = 'failed';
      throw error;
    }
  }

  // Execute payment with auto-selection of best method
  async executePayment(orderId: string, preferredMethod?: PaymentMethod): Promise<Order> {
    const method = preferredMethod || 'circle';

    if (method === 'circle') {
      return this.executeCirclePayment(orderId);
    }
    return this.executeX402Payment(orderId);
  }

  // Full purchase flow - create order and pay
  async purchase(
    product: Product,
    agentAddress: string,
    paymentMethod: PaymentMethod = 'circle'
  ): Promise<Order> {
    const order = await this.createOrder(product, agentAddress, paymentMethod);
    return this.executePayment(order.id, paymentMethod);
  }

  // Get order by ID
  getOrder(orderId: string): Order | undefined {
    return this.orders.find(o => o.id === orderId);
  }

  // Get all orders
  getOrders(): Order[] {
    return [...this.orders];
  }

  // Get orders by status
  getOrdersByStatus(status: Order['paymentStatus']): Order[] {
    return this.orders.filter(o => o.paymentStatus === status);
  }

  // Get available payment methods
  getAvailablePaymentMethods(): PaymentMethod[] {
    const methods: PaymentMethod[] = ['x402']; // Always available
    if (config.apis.circleApiKey) methods.unshift('circle');
    if (config.apis.coinbaseCommerce) methods.push('coinbase_commerce');
    return methods;
  }
}

// Singleton instances
let coinbaseClient: CoinbaseCommerceClient | null = null;
let orderManager: OrderManager | null = null;

export function getCoinbaseClient(): CoinbaseCommerceClient {
  if (!coinbaseClient) {
    coinbaseClient = new CoinbaseCommerceClient();
  }
  return coinbaseClient;
}

export function getOrderManager(): OrderManager {
  if (!orderManager) {
    orderManager = new OrderManager();
  }
  return orderManager;
}

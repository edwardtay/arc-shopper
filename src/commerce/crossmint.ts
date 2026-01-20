// Crossmint Integration
// NFT Commerce - mint and purchase NFTs with crypto or credit card

import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

const CROSSMINT_API_URL = 'https://www.crossmint.com/api';
const CROSSMINT_STAGING_URL = 'https://staging.crossmint.com/api';

export interface CrossmintConfig {
  apiKey: string;
  projectId: string;
  environment: 'production' | 'staging';
}

export interface NFTCollection {
  id: string;
  name: string;
  description?: string;
  chain: 'ethereum' | 'polygon' | 'solana' | 'base';
  contractAddress?: string;
  imageUrl?: string;
}

export interface NFTMintRequest {
  collectionId: string;
  recipient: string; // wallet address or email
  metadata: {
    name: string;
    description?: string;
    image: string;
    attributes?: { trait_type: string; value: string }[];
  };
}

export interface NFTMintResult {
  id: string;
  status: 'pending' | 'success' | 'failed';
  chain: string;
  contractAddress?: string;
  tokenId?: string;
  transactionHash?: string;
  recipient: string;
  onChainUrl?: string;
}

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
  expiresAt: string;
  status: 'pending' | 'completed' | 'expired';
  lineItems: { collectionId: string; quantity: number }[];
  payment: {
    method: 'crypto' | 'credit-card';
    currency: string;
    amount: string;
  };
}

export class CrossmintClient {
  private client: AxiosInstance;
  private apiKey: string;
  private projectId: string;
  private environment: 'production' | 'staging';

  constructor(cfg?: Partial<CrossmintConfig>) {
    this.apiKey = cfg?.apiKey || process.env.CROSSMINT_API_KEY || '';
    this.projectId = cfg?.projectId || process.env.CROSSMINT_PROJECT_ID || '';
    this.environment = cfg?.environment || 'staging';

    const baseURL = this.environment === 'production'
      ? CROSSMINT_API_URL
      : CROSSMINT_STAGING_URL;

    this.client = axios.create({
      baseURL,
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  // Create an NFT collection
  async createCollection(
    name: string,
    chain: 'ethereum' | 'polygon' | 'solana' | 'base' = 'polygon',
    options?: {
      description?: string;
      imageUrl?: string;
      royaltyPercentage?: number;
    }
  ): Promise<NFTCollection | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await this.client.post('/2022-06-09/collections/', {
        chain,
        metadata: {
          name,
          description: options?.description || '',
          imageUrl: options?.imageUrl,
        },
        fungibility: 'non-fungible',
        supplyLimit: 10000,
        payments: {
          price: '0',
          recipientAddress: 'self',
        },
      });

      return {
        id: response.data.id,
        name,
        description: options?.description,
        chain,
        contractAddress: response.data.contractAddress,
        imageUrl: options?.imageUrl,
      };
    } catch (error) {
      console.error('Crossmint createCollection error:', error);
      return null;
    }
  }

  // Mint an NFT to a wallet or email
  async mintNFT(request: NFTMintRequest): Promise<NFTMintResult | null> {
    if (!this.isConfigured()) return null;

    try {
      const isEmail = request.recipient.includes('@');
      const recipientParam = isEmail
        ? { email: request.recipient }
        : { wallet: request.recipient };

      const response = await this.client.post(
        `/2022-06-09/collections/${request.collectionId}/nfts`,
        {
          recipient: recipientParam,
          metadata: request.metadata,
        }
      );

      return {
        id: response.data.id,
        status: response.data.onChain?.status || 'pending',
        chain: response.data.onChain?.chain,
        contractAddress: response.data.onChain?.contractAddress,
        tokenId: response.data.onChain?.tokenId,
        transactionHash: response.data.onChain?.txId,
        recipient: request.recipient,
        onChainUrl: response.data.onChain?.owner,
      };
    } catch (error) {
      console.error('Crossmint mintNFT error:', error);
      return null;
    }
  }

  // Create a checkout session for NFT purchase
  async createCheckout(
    collectionId: string,
    quantity: number = 1,
    options?: {
      title?: string;
      description?: string;
      imageUrl?: string;
      successUrl?: string;
      cancelUrl?: string;
      paymentMethod?: 'crypto' | 'credit-card';
    }
  ): Promise<CheckoutSession | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await this.client.post('/2022-06-09/checkout/mint', {
        collectionId,
        quantity,
        title: options?.title || 'NFT Purchase',
        description: options?.description,
        imageUrl: options?.imageUrl,
        callbackUrl: options?.successUrl,
        cancelUrl: options?.cancelUrl,
        paymentMethod: options?.paymentMethod || 'crypto',
      });

      return {
        id: response.data.id,
        checkoutUrl: response.data.checkoutUrl,
        expiresAt: response.data.expiresAt,
        status: 'pending',
        lineItems: [{ collectionId, quantity }],
        payment: {
          method: options?.paymentMethod || 'crypto',
          currency: 'USD',
          amount: response.data.price || '0',
        },
      };
    } catch (error) {
      console.error('Crossmint createCheckout error:', error);
      return null;
    }
  }

  // Get NFT by ID
  async getNFT(collectionId: string, nftId: string): Promise<NFTMintResult | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await this.client.get(
        `/2022-06-09/collections/${collectionId}/nfts/${nftId}`
      );

      return {
        id: response.data.id,
        status: response.data.onChain?.status || 'pending',
        chain: response.data.onChain?.chain,
        contractAddress: response.data.onChain?.contractAddress,
        tokenId: response.data.onChain?.tokenId,
        transactionHash: response.data.onChain?.txId,
        recipient: response.data.onChain?.owner || '',
      };
    } catch (error) {
      console.error('Crossmint getNFT error:', error);
      return null;
    }
  }

  // List collections
  async listCollections(): Promise<NFTCollection[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get('/2022-06-09/collections/');
      return response.data.map((c: any) => ({
        id: c.id,
        name: c.metadata?.name || c.id,
        description: c.metadata?.description,
        chain: c.chain,
        contractAddress: c.contractAddress,
        imageUrl: c.metadata?.imageUrl,
      }));
    } catch (error) {
      console.error('Crossmint listCollections error:', error);
      return [];
    }
  }

  // Get wallet NFTs
  async getWalletNFTs(
    walletAddress: string,
    chain: 'ethereum' | 'polygon' | 'solana' = 'polygon'
  ): Promise<any[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get(
        `/2022-06-09/wallets/${chain}:${walletAddress}/nfts`
      );
      return response.data || [];
    } catch (error) {
      console.error('Crossmint getWalletNFTs error:', error);
      return [];
    }
  }

  getEnvironment() {
    return {
      environment: this.environment,
      configured: this.isConfigured(),
      projectId: this.projectId,
    };
  }
}

// Singleton
let crossmintClient: CrossmintClient | null = null;

export function getCrossmintClient(config?: Partial<CrossmintConfig>): CrossmintClient {
  if (!crossmintClient) {
    crossmintClient = new CrossmintClient(config);
  }
  return crossmintClient;
}

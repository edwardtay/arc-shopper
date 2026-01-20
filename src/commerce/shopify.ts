// Shopify Storefront API Integration
// Access real e-commerce stores and products

import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { Product } from './types';

export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  images: { url: string; altText?: string }[];
  variants: ShopifyVariant[];
  availableForSale: boolean;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  price: { amount: string; currencyCode: string };
  availableForSale: boolean;
  sku?: string;
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  lines: { id: string; quantity: number; merchandise: { id: string } }[];
  cost: { totalAmount: { amount: string; currencyCode: string } };
}

export interface ShopifyStoreConfig {
  storeDomain: string;
  storefrontAccessToken: string;
  name: string;
}

// Public Shopify stores with Storefront API access
export const PUBLIC_STORES: ShopifyStoreConfig[] = [
  {
    storeDomain: 'hydrogen-preview.myshopify.com',
    storefrontAccessToken: '3b580e70970c4528da70c98e097c2fa0',
    name: 'Hydrogen Store',
  },
];

export class ShopifyStorefrontClient {
  private client: AxiosInstance;
  private storeDomain: string;
  private storeName: string;

  constructor(storeConfig?: ShopifyStoreConfig) {
    // Use configured store or default to public Hydrogen store
    const cfg = storeConfig || {
      storeDomain: config.apis.shopifyStoreDomain || PUBLIC_STORES[0].storeDomain,
      storefrontAccessToken: config.apis.shopifyStorefrontToken || PUBLIC_STORES[0].storefrontAccessToken,
      name: config.apis.shopifyStoreDomain ? 'Shopify' : PUBLIC_STORES[0].name,
    };

    this.storeDomain = cfg.storeDomain;
    this.storeName = cfg.name;

    this.client = axios.create({
      baseURL: `https://${cfg.storeDomain}/api/2024-01/graphql.json`,
      headers: {
        'X-Shopify-Storefront-Access-Token': cfg.storefrontAccessToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  isConfigured(): boolean {
    return !!this.storeDomain;
  }

  // Fetch products using GraphQL
  async fetchProducts(first: number = 20, query?: string): Promise<ShopifyProduct[]> {
    const gqlQuery = `
      query getProducts($first: Int!, $query: String) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              description
              handle
              vendor
              productType
              tags
              availableForSale
              images(first: 3) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    availableForSale
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: gqlQuery,
        variables: { first, query },
      });

      const edges = response.data?.data?.products?.edges || [];
      return edges.map((edge: any) => this.transformProduct(edge.node));
    } catch (error) {
      console.error('Shopify fetchProducts error:', error);
      return [];
    }
  }

  // Search products
  async searchProducts(searchTerm: string, limit: number = 10): Promise<ShopifyProduct[]> {
    return this.fetchProducts(limit, searchTerm);
  }

  // Get single product by handle
  async getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
    const gqlQuery = `
      query getProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          description
          handle
          vendor
          productType
          tags
          availableForSale
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: gqlQuery,
        variables: { handle },
      });

      const product = response.data?.data?.productByHandle;
      return product ? this.transformProduct(product) : null;
    } catch (error) {
      console.error('Shopify getProductByHandle error:', error);
      return null;
    }
  }

  // Create cart and get checkout URL
  async createCart(variantId: string, quantity: number = 1): Promise<ShopifyCart | null> {
    const gqlMutation = `
      mutation createCart($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                    }
                  }
                }
              }
            }
            cost {
              totalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: gqlMutation,
        variables: {
          input: {
            lines: [{ merchandiseId: variantId, quantity }],
          },
        },
      });

      const cart = response.data?.data?.cartCreate?.cart;
      if (!cart) return null;

      return {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl,
        lines: cart.lines.edges.map((e: any) => ({
          id: e.node.id,
          quantity: e.node.quantity,
          merchandise: { id: e.node.merchandise.id },
        })),
        cost: cart.cost,
      };
    } catch (error) {
      console.error('Shopify createCart error:', error);
      return null;
    }
  }

  // Transform Shopify product to our format
  private transformProduct(node: any): ShopifyProduct {
    return {
      id: node.id,
      title: node.title,
      description: node.description || '',
      handle: node.handle,
      vendor: node.vendor,
      productType: node.productType,
      tags: node.tags || [],
      availableForSale: node.availableForSale,
      images: (node.images?.edges || []).map((e: any) => ({
        url: e.node.url,
        altText: e.node.altText,
      })),
      variants: (node.variants?.edges || []).map((e: any) => ({
        id: e.node.id,
        title: e.node.title,
        sku: e.node.sku,
        availableForSale: e.node.availableForSale,
        price: e.node.price,
      })),
    };
  }

  // Convert to unified Product format
  async getProductsAsUnified(): Promise<Product[]> {
    const products = await this.fetchProducts(20);

    return products.map(p => {
      const variant = p.variants[0];
      const price = variant?.price?.amount || '0.00';
      const currency = variant?.price?.currencyCode || 'USD';

      return {
        id: `shopify_${p.handle}`,
        name: p.title,
        description: p.description,
        price: `$${parseFloat(price).toFixed(2)}`,
        currency,
        category: p.productType || 'general',
        merchant: this.storeName,
        imageUrl: p.images[0]?.url,
        inStock: p.availableForSale,
        attributes: {
          source: 'shopify',
          shopifyProductId: p.id,
          shopifyVariantId: variant?.id || '',
          vendor: p.vendor,
          handle: p.handle,
          tags: p.tags.join(', '),
        },
      };
    });
  }

}

// Singleton
let shopifyClient: ShopifyStorefrontClient | null = null;

export function getShopifyClient(): ShopifyStorefrontClient {
  if (!shopifyClient) {
    shopifyClient = new ShopifyStorefrontClient();
  }
  return shopifyClient;
}

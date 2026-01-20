// Multi-Source Product Aggregator
// Combines products from all commerce sources for intelligent shopping

import { Product, SearchCriteria } from './types';
import { getStripeClient } from './stripe';
import { getShopifyClient } from './shopify';
import { PaymentMethod } from './coinbase';
import { getUSDCService } from './circle';

export type ProductSource = 'stripe' | 'shopify' | 'all';

export interface AggregatedProduct extends Product {
  source: ProductSource;
  sourceProductId?: string;
  checkoutUrl?: string;
  paymentMethods: PaymentMethod[];
}

export interface PriceComparison {
  product: AggregatedProduct;
  alternatives: AggregatedProduct[];
  savings?: string;
  recommendation: string;
}

export interface SmartSearchResult {
  query: string;
  products: AggregatedProduct[];
  sources: { source: ProductSource; count: number; latency: number }[];
  totalProducts: number;
  bestDeal?: AggregatedProduct;
  searchTime: number;
}

export class ProductAggregator {
  private stripe = getStripeClient();
  private shopify = getShopifyClient();

  // Search across all sources
  async searchAllSources(
    criteria: SearchCriteria,
    sources: ProductSource[] = ['all']
  ): Promise<SmartSearchResult> {
    const startTime = Date.now();
    const searchSources = sources.includes('all')
      ? ['stripe', 'shopify'] as ProductSource[]
      : sources;

    const results: AggregatedProduct[] = [];
    const sourceStats: { source: ProductSource; count: number; latency: number }[] = [];

    // Search in parallel
    const searchPromises = searchSources.map(async (source) => {
      const sourceStart = Date.now();
      let products: Product[] = [];

      try {
        switch (source) {
          case 'stripe':
            products = await this.stripe.getProductsAsUnified();
            products = this.filterProducts(products, criteria);
            break;
          case 'shopify':
            products = await this.shopify.getProductsAsUnified();
            products = this.filterProducts(products, criteria);
            break;
        }
      } catch (error) {
        console.error(`Error searching ${source}:`, error);
      }

      const latency = Date.now() - sourceStart;
      const aggregated = products.map(p => this.toAggregatedProduct(p, source));

      return { source, products: aggregated, latency };
    });

    const searchResults = await Promise.all(searchPromises);

    searchResults.forEach(({ source, products, latency }) => {
      results.push(...products);
      sourceStats.push({ source, count: products.length, latency });
    });

    // Sort by price
    results.sort((a, b) => {
      const priceA = parseFloat(a.price.replace('$', ''));
      const priceB = parseFloat(b.price.replace('$', ''));
      return priceA - priceB;
    });

    // Find best deal
    const bestDeal = results.length > 0 ? results[0] : undefined;

    return {
      query: criteria.keywords.join(' '),
      products: results,
      sources: sourceStats,
      totalProducts: results.length,
      bestDeal,
      searchTime: Date.now() - startTime,
    };
  }

  // Get all products from all sources
  async getAllProducts(): Promise<AggregatedProduct[]> {
    const [stripe, shopify] = await Promise.all([
      this.stripe.getProductsAsUnified().catch(() => []),
      this.shopify.getProductsAsUnified().catch(() => []),
    ]);

    return [
      ...stripe.map(p => this.toAggregatedProduct(p, 'stripe')),
      ...shopify.map(p => this.toAggregatedProduct(p, 'shopify')),
    ];
  }

  // Compare prices across sources
  async compareProducts(productName: string): Promise<PriceComparison | null> {
    const criteria: SearchCriteria = {
      keywords: productName.toLowerCase().split(' '),
      mustBeInStock: true,
    };

    const result = await this.searchAllSources(criteria);

    if (result.products.length === 0) return null;

    const sorted = [...result.products].sort((a, b) => {
      const priceA = parseFloat(a.price.replace('$', ''));
      const priceB = parseFloat(b.price.replace('$', ''));
      return priceA - priceB;
    });

    const cheapest = sorted[0];
    const alternatives = sorted.slice(1, 4);

    let savings: string | undefined;
    let recommendation: string;

    if (alternatives.length > 0) {
      const cheapestPrice = parseFloat(cheapest.price.replace('$', ''));
      const avgAltPrice = alternatives.reduce((sum, p) =>
        sum + parseFloat(p.price.replace('$', '')), 0) / alternatives.length;

      if (avgAltPrice > cheapestPrice) {
        savings = `$${(avgAltPrice - cheapestPrice).toFixed(2)}`;
        recommendation = `Best deal found on ${cheapest.source}: ${cheapest.name} at ${cheapest.price}. Save ${savings} compared to alternatives.`;
      } else {
        recommendation = `${cheapest.name} from ${cheapest.source} at ${cheapest.price} is competitively priced.`;
      }
    } else {
      recommendation = `Only one option found: ${cheapest.name} at ${cheapest.price} from ${cheapest.source}.`;
    }

    return {
      product: cheapest,
      alternatives,
      savings,
      recommendation,
    };
  }

  // Smart purchase - finds best option and executes
  async smartPurchase(
    query: string,
    maxPrice?: string,
    preferredSource?: ProductSource
  ): Promise<{
    success: boolean;
    product?: AggregatedProduct;
    orderId?: string;
    txHash?: string;
    paymentMethod?: PaymentMethod;
    message: string;
  }> {
    // Search for products
    const criteria: SearchCriteria = {
      keywords: query.toLowerCase().split(' ').filter(w => w.length > 2),
      maxPrice,
      mustBeInStock: true,
    };

    const sources = preferredSource && preferredSource !== 'all'
      ? [preferredSource]
      : ['all'] as ProductSource[];

    const searchResult = await this.searchAllSources(criteria, sources);

    if (searchResult.products.length === 0) {
      return {
        success: false,
        message: `No products found matching "${query}"`,
      };
    }

    // Select best product (cheapest in stock)
    const product = searchResult.bestDeal!;

    // Determine payment method based on source
    const paymentMethod = this.selectPaymentMethod(product);

    // Execute purchase via Circle USDC
    try {
      const usdcService = getUSDCService();
      const result = await usdcService.payMerchant(
        product.price,
        product.attributes?.sourceProductId || '0x0',
        'smart_' + Date.now().toString(36),
        product.name
      );

      if (!result.success) {
        return {
          success: false,
          product,
          message: result.error || 'Payment failed - ensure Circle API is configured',
        };
      }

      return {
        success: true,
        product,
        orderId: result.transferId,
        txHash: result.txHash,
        paymentMethod: 'circle',
        message: `Purchased ${product.name} from ${product.source} for ${product.price}`,
      };
    } catch (error) {
      return {
        success: false,
        product,
        message: `Purchase failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Filter products by criteria
  private filterProducts(products: Product[], criteria: SearchCriteria): Product[] {
    return products.filter(p => {
      // Check keywords
      if (criteria.keywords.length > 0) {
        const searchText = `${p.name} ${p.description} ${p.category}`.toLowerCase();
        const matches = criteria.keywords.some(k => searchText.includes(k.toLowerCase()));
        if (!matches) return false;
      }

      // Check max price
      if (criteria.maxPrice) {
        const price = parseFloat(p.price.replace('$', ''));
        const maxPrice = parseFloat(criteria.maxPrice.replace('$', ''));
        if (price > maxPrice) return false;
      }

      // Check min price
      if (criteria.minPrice) {
        const price = parseFloat(p.price.replace('$', ''));
        const minPrice = parseFloat(criteria.minPrice.replace('$', ''));
        if (price < minPrice) return false;
      }

      // Check category
      if (criteria.category && p.category !== criteria.category) return false;

      // Check stock
      if (criteria.mustBeInStock && !p.inStock) return false;

      return true;
    });
  }

  // Convert to aggregated product
  private toAggregatedProduct(product: Product, source: ProductSource): AggregatedProduct {
    const paymentMethods: PaymentMethod[] = ['circle', 'x402'];
    if (source === 'stripe') paymentMethods.push('coinbase_commerce');

    return {
      ...product,
      id: product.id.startsWith(`${source}_`) ? product.id : `${source}_${product.id}`,
      source,
      sourceProductId: product.attributes?.stripeProductId || product.attributes?.shopifyProductId,
      paymentMethods,
    };
  }

  // Select best payment method for product
  private selectPaymentMethod(product: AggregatedProduct): PaymentMethod {
    // Prefer Circle for USDC payments
    if (product.paymentMethods.includes('circle')) return 'circle';
    if (product.paymentMethods.includes('x402')) return 'x402';
    return 'coinbase_commerce';
  }
}

// Singleton
let aggregator: ProductAggregator | null = null;

export function getProductAggregator(): ProductAggregator {
  if (!aggregator) {
    aggregator = new ProductAggregator();
  }
  return aggregator;
}

// Local Marketplace - Digital products for hackathon demonstration
// These products deliver real content via x402 gated endpoints

import { Product, Merchant, SearchCriteria } from './types';

// Demo merchants
export const DEMO_MERCHANTS: Merchant[] = [
  { id: 'arc-digital', name: 'Arc Digital', description: 'Digital content and APIs', acceptsUsdc: true, x402Enabled: true, categories: ['api', 'content', 'courses'], rating: 5.0, verified: true },
];

// Digital products - x402 gated content delivered after payment
export const DEMO_PRODUCTS: Product[] = [
  // 1. Crypto API Access - Gated endpoint
  {
    id: 'api-crypto',
    name: 'CoinGecko API Access',
    description: 'Real-time crypto prices via x402-gated endpoint',
    price: '$0.99',
    currency: 'USD',
    category: 'api',
    merchant: 'Arc Digital',
    inStock: true,
    attributes: {
      source: 'x402-gated',
      type: 'api',
      endpoint: '/api/gated/crypto-prices',
      deliveryType: 'api-key',
    },
  },

  // 2. Premium Stock Image
  {
    id: 'img-premium',
    name: 'Premium Stock Image',
    description: 'High-resolution blockchain-themed image',
    price: '$0.50',
    currency: 'USD',
    category: 'content',
    merchant: 'Arc Digital',
    inStock: true,
    attributes: {
      source: 'x402-gated',
      type: 'image',
      endpoint: '/api/gated/premium-image',
      deliveryType: 'download',
    },
  },

  // 3. Crypto Trend Report - LLM Generated
  {
    id: 'report-trend',
    name: 'Crypto Trend Report',
    description: 'AI-generated analysis of current crypto market trends',
    price: '$1.99',
    currency: 'USD',
    category: 'content',
    merchant: 'Arc Digital',
    inStock: true,
    attributes: {
      source: 'x402-gated',
      type: 'report',
      endpoint: '/api/gated/trend-report',
      deliveryType: 'content',
    },
  },

  // 4. Arc Blockchain Crash Course
  {
    id: 'course-arc',
    name: 'Arc Blockchain Course',
    description: 'Complete crash course syllabus for Arc blockchain',
    price: '$2.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Arc Digital',
    inStock: true,
    attributes: {
      source: 'x402-gated',
      type: 'course',
      endpoint: '/api/gated/arc-course',
      deliveryType: 'content',
    },
  },
];

// Search products
export function searchProducts(criteria: SearchCriteria): Product[] {
  let results = [...DEMO_PRODUCTS];

  // Filter by keywords
  if (criteria.keywords.length > 0) {
    const keywords = criteria.keywords.map(k => k.toLowerCase());
    results = results.filter(p => {
      const searchText = (p.name + ' ' + p.description + ' ' + p.category).toLowerCase();
      return keywords.some(kw => searchText.includes(kw));
    });
  }

  // Filter by max price
  if (criteria.maxPrice) {
    const maxNum = parseFloat(criteria.maxPrice.replace('$', ''));
    results = results.filter(p => parseFloat(p.price.replace('$', '')) <= maxNum);
  }

  // Filter by min price
  if (criteria.minPrice) {
    const minNum = parseFloat(criteria.minPrice.replace('$', ''));
    results = results.filter(p => parseFloat(p.price.replace('$', '')) >= minNum);
  }

  // Filter by category
  if (criteria.category) {
    results = results.filter(p => p.category === criteria.category);
  }

  // Filter by merchant
  if (criteria.merchant) {
    results = results.filter(p => p.merchant === criteria.merchant);
  }

  // Filter by stock
  if (criteria.mustBeInStock) {
    results = results.filter(p => p.inStock);
  }

  return results;
}

// Get product by ID
export function getProduct(id: string): Product | undefined {
  return DEMO_PRODUCTS.find(p => p.id === id);
}

// Get merchant by ID
export function getMerchant(id: string): Merchant | undefined {
  return DEMO_MERCHANTS.find(m => m.id === id);
}

// Get all categories
export function getCategories(): string[] {
  return [...new Set(DEMO_PRODUCTS.map(p => p.category))];
}

// Get products by category
export function getProductsByCategory(category: string): Product[] {
  return DEMO_PRODUCTS.filter(p => p.category === category);
}

// Get cheapest product matching criteria
export function findCheapestProduct(criteria: SearchCriteria): Product | undefined {
  const products = searchProducts(criteria);
  if (products.length === 0) return undefined;

  return products.reduce((cheapest, current) => {
    const cheapestPrice = parseFloat(cheapest.price.replace('$', ''));
    const currentPrice = parseFloat(current.price.replace('$', ''));
    return currentPrice < cheapestPrice ? current : cheapest;
  });
}

// Get best value product (price weighted)
export function findBestValueProduct(criteria: SearchCriteria): Product | undefined {
  const products = searchProducts(criteria);
  if (products.length === 0) return undefined;

  const inStock = products.filter(p => p.inStock);
  if (inStock.length === 0) return products[0];

  return inStock.reduce((best, current) => {
    const bestPrice = parseFloat(best.price.replace('$', ''));
    const currentPrice = parseFloat(current.price.replace('$', ''));
    return currentPrice < bestPrice ? current : best;
  });
}

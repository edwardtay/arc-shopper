// Local Marketplace - Demo products for hackathon demonstration
// These products work with the quick action templates

import { Product, Merchant, SearchCriteria } from './types';

// Demo merchants
export const DEMO_MERCHANTS: Merchant[] = [
  { id: 'arc-store', name: 'Arc Store', description: 'Official Arc Store', acceptsUsdc: true, x402Enabled: true, categories: ['hardware', 'nft'], rating: 5.0, verified: true },
  { id: 'crypto-gear', name: 'Crypto Gear', description: 'Crypto hardware and accessories', acceptsUsdc: true, x402Enabled: true, categories: ['hardware'], rating: 4.8, verified: true },
  { id: 'dev-tools', name: 'Dev Tools', description: 'Developer tools and courses', acceptsUsdc: true, x402Enabled: true, categories: ['api-credits', 'courses', 'books'], rating: 4.9, verified: true },
];

// Demo products catalog - priced under $10 to work with policy limits
export const DEMO_PRODUCTS: Product[] = [
  // Hardware Wallets
  {
    id: 'hw-1',
    name: 'Ledger Nano S Plus Wallet',
    description: 'Secure crypto hardware wallet for cryptocurrency storage',
    price: '$7.99',
    currency: 'USD',
    category: 'hardware',
    merchant: 'Crypto Gear',
    inStock: true,
    attributes: { source: 'demo', type: 'wallet' },
  },
  {
    id: 'hw-2',
    name: 'Trezor One Starter Wallet',
    description: 'Entry-level crypto hardware wallet with PIN protection',
    price: '$5.99',
    currency: 'USD',
    category: 'hardware',
    merchant: 'Crypto Gear',
    inStock: true,
    attributes: { source: 'demo', type: 'wallet' },
  },
  {
    id: 'hw-3',
    name: 'KeyStone Mini Wallet',
    description: 'Air-gapped crypto hardware wallet for maximum security',
    price: '$9.99',
    currency: 'USD',
    category: 'hardware',
    merchant: 'Crypto Gear',
    inStock: true,
    attributes: { source: 'demo', type: 'wallet' },
  },

  // API Credits
  {
    id: 'api-1',
    name: 'OpenAI API Credits',
    description: '1000 tokens for GPT-4 API access',
    price: '$2.00',
    currency: 'USD',
    category: 'api-credits',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'api-2',
    name: 'Anthropic API Credits',
    description: '500 tokens for Claude API access',
    price: '$3.00',
    currency: 'USD',
    category: 'api-credits',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'api-3',
    name: 'Coingecko Pro API',
    description: '1 month of premium crypto data access',
    price: '$4.99',
    currency: 'USD',
    category: 'api-credits',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },

  // Developer Courses
  {
    id: 'course-1',
    name: 'Solidity Fundamentals',
    description: 'Learn smart contract development basics',
    price: '$4.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'course-2',
    name: 'Web3 Intro Course',
    description: 'Introduction to blockchain development',
    price: '$6.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'course-3',
    name: 'DeFi Development 101',
    description: 'Build your first decentralized finance app',
    price: '$8.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },

  // USB-C Cables
  {
    id: 'cable-1',
    name: 'USB-C Fast Charge Cable',
    description: '6ft braided USB-C to USB-C cable',
    price: '$1.99',
    currency: 'USD',
    category: 'cables',
    merchant: 'Arc Store',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'cable-2',
    name: 'USB-C to USB-A Cable',
    description: '3ft USB-C adapter cable',
    price: '$0.99',
    currency: 'USD',
    category: 'cables',
    merchant: 'Arc Store',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'cable-3',
    name: 'USB-C Hub Multi-Port',
    description: '4-in-1 USB-C hub with HDMI',
    price: '$9.99',
    currency: 'USD',
    category: 'accessories',
    merchant: 'Arc Store',
    inStock: true,
    attributes: { source: 'demo' },
  },

  // Additional items
  {
    id: 'book-1',
    name: 'Mastering Ethereum',
    description: 'Digital edition - comprehensive guide',
    price: '$3.99',
    currency: 'USD',
    category: 'books',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'nft-1',
    name: 'Arc Genesis NFT',
    description: 'Limited edition collectible on Arc',
    price: '$1.00',
    currency: 'USD',
    category: 'nft',
    merchant: 'Arc Store',
    inStock: true,
    attributes: { source: 'demo' },
  },
  // More API Credits
  {
    id: 'api-4',
    name: 'Alchemy API Credits',
    description: 'RPC endpoints for 10 million requests',
    price: '$5.00',
    currency: 'USD',
    category: 'api-credits',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'api-5',
    name: 'The Graph Credits',
    description: 'Query 50k subgraph requests',
    price: '$3.50',
    currency: 'USD',
    category: 'api-credits',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  // More Courses
  {
    id: 'course-4',
    name: 'Smart Contract Security',
    description: 'Learn to audit and secure smart contracts',
    price: '$7.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'course-5',
    name: 'Zero Knowledge Proofs 101',
    description: 'Introduction to ZK cryptography',
    price: '$9.99',
    currency: 'USD',
    category: 'courses',
    merchant: 'Dev Tools',
    inStock: true,
    attributes: { source: 'demo' },
  },
  // More Hardware
  {
    id: 'hw-4',
    name: 'YubiKey 5 NFC',
    description: 'Hardware security key for 2FA',
    price: '$8.99',
    currency: 'USD',
    category: 'hardware',
    merchant: 'Crypto Gear',
    inStock: true,
    attributes: { source: 'demo' },
  },
  // Accessories
  {
    id: 'acc-1',
    name: 'Crypto Hardware Case',
    description: 'Protective case for hardware wallets',
    price: '$2.99',
    currency: 'USD',
    category: 'accessories',
    merchant: 'Arc Store',
    inStock: true,
    attributes: { source: 'demo' },
  },
  {
    id: 'acc-2',
    name: 'Steel Seed Phrase Backup',
    description: 'Fireproof metal backup for seed phrases',
    price: '$6.99',
    currency: 'USD',
    category: 'accessories',
    merchant: 'Crypto Gear',
    inStock: true,
    attributes: { source: 'demo' },
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

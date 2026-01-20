// Commerce Types for Autonomous Shopping Agent

export interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  merchant: string;
  imageUrl?: string;
  inStock: boolean;
  attributes?: Record<string, string>;
}

export interface Merchant {
  id: string;
  name: string;
  description: string;
  acceptsUsdc: boolean;
  x402Enabled: boolean;
  apiEndpoint?: string;
  categories: string[];
  rating: number;
  verified: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  addedAt: number;
}

export interface ShoppingCart {
  items: CartItem[];
  totalAmount: string;
  currency: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseIntent {
  id: string;
  query: string;
  budget: string;
  criteria: SearchCriteria;
  status: 'searching' | 'found' | 'reviewing' | 'approved' | 'purchasing' | 'completed' | 'failed';
  products: Product[];
  selectedProduct?: Product;
  reasoning: string[];
  createdAt: number;
}

export interface SearchCriteria {
  keywords: string[];
  maxPrice?: string;
  minPrice?: string;
  category?: string;
  merchant?: string;
  mustBeInStock: boolean;
}

export type PaymentMethodType = 'x402' | 'circle' | 'coinbase_commerce';

export interface Order {
  id: string;
  product: Product;
  quantity: number;
  totalAmount: string;
  paymentMethod: PaymentMethodType;
  paymentStatus: 'pending' | 'processing' | 'confirmed' | 'failed';
  chargeId?: string;
  txHash?: string;
  transferId?: string; // Circle transfer ID
  shippingAddress?: ShippingAddress;
  createdAt: number;
  completedAt?: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CoinbaseCharge {
  id: string;
  code: string;
  name: string;
  description: string;
  hosted_url: string;
  pricing_type: 'fixed_price' | 'no_price';
  pricing: {
    local: { amount: string; currency: string };
    usdc?: { amount: string; currency: string };
  };
  addresses: Record<string, string>;
  timeline: { time: string; status: string }[];
  payments: CoinbasePayment[];
}

export interface CoinbasePayment {
  network: string;
  transaction_id: string;
  status: string;
  value: { amount: string; currency: string };
}

export interface CommerceConfig {
  coinbaseApiKey?: string;
  defaultCurrency: string;
  autoApproveUnder: string;
  requireShipping: boolean;
}

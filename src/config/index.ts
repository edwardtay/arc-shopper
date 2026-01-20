import dotenv from 'dotenv';
dotenv.config();

export const config = {
  arc: {
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: 5042002,
    caip2: 'eip155:5042002', // Arc Testnet CAIP-2 identifier
    explorerUrl: 'https://testnet.arcscan.app',
    usdcAddress: '0x3600000000000000000000000000000000000000',
  },
  x402: {
    // Local facilitator for Arc testnet (runs in same process)
    facilitatorUrl: process.env.X402_FACILITATOR_URL || 'http://localhost:3001/api/x402',
  },
  agents: {
    orchestrator: { privateKey: process.env.ORCHESTRATOR_PRIVATE_KEY || '' },
    search: { privateKey: process.env.SEARCH_AGENT_PRIVATE_KEY || '', price: '$0.01' },
    data: { privateKey: process.env.DATA_AGENT_PRIVATE_KEY || '', price: '$0.005' },
    analyzer: { privateKey: process.env.ANALYZER_AGENT_PRIVATE_KEY || '', price: '$0.008' },
  },
  apis: {
    firecrawl: process.env.FIRECRAWL_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    coinbaseCommerce: process.env.COINBASE_COMMERCE_API_KEY || '',
    coinbaseWebhookSecret: process.env.COINBASE_COMMERCE_WEBHOOK_SECRET || '',
    circleApiKey: process.env.CIRCLE_API_KEY || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    shopifyStoreDomain: process.env.SHOPIFY_STORE_DOMAIN || '',
    shopifyStorefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || '',
    // Web3 Native Commerce
    crossmintApiKey: process.env.CROSSMINT_API_KEY || '',
    crossmintProjectId: process.env.CROSSMINT_PROJECT_ID || '',
    helioApiKey: process.env.HELIO_API_KEY || '',
    helioSecretKey: process.env.HELIO_SECRET_KEY || '',
    solanaMerchantWallet: process.env.SOLANA_MERCHANT_WALLET || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
  },
};

export const isConfigured = {
  wallets: () => !!config.agents.orchestrator.privateKey,
  firecrawl: () => !!config.apis.firecrawl,
  openai: () => !!config.apis.openai,
  circle: () => !!config.apis.circleApiKey,
  coinbase: () => !!config.apis.coinbaseCommerce,
  stripe: () => !!config.apis.stripeSecretKey,
  shopify: () => !!config.apis.shopifyStoreDomain && !!config.apis.shopifyStorefrontToken,
};

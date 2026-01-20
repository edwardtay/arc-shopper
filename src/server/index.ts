import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { body, validationResult } = require('express-validator');
import { config } from '../config';
import { initAgent, getAgent } from '../agent/core';
import { getAuditLogger } from '../audit/logger';
import { AgentWallet } from '../wallet';
import { initShoppingAgent, getShoppingAgent } from '../commerce/shopping-agent';
import { searchProducts, DEMO_PRODUCTS, DEMO_MERCHANTS, getCategories } from '../commerce/marketplace';
import { getOrderManager } from '../commerce/coinbase';
import { getProductAggregator, ProductSource } from '../commerce/aggregator';
import { getSolanaPayClient } from '../commerce/solana-pay';
import { getCrossmintClient } from '../commerce/crossmint';
import { getHelioClient } from '../commerce/helio';
import { getWalletStatus, getFundingInstructions, canAffordTransaction, FAUCET_URL } from '../faucet';
import { getFacilitator, VerifyRequest, SettleRequest } from '../facilitator';
import { getOrCreateUserAgent, getAgentBalance, getAgentWallet } from '../agent/user-agents';

// Validation middleware helper
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// Rate limiters - relaxed for demo
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const queryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Query rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
};

export function createServer() {
  const app = express();
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10kb' }));
  app.use(generalLimiter);
  app.use(express.static(path.join(__dirname, '../../public')));

  // Serve store as default page
  app.get('/', (_, res) => {
    res.sendFile(path.join(__dirname, '../../public/store.html'));
  });

  // Serve dashboard at /dashboard
  app.get('/dashboard', (_, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  // Initialize the Trustless Agent
  const privateKey = config.agents.orchestrator.privateKey;
  if (!privateKey) {
    console.error('ORCHESTRATOR_PRIVATE_KEY not set');
    process.exit(1);
  }
  const agent = initAgent(privateKey, 'ArcTrustlessAgent');

  // Initialize Shopping Agent
  const shoppingAgent = initShoppingAgent(agent.getPolicy());

  // Health check with live blockchain data
  app.get('/api/health', async (_, res) => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);

      const [blockNumber, feeData] = await Promise.all([
        provider.getBlockNumber().catch(() => null),
        provider.getFeeData().catch(() => null),
      ]);

      res.json({
        status: 'ok',
        network: 'arc-testnet',
        chainId: config.arc.chainId,
        caip2: `eip155:${config.arc.chainId}`,
        agent: agent.getIdentity().name,
        blockNumber: blockNumber,
        gasPrice: feeData?.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : null,
        rpcUrl: config.arc.rpcUrl.replace(/https?:\/\//, ''),
        explorer: config.arc.explorerUrl,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.json({
        status: 'ok',
        network: 'arc-testnet',
        chainId: config.arc.chainId,
        caip2: `eip155:${config.arc.chainId}`,
        agent: agent.getIdentity().name,
        timestamp: Date.now(),
      });
    }
  });

  // Agent status - comprehensive state
  app.get('/api/status', async (_, res) => {
    try {
      const identity = agent.getIdentity();
      const state = agent.getState();
      const treasury = agent.getTreasury();
      const policy = agent.getPolicy();

      res.json({
        identity: {
          address: identity.address,
          name: identity.name,
          reputation: identity.reputation,
        },
        state: {
          isActive: state.isActive,
          totalSpent: state.totalSpent,
          successfulTasks: state.successfulTasks,
          failedTasks: state.failedTasks,
          lastAction: state.lastAction,
        },
        treasury: {
          balance: await treasury.getBalance(),
          pendingApprovals: treasury.getPendingApprovals().length,
        },
        policy: {
          spending: policy.getPolicy().spending,
          emergencyStop: policy.getPolicy().emergencyStop,
        },
        config: {
          openai: !!config.apis.openai,
          network: config.arc.caip2,
          explorer: config.arc.explorerUrl,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // Main query endpoint - Trustless Agent processing
  app.post('/api/query',
    queryLimiter,
    body('query').isString().trim().isLength({ min: 1, max: 1000 }).withMessage('Query must be 1-1000 characters'),
    validate,
    async (req: Request, res: Response) => {
      const { query, context } = req.body;

      try {
        const result = await agent.process(query, context);

        res.json({
          success: result.success,
          query: result.decision.query,
          intent: result.decision.intent,
          thinking: result.decision.thinking.map(t => ({
            step: t.step,
            thought: t.thought,
            reasoning: t.reasoning,
          })),
          actions: result.actions.map(a => ({
            action: a.action,
            success: a.success,
            data: a.data,
            duration: a.duration,
          })),
          payments: result.payments.map(p => ({
            txHash: p.txHash,
            amount: p.amount,
            service: p.service,
            status: p.status,
          })),
          totalCost: result.totalCost,
          duration: result.duration,
          policyCheck: {
            allowed: result.decision.policyCheck.allowed,
            violations: result.decision.policyCheck.violations,
            warnings: result.decision.policyCheck.warnings,
          },
        });
      } catch (error) {
        res.status(500).json({ error: 'Request failed' });
      }
    }
  );

  // Get agent's reasoning/thinking for a decision
  app.get('/api/agent/thinking', (_, res) => {
    const memory = agent.getMemory();
    res.json({
      conversationHistory: memory.conversationHistory.slice(-20),
      recentActions: memory.actionHistory.slice(-10),
      recentPayments: memory.paymentHistory.slice(-10),
    });
  });

  // ==================== PER-USER AGENT ENDPOINTS ====================

  // Register user and get their unique agent wallet
  app.post('/api/agent/register',
    body('userAddress').isString().matches(/^0x[a-fA-F0-9]{40}$/),
    validate,
    async (req: Request, res: Response) => {
      const { userAddress } = req.body;

      try {
        const userAgent = getOrCreateUserAgent(userAddress);
        const balance = await getAgentBalance(userAddress);

        res.json({
          success: true,
          userAddress: userAgent.userAddress,
          agentAddress: userAgent.agentAddress,
          balance: balance.balanceUsd,
          needsFunding: balance.needsFunding,
          createdAt: userAgent.createdAt,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to register agent' });
      }
    }
  );

  // Get user's agent status
  app.get('/api/agent/status/:userAddress', async (req: Request, res: Response) => {
    const userAddress = req.params.userAddress as string;

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    try {
      const balance = await getAgentBalance(userAddress);
      res.json(balance);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  });

  // Policy management
  app.get('/api/policy', (_, res) => {
    const policy = agent.getPolicy();
    res.json(policy.getPolicy());
  });

  app.post('/api/policy/emergency-stop',
    body('active').isBoolean(),
    validate,
    (req: Request, res: Response) => {
      const { active } = req.body;
      agent.getPolicy().setEmergencyStop(active);
      res.json({ emergencyStop: active, message: active ? 'Agent stopped' : 'Agent resumed' });
    }
  );

  // Treasury management
  app.get('/api/treasury', async (_, res) => {
    try {
      const treasury = agent.getTreasury();
      res.json({
        address: treasury.getAddress(),
        balance: await treasury.getBalance(),
        pendingApprovals: treasury.getPendingApprovals(),
        spendingHistory: treasury.getSpendingHistory(20),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get treasury' });
    }
  });

  app.post('/api/treasury/approve/:approvalId', (req: Request, res: Response) => {
    const approvalId = req.params.approvalId as string;
    const treasury = agent.getTreasury();
    const success = treasury.approveRequest(approvalId);
    res.json({ success, approvalId });
  });

  // Audit log
  app.get('/api/audit', (_, res) => {
    const auditLogger = getAuditLogger();
    res.json({
      entries: auditLogger.getAuditTrail(50),
      explorer: config.arc.explorerUrl,
    });
  });

  // Payments history
  app.get('/api/payments', (_, res) => {
    const memory = agent.getMemory();
    res.json({
      payments: memory.paymentHistory,
      explorer: config.arc.explorerUrl,
    });
  });

  // Generate new wallet (utility)
  app.get('/api/wallet/generate', (_, res) => {
    res.json(AgentWallet.generate());
  });

  // ==================== FAUCET ENDPOINTS ====================

  // Get wallet status with real balance
  app.get('/api/faucet/status', async (_, res) => {
    try {
      const status = await getWalletStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get wallet status' });
    }
  });

  // Get funding instructions
  app.get('/api/faucet/instructions', async (_, res) => {
    try {
      const status = await getWalletStatus();
      res.json({
        address: status.address,
        faucetUrl: FAUCET_URL,
        instructions: getFundingInstructions(status.address),
        currentBalance: status.balanceUsd,
        needsFunding: status.needsFunding,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get instructions' });
    }
  });

  // Check if can afford a transaction
  app.get('/api/faucet/check/:amount', async (req: Request, res: Response) => {
    try {
      const amount = req.params.amount as string;
      const result = await canAffordTransaction(amount);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to check balance' });
    }
  });

  // ==================== x402 FACILITATOR ENDPOINTS ====================

  // Facilitator info
  app.get('/api/x402/info', (_, res) => {
    const facilitator = getFacilitator();
    res.json(facilitator.getInfo());
  });

  // x402 V2 verify endpoint
  app.post('/api/x402/v2/verify', async (req: Request, res: Response) => {
    try {
      const facilitator = getFacilitator();
      const request: VerifyRequest = req.body;
      const result = await facilitator.verify(request);
      res.json(result);
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Verification failed' });
    }
  });

  // x402 V2 settle endpoint
  app.post('/api/x402/v2/settle', async (req: Request, res: Response) => {
    try {
      const facilitator = getFacilitator();
      const treasury = (await import('../treasury/manager')).getTreasury();
      const wallet = treasury.getHotWallet();

      const request: SettleRequest = { ...req.body, execute: true };
      const result = await facilitator.settle(request, wallet);

      if (result.success) {
        // Record spending
        const { ethers } = await import('ethers');
        const amount = ethers.formatUnits(request.paymentDetails.amount, 6);
        treasury.recordSpending('$' + amount, 'x402-payment');
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Settlement failed' });
    }
  });

  // Get settlement status
  app.get('/api/x402/settlement/:nonce', (req: Request, res: Response) => {
    const facilitator = getFacilitator();
    const settlement = facilitator.getSettlement(req.params.nonce as string);
    if (settlement) {
      res.json(settlement);
    } else {
      res.status(404).json({ error: 'Settlement not found' });
    }
  });

  // Agent identity
  app.get('/api/identity', (_, res) => {
    res.json(agent.getIdentity());
  });

  // Agent LLM info
  app.get('/api/agent/llm', (_, res) => {
    res.json(agent.getLLMInfo());
  });

  // ==================== COMMERCE ENDPOINTS ====================

  // List all products
  app.get('/api/shop/products', (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const products = category
      ? DEMO_PRODUCTS.filter(p => p.category === category)
      : DEMO_PRODUCTS;
    res.json({ products, total: products.length });
  });

  // Search products
  app.get('/api/shop/search', (req: Request, res: Response) => {
    const q = (req.query.q as string) || '';
    const maxPrice = req.query.maxPrice as string | undefined;
    const category = req.query.category as string | undefined;

    const keywords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const products = searchProducts({
      keywords,
      maxPrice,
      category,
      mustBeInStock: true,
    });

    res.json({ products, query: q, total: products.length });
  });

  // Get categories
  app.get('/api/shop/categories', (_, res) => {
    res.json({ categories: getCategories() });
  });

  // Get merchants
  app.get('/api/shop/merchants', (_, res) => {
    res.json({ merchants: DEMO_MERCHANTS });
  });

  // Autonomous shopping - agent finds and buys
  app.post('/api/shop/buy',
    queryLimiter,
    body('query').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Query must be 1-500 characters'),
    validate,
    async (req: Request, res: Response) => {
      const { query } = req.body;

      try {
        const result = await shoppingAgent.shop(query);

        res.json({
          success: result.success,
          message: result.message,
          thinking: result.decision.thinking.map(t => ({
            step: t.step,
            thought: t.thought,
            reasoning: t.reasoning,
          })),
          searchCriteria: result.decision.searchCriteria,
          productsFound: result.decision.productsFound.length,
          selectedProduct: result.decision.selectedProduct,
          order: result.order ? {
            id: result.order.id,
            totalAmount: result.order.totalAmount,
            paymentStatus: result.order.paymentStatus,
            paymentMethod: result.order.paymentMethod,
            txHash: result.order.txHash,
          } : null,
          estimatedCost: result.decision.estimatedCost,
          policyViolations: result.decision.policyViolations,
          approved: result.decision.approved,
          requiresApproval: result.decision.requiresApproval,
          duration: result.duration,
        });
      } catch (error) {
        res.status(500).json({ error: 'Shopping request failed' });
      }
    }
  );

  // Get order history
  app.get('/api/shop/orders', (_, res) => {
    const orderManager = getOrderManager();
    res.json({
      orders: orderManager.getOrders(),
      total: orderManager.getOrders().length,
    });
  });

  // Get specific order
  app.get('/api/shop/orders/:orderId', (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;
    const orderManager = getOrderManager();
    const order = orderManager.getOrder(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  });

  // Get available payment methods
  app.get('/api/shop/payment-methods', (_, res) => {
    const orderManager = getOrderManager();
    res.json({
      methods: orderManager.getAvailablePaymentMethods(),
      default: 'circle',
    });
  });

  // ==================== CIRCLE ENDPOINTS ====================

  // Get Circle USDC balance
  app.get('/api/circle/balance', async (_, res) => {
    try {
      const { getUSDCService } = await import('../commerce/circle');
      const usdcService = getUSDCService();
      const balance = await usdcService.getAvailableBalance();
      res.json({ balance, currency: 'USDC' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get balance' });
    }
  });

  // Create Circle payment request
  app.post('/api/circle/pay',
    queryLimiter,
    body('amount').isString().notEmpty(),
    body('recipient').isString().notEmpty(),
    body('description').optional().isString(),
    validate,
    async (req: Request, res: Response) => {
      const { amount, recipient, description } = req.body;

      try {
        const { getUSDCService } = await import('../commerce/circle');
        const usdcService = getUSDCService();
        const result = await usdcService.payMerchant(
          amount,
          recipient,
          'direct_' + Date.now().toString(36),
          description || 'Direct USDC payment'
        );

        res.json({
          success: result.success,
          method: result.method,
          transferId: result.transferId,
          txHash: result.txHash,
        });
      } catch (error) {
        res.status(500).json({ error: 'Payment failed' });
      }
    }
  );

  // ==================== MULTI-SOURCE AGGREGATOR ENDPOINTS ====================

  // Search across all commerce sources
  app.get('/api/aggregate/search', async (req: Request, res: Response) => {
    const q = (req.query.q as string) || '';
    const maxPrice = req.query.maxPrice as string | undefined;
    const sources = (req.query.sources as string)?.split(',') as ProductSource[] || ['all'];

    try {
      const aggregator = getProductAggregator();
      const result = await aggregator.searchAllSources(
        {
          keywords: q.toLowerCase().split(/\s+/).filter(w => w.length > 2),
          maxPrice,
          mustBeInStock: true,
        },
        sources
      );

      res.json({
        query: q,
        products: result.products,
        sources: result.sources,
        totalProducts: result.totalProducts,
        bestDeal: result.bestDeal,
        searchTime: result.searchTime,
      });
    } catch (error) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Get all products from all sources
  app.get('/api/aggregate/products', async (_, res) => {
    try {
      const aggregator = getProductAggregator();
      const products = await aggregator.getAllProducts();
      res.json({
        products,
        total: products.length,
        sources: ['local', 'stripe', 'shopify'],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // Compare prices across sources
  app.get('/api/aggregate/compare', async (req: Request, res: Response) => {
    const product = req.query.product as string;

    if (!product) {
      return res.status(400).json({ error: 'Product name required' });
    }

    try {
      const aggregator = getProductAggregator();
      const comparison = await aggregator.compareProducts(product);

      if (!comparison) {
        return res.status(404).json({ error: 'No products found' });
      }

      res.json(comparison);
    } catch (error) {
      res.status(500).json({ error: 'Comparison failed' });
    }
  });

  // Smart purchase - finds best option and buys
  app.post('/api/aggregate/smart-buy',
    queryLimiter,
    body('query').isString().trim().isLength({ min: 1, max: 500 }),
    body('maxPrice').optional().isString(),
    body('preferredSource').optional().isString(),
    validate,
    async (req: Request, res: Response) => {
      const { query, maxPrice, preferredSource } = req.body;

      try {
        const aggregator = getProductAggregator();
        const result = await aggregator.smartPurchase(
          query,
          maxPrice,
          preferredSource as ProductSource
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Smart purchase failed' });
      }
    }
  );

  // ==================== SOLANA PAY ENDPOINTS ====================

  // Create Solana Pay payment request
  app.post('/api/solana-pay/create',
    queryLimiter,
    body('amount').isNumeric(),
    body('token').optional().isIn(['SOL', 'USDC']),
    body('label').optional().isString(),
    body('message').optional().isString(),
    validate,
    async (req: Request, res: Response) => {
      const { amount, token, label, message } = req.body;
      try {
        const solanaPay = getSolanaPayClient();
        const payment = await solanaPay.createPaymentRequest(
          parseFloat(amount),
          token || 'USDC',
          { label, message }
        );
        res.json({
          success: true,
          payment: {
            id: payment.id,
            url: payment.url,
            amount: payment.amount.toString(),
            token: payment.token,
            expiresAt: payment.expiresAt,
          },
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create payment' });
      }
    }
  );

  // Check Solana Pay payment status
  app.get('/api/solana-pay/status/:paymentId', async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    try {
      const solanaPay = getSolanaPayClient();
      const payment = await solanaPay.checkPaymentStatus(paymentId);
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      res.json({ payment });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check payment' });
    }
  });

  // Get Solana Pay network info
  app.get('/api/solana-pay/info', (_, res) => {
    const solanaPay = getSolanaPayClient();
    res.json(solanaPay.getNetworkInfo());
  });

  // ==================== CROSSMINT NFT ENDPOINTS ====================

  // List NFT collections
  app.get('/api/crossmint/collections', async (_, res) => {
    try {
      const crossmint = getCrossmintClient();
      const collections = await crossmint.listCollections();
      res.json({ collections, configured: crossmint.isConfigured() });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list collections' });
    }
  });

  // Mint NFT
  app.post('/api/crossmint/mint',
    queryLimiter,
    body('collectionId').isString(),
    body('recipient').isString(),
    body('name').isString(),
    body('description').optional().isString(),
    body('image').isString(),
    validate,
    async (req: Request, res: Response) => {
      const { collectionId, recipient, name, description, image } = req.body;
      try {
        const crossmint = getCrossmintClient();
        const result = await crossmint.mintNFT({
          collectionId,
          recipient,
          metadata: { name, description, image },
        });
        if (!result) {
          return res.status(400).json({ error: 'Minting failed' });
        }
        res.json({ success: true, nft: result });
      } catch (error) {
        res.status(500).json({ error: 'Failed to mint NFT' });
      }
    }
  );

  // Create NFT checkout
  app.post('/api/crossmint/checkout',
    queryLimiter,
    body('collectionId').isString(),
    body('quantity').optional().isInt({ min: 1 }),
    validate,
    async (req: Request, res: Response) => {
      const { collectionId, quantity, title, description } = req.body;
      try {
        const crossmint = getCrossmintClient();
        const checkout = await crossmint.createCheckout(collectionId, quantity || 1, {
          title,
          description,
        });
        if (!checkout) {
          return res.status(400).json({ error: 'Checkout creation failed' });
        }
        res.json({ success: true, checkout });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create checkout' });
      }
    }
  );

  // ==================== HELIO ENDPOINTS ====================

  // Create Helio payment link
  app.post('/api/helio/paylink',
    queryLimiter,
    body('name').isString(),
    body('price').isNumeric(),
    body('currency').optional().isIn(['USDC', 'SOL', 'USDT']),
    validate,
    async (req: Request, res: Response) => {
      const { name, price, currency, description } = req.body;
      try {
        const helio = getHelioClient();
        const payLink = await helio.createPayLink(name, parseFloat(price), currency || 'USDC', {
          description,
        });
        if (!payLink) {
          return res.status(400).json({ error: 'Failed to create pay link' });
        }
        res.json({ success: true, payLink });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create pay link' });
      }
    }
  );

  // Quick pay with Helio
  app.post('/api/helio/quick-pay',
    queryLimiter,
    body('amount').isNumeric(),
    body('productName').isString(),
    body('currency').optional().isIn(['USDC', 'SOL']),
    validate,
    async (req: Request, res: Response) => {
      const { amount, productName, currency } = req.body;
      try {
        const helio = getHelioClient();
        const result = await helio.quickPay(parseFloat(amount), productName, currency || 'USDC');
        if (!result) {
          return res.status(400).json({ error: 'Failed to create quick pay' });
        }
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create payment' });
      }
    }
  );

  // List Helio pay links
  app.get('/api/helio/paylinks', async (_, res) => {
    try {
      const helio = getHelioClient();
      const payLinks = await helio.listPayLinks();
      res.json({ payLinks, configured: helio.isConfigured() });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list pay links' });
    }
  });

  // Create Helio subscription
  app.post('/api/helio/subscription',
    queryLimiter,
    body('name').isString(),
    body('price').isNumeric(),
    body('interval').isIn(['daily', 'weekly', 'monthly', 'yearly']),
    body('currency').optional().isIn(['USDC', 'SOL']),
    validate,
    async (req: Request, res: Response) => {
      const { name, price, interval, currency, description } = req.body;
      try {
        const helio = getHelioClient();
        const subscription = await helio.createSubscription(
          name,
          parseFloat(price),
          interval,
          currency || 'USDC',
          { description }
        );
        if (!subscription) {
          return res.status(400).json({ error: 'Failed to create subscription' });
        }
        res.json({ success: true, subscription });
      } catch (error) {
        res.status(500).json({ error: 'Failed to create subscription' });
      }
    }
  );

  // Get available commerce sources with real status
  app.get('/api/aggregate/sources', async (_, res) => {
    const stripeClient = (await import('../commerce/stripe')).getStripeClient();
    const shopifyClient = (await import('../commerce/shopify')).getShopifyClient();
    const crossmintClient = getCrossmintClient();
    const helioClient = getHelioClient();
    const solanaPayClient = getSolanaPayClient();
    const circleConfigured = !!config.apis.circleApiKey;

    res.json({
      sources: [
        {
          id: 'stripe',
          name: 'Stripe',
          status: stripeClient.isConfigured() ? 'connected' : 'not_configured',
          configured: stripeClient.isConfigured(),
        },
        {
          id: 'shopify',
          name: 'Shopify Storefront',
          status: shopifyClient.isConfigured() ? 'connected' : 'not_configured',
          configured: shopifyClient.isConfigured(),
        },
        {
          id: 'crossmint',
          name: 'Crossmint NFT',
          status: crossmintClient.isConfigured() ? 'connected' : 'not_configured',
          configured: crossmintClient.isConfigured(),
        },
      ],
      paymentMethods: [
        {
          id: 'circle',
          name: 'Circle USDC',
          status: circleConfigured ? 'connected' : 'not_configured',
          configured: circleConfigured,
        },
        {
          id: 'x402',
          name: 'x402 Protocol',
          status: 'connected',
          configured: true,
        },
        {
          id: 'coinbase_commerce',
          name: 'Coinbase Commerce',
          status: config.apis.coinbaseCommerce ? 'connected' : 'not_configured',
          configured: !!config.apis.coinbaseCommerce,
        },
        {
          id: 'solana_pay',
          name: 'Solana Pay',
          status: solanaPayClient.isConfigured() ? 'connected' : 'not_configured',
          configured: solanaPayClient.isConfigured(),
        },
        {
          id: 'helio',
          name: 'Helio',
          status: helioClient.isConfigured() ? 'connected' : 'not_configured',
          configured: helioClient.isConfigured(),
        },
      ],
    });
  });

  return app;
}

// Start the server if this file is run directly
if (require.main === module) {
  const app = createServer();
  const port = config.server.port;
  const host = config.server.host;

  app.listen(port, host, () => {
    console.log(`\n🤖 Arc Trustless Agent Server`);
    console.log(`   Network: Arc Testnet (${config.arc.chainId})`);
    console.log(`   Server:  http://${host}:${port}`);
    console.log(`   Explorer: ${config.arc.explorerUrl}`);
    console.log(`\n✅ Ready for autonomous commerce!\n`);
  });
}

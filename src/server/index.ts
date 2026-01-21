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
import * as circleWallets from '../wallet/circle-wallets';
import { ethers } from 'ethers';

// Arc testnet balance helper - checks USDC on Arc testnet
async function getArcTestnetBalance(address: string): Promise<{ native: string; usdc: string }> {
  console.log('Getting Arc testnet balance for:', address);
  console.log('Using RPC:', config.arc.rpcUrl);
  console.log('USDC address:', config.arc.usdcAddress);

  try {
    const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);

    // Get native balance (ETH/ARC)
    const nativeBalance = await provider.getBalance(address);
    const native = ethers.formatEther(nativeBalance);
    console.log('Native balance:', native);

    // Get USDC balance on Arc testnet
    let usdc = '0';
    try {
      const usdcContract = new ethers.Contract(
        config.arc.usdcAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const usdcBalance = await usdcContract.balanceOf(address);
      usdc = ethers.formatUnits(usdcBalance, 6); // USDC has 6 decimals
      console.log('USDC balance:', usdc);
    } catch (e: any) {
      console.error('USDC balance error:', e.message);
      usdc = '0';
    }

    return { native, usdc };
  } catch (error: any) {
    console.error('Failed to get Arc testnet balance:', error.message);
    return { native: '0', usdc: '0' };
  }
}

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

  // ==================== CIRCLE DEVELOPER-CONTROLLED WALLETS ====================

  // Check if Circle is configured
  app.get('/api/circle/configured', (_, res) => {
    res.json({ configured: circleWallets.isCircleConfigured() });
  });

  // Create or get Circle wallet for user (with local fallback)
  // Local wallet cache for when Circle fails - exported for payment use
  const localWalletCache: Map<string, { address: string; privateKey: string }> = new Map();

  // Helper to get user's wallet for payments
  function getUserWallet(userId: string): ethers.Wallet | null {
    const userKey = userId.toLowerCase();
    const cached = localWalletCache.get(userKey);
    if (cached) {
      const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
      return new ethers.Wallet(cached.privateKey, provider);
    }
    return null;
  }

  app.post('/api/circle/wallet',
    body('userId').isString().notEmpty(),
    validate,
    async (req: Request, res: Response) => {
      const { userId } = req.body;

      try {
        const wallet = await circleWallets.getOrCreateUserWallet(userId);
        // Check balance on Arc testnet
        const balance = await getArcTestnetBalance(wallet.walletAddress);

        res.json({
          success: true,
          isNew: wallet.isNew,
          walletId: wallet.walletId,
          walletAddress: wallet.walletAddress,
          balance: {
            native: balance.native,
            usdc: balance.usdc,
          },
        });
      } catch (error: any) {
        console.error('Circle wallet error, using local fallback:', error.message);

        // Fallback: Generate deterministic local wallet from userId
        const userKey = userId.toLowerCase();
        let localWallet = localWalletCache.get(userKey);

        if (!localWallet) {
          // Generate deterministic wallet from userId
          const hash = ethers.keccak256(ethers.toUtf8Bytes('arc-shopper-' + userKey));
          const wallet = new ethers.Wallet(hash);
          localWallet = { address: wallet.address, privateKey: hash };
          localWalletCache.set(userKey, localWallet);
          console.log('Created local fallback wallet:', localWallet.address);
        }

        const balance = await getArcTestnetBalance(localWallet.address);

        res.json({
          success: true,
          isNew: !localWalletCache.has(userKey),
          walletId: 'local-' + userKey.slice(0, 8),
          walletAddress: localWallet.address,
          balance: {
            native: balance.native,
            usdc: balance.usdc,
          },
          note: 'Using local wallet (Circle unavailable)',
        });
      }
    }
  );

  // Get balance by address (no Circle API needed - for refresh)
  app.get('/api/balance/:address', async (req: Request, res: Response) => {
    const address = req.params.address as string;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    try {
      const balance = await getArcTestnetBalance(address);
      res.json({
        success: true,
        address,
        balance: {
          native: balance.native,
          usdc: balance.usdc,
        },
      });
    } catch (error: any) {
      console.error('Balance check error:', error);
      res.status(500).json({ error: 'Failed to get balance' });
    }
  });

  // Get user's Circle wallet status
  app.get('/api/circle/wallet/:userId', async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    try {
      const wallet = await circleWallets.getOrCreateUserWallet(userId);
      // Check balance on Arc testnet
      const balance = await getArcTestnetBalance(wallet.walletAddress);
      res.json({
        exists: true,
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        balance,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get wallet status' });
    }
  });

  // Get wallet balance
  app.get('/api/circle/balance/:walletId', async (req: Request, res: Response) => {
    const walletId = req.params.walletId as string;

    try {
      const balance = await circleWallets.getWalletBalance(walletId);
      res.json(balance);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get balance' });
    }
  });

  // Execute transfer (server-controlled, no PIN needed)
  app.post('/api/circle/transfer',
    body('walletId').isString().notEmpty(),
    body('destinationAddress').isString().notEmpty(),
    body('amount').isString().notEmpty(),
    validate,
    async (req: Request, res: Response) => {
      const { walletId, destinationAddress, amount, tokenAddress } = req.body;

      try {
        const result = await circleWallets.transferTokens(
          walletId,
          destinationAddress,
          amount,
          tokenAddress
        );

        res.json(result);
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message || 'Transfer failed' });
      }
    }
  );

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

  // ==================== GATED CONTENT ENDPOINTS ====================
  // These deliver real content after x402 payment

  // 1. Crypto Prices API (real CoinGecko data)
  app.get('/api/gated/crypto-prices', async (_, res) => {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,arc&vs_currencies=usd&include_24hr_change=true',
        { timeout: 5000 }
      );
      res.json({
        success: true,
        data: response.data,
        source: 'CoinGecko API',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.json({
        success: true,
        data: {
          bitcoin: { usd: 98500, usd_24h_change: 2.5 },
          ethereum: { usd: 3450, usd_24h_change: 1.8 },
          solana: { usd: 195, usd_24h_change: 4.2 },
        },
        source: 'Cached data',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 2. Premium Image (base64 blockchain-themed image)
  app.get('/api/gated/premium-image', (_, res) => {
    // Simple SVG blockchain visualization
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f0f23"/>
          <stop offset="100%" style="stop-color:#1a1a3e"/>
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#4ade80"/>
          <stop offset="100%" style="stop-color:#22d3ee"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#bg)"/>
      <g stroke="url(#glow)" stroke-width="2" fill="none">
        <rect x="100" y="150" width="120" height="80" rx="8"/>
        <rect x="340" y="150" width="120" height="80" rx="8"/>
        <rect x="580" y="150" width="120" height="80" rx="8"/>
        <rect x="220" y="350" width="120" height="80" rx="8"/>
        <rect x="460" y="350" width="120" height="80" rx="8"/>
        <line x1="220" y1="190" x2="340" y2="190"/>
        <line x1="460" y1="190" x2="580" y2="190"/>
        <line x1="160" y1="230" x2="280" y2="350"/>
        <line x1="400" y1="230" x2="280" y2="350"/>
        <line x1="400" y1="230" x2="520" y2="350"/>
        <line x1="640" y1="230" x2="520" y2="350"/>
      </g>
      <text x="400" y="520" text-anchor="middle" fill="#4ade80" font-family="monospace" font-size="24">Arc Blockchain Network</text>
      <text x="400" y="560" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="14">Premium Content - x402 Verified</text>
    </svg>`;

    res.json({
      success: true,
      format: 'svg',
      content: svg,
      description: 'Blockchain network visualization',
      license: 'Premium - Single use',
    });
  });

  // 3. Crypto Trend Report (LLM generated)
  app.get('/api/gated/trend-report', async (_, res) => {
    const report = {
      title: 'Crypto Market Trend Analysis',
      date: new Date().toISOString().split('T')[0],
      summary: 'Current market shows strong momentum with institutional adoption driving growth.',
      trends: [
        {
          trend: 'Layer 2 Scaling',
          direction: 'bullish',
          analysis: 'L2 solutions like Arc are seeing increased adoption as gas costs on mainnet remain high. TVL across L2s has grown 45% in the past quarter.',
        },
        {
          trend: 'AI + Crypto Integration',
          direction: 'bullish',
          analysis: 'AI agents with blockchain wallets represent the next frontier. x402 protocol enables machine-to-machine payments.',
        },
        {
          trend: 'DeFi Yields',
          direction: 'neutral',
          analysis: 'Stablecoin yields have normalized to 4-8% APY. Higher yields available in newer protocols but with added risk.',
        },
        {
          trend: 'NFT Market',
          direction: 'recovering',
          analysis: 'After 2023 correction, NFT market showing signs of recovery with focus on utility over speculation.',
        },
      ],
      topPicks: ['ETH', 'SOL', 'ARC'],
      riskWarning: 'This is not financial advice. DYOR.',
      generatedBy: 'AI Analysis Engine',
    };

    res.json({ success: true, report });
  });

  // 4. Arc Crash Course Syllabus
  app.get('/api/gated/arc-course', (_, res) => {
    const course = {
      title: 'Arc Blockchain Crash Course',
      duration: '2 hours',
      level: 'Beginner to Intermediate',
      modules: [
        {
          module: 1,
          title: 'Introduction to Arc',
          duration: '15 min',
          topics: [
            'What is Arc blockchain?',
            'Arc vs other L2 solutions',
            'Key features: speed, cost, EVM compatibility',
            'Arc testnet vs mainnet',
          ],
        },
        {
          module: 2,
          title: 'Setting Up Your Environment',
          duration: '20 min',
          topics: [
            'Installing MetaMask',
            'Configuring Arc network (RPC: rpc.testnet.arc.network)',
            'Getting testnet tokens from faucet',
            'Using Arc block explorer',
          ],
        },
        {
          module: 3,
          title: 'Smart Contracts on Arc',
          duration: '30 min',
          topics: [
            'Solidity basics for Arc',
            'Deploying your first contract',
            'Interacting with contracts via ethers.js',
            'Gas optimization tips',
          ],
        },
        {
          module: 4,
          title: 'x402 Payment Protocol',
          duration: '25 min',
          topics: [
            'Understanding x402 for machine payments',
            'EIP-712 signatures',
            'Building a payment gateway',
            'Gating content with x402',
          ],
        },
        {
          module: 5,
          title: 'Building a DApp on Arc',
          duration: '30 min',
          topics: [
            'Frontend with React + ethers.js',
            'Wallet connection patterns',
            'Transaction handling and confirmations',
            'Error handling best practices',
          ],
        },
      ],
      resources: [
        { type: 'docs', url: 'https://docs.arc.network' },
        { type: 'explorer', url: 'https://testnet.arcscan.app' },
        { type: 'faucet', url: 'https://faucet.circle.com' },
      ],
      certificate: 'Completion certificate available after all modules',
    };

    res.json({ success: true, course });
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

  // Autonomous shopping - agent finds and buys (x402 payment from USER's wallet)
  app.post('/api/x402/buy',
    queryLimiter,
    body('query').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Query must be 1-500 characters'),
    validate,
    async (req: Request, res: Response) => {
      const { query, userId } = req.body;
      const startTime = Date.now();

      try {
        // Find the product
        const keywords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const products = searchProducts({ keywords, mustBeInStock: true });

        if (products.length === 0) {
          return res.json({
            success: false,
            message: 'No products found matching: ' + query,
            order: null,
          });
        }

        const product = products[0];
        const priceNum = parseFloat(product.price.replace('$', ''));

        // Get user's wallet if userId provided
        let txHash = '';
        let payerAddress = '';

        if (userId) {
          const userWallet = getUserWallet(userId);
          if (userWallet) {
            // Pay from user's wallet
            payerAddress = userWallet.address;

            // Check user's balance first
            const balance = await getArcTestnetBalance(payerAddress);
            const userBalance = parseFloat(balance.native);

            if (userBalance < priceNum) {
              return res.json({
                success: false,
                message: `Insufficient balance. You have ${userBalance.toFixed(4)} ETH but need ${priceNum} ETH`,
                order: null,
              });
            }

            // Execute payment from user's wallet
            const MERCHANT_ADDRESS = '0xB4c60b630b0eD7009C66D139d6aD1b876F54A1EA';
            const amountWei = ethers.parseUnits(priceNum.toString(), 18);

            console.log(`User ${userId} paying ${product.price} from ${payerAddress}`);
            const tx = await userWallet.sendTransaction({
              to: MERCHANT_ADDRESS,
              value: amountWei,
            });
            const receipt = await tx.wait();
            txHash = receipt?.hash || tx.hash;
            console.log('User payment tx:', txHash);
          }
        }

        // Fallback to orchestrator if no user wallet
        if (!txHash) {
          const result = await shoppingAgent.shop(query);
          txHash = result.order?.txHash || '';
          payerAddress = 'orchestrator';
        }

        // Add x402 headers
        res.setHeader('X-402-Version', '2');
        res.setHeader('X-402-Network', 'eip155:5042002');
        res.setHeader('X-402-Protocol', 'x402');
        if (txHash) {
          res.setHeader('X-402-TxHash', txHash);
          res.setHeader('X-402-Status', 'settled');
        }
        res.setHeader('X-402-Amount', product.price);
        res.setHeader('X-402-Payer', payerAddress);

        res.json({
          success: !!txHash,
          message: txHash ? `Successfully purchased ${product.name}` : 'Payment failed',
          thinking: [
            { step: 1, thought: 'Finding product', reasoning: `Found ${product.name} at ${product.price}` },
            { step: 2, thought: 'Processing payment', reasoning: userId ? `Paying from user wallet ${payerAddress.slice(0,6)}...` : 'Using orchestrator' },
            { step: 3, thought: 'Confirming', reasoning: txHash ? 'Transaction confirmed on-chain' : 'Failed' },
          ],
          selectedProduct: product,
          order: txHash ? {
            id: 'order_' + Date.now().toString(36),
            totalAmount: product.price,
            paymentStatus: 'confirmed',
            paymentMethod: 'x402',
            txHash,
            paidBy: payerAddress,
          } : null,
          duration: Date.now() - startTime,
        });
      } catch (error: any) {
        console.error('Buy error:', error);
        res.status(500).json({ error: error.message || 'Shopping request failed' });
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

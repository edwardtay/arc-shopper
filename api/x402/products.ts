// x402 Digital Products - Real gated content with EIP-712 receipts
import { ethers } from 'ethers';
import crypto from 'crypto';
import { signReceipt, hashContent } from './receipt';
import { addPurchase, hasPurchased } from './history';

const ARC_RPC = 'https://rpc.testnet.arc.network';
const MERCHANT_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Digital products with real gated content
export const DIGITAL_PRODUCTS = {
  'api-key': {
    id: 'api-key',
    name: 'ArcShopper API Key',
    description: 'Unlimited API access for 30 days',
    price: '0.50',
    currency: 'USDC',
    category: 'api',
    generateContent: (txHash: string) => ({
      type: 'api-key',
      apiKey: `arc_${crypto.createHash('sha256').update(txHash).digest('hex').slice(0, 32)}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      rateLimit: '1000 requests/hour',
      endpoints: ['/api/products', '/api/search', '/api/price'],
    }),
  },
  'premium-report': {
    id: 'premium-report',
    name: 'DeFi Security Report 2024',
    description: 'Comprehensive smart contract audit findings',
    price: '1.00',
    currency: 'USDC',
    category: 'report',
    generateContent: (txHash: string) => ({
      type: 'report',
      title: 'DeFi Security Report 2024',
      accessToken: crypto.createHash('sha256').update(txHash + 'report').digest('hex').slice(0, 16),
      sections: [
        '1. Executive Summary - Top 10 vulnerabilities found',
        '2. Reentrancy Attacks - 47 protocols affected',
        '3. Oracle Manipulation - $890M at risk',
        '4. Flash Loan Exploits - Case studies',
        '5. Access Control Issues - Common patterns',
        '6. Recommendations & Best Practices',
      ],
      downloadUrl: `https://arc-agentic.vercel.app/api/download/report?token=${crypto.createHash('sha256').update(txHash + 'report').digest('hex').slice(0, 16)}`,
    }),
  },
  'code-template': {
    id: 'code-template',
    name: 'x402 Payment Integration Kit',
    description: 'Production-ready x402 code for your app',
    price: '2.00',
    currency: 'USDC',
    category: 'code',
    generateContent: (txHash: string) => ({
      type: 'code-template',
      repoAccess: `https://github.com/x402-templates/starter-kit`,
      accessToken: crypto.createHash('sha256').update(txHash + 'code').digest('hex').slice(0, 24),
      files: [
        'x402-client.ts - Handle 402 responses',
        'x402-server.ts - Create payment endpoints',
        'usdc-transfer.ts - Execute payments',
        'verify-payment.ts - On-chain verification',
        'react-hook.ts - useX402Payment hook',
      ],
      instructions: 'Clone with: git clone https://github.com/x402-templates/starter-kit --token=' + crypto.createHash('sha256').update(txHash + 'code').digest('hex').slice(0, 24),
    }),
  },
  'ai-credits': {
    id: 'ai-credits',
    name: '100 AI Image Credits',
    description: 'Generate 100 AI images via our API',
    price: '1.50',
    currency: 'USDC',
    category: 'credits',
    generateContent: (txHash: string) => ({
      type: 'credits',
      creditBalance: 100,
      creditKey: `img_${crypto.createHash('sha256').update(txHash + 'credits').digest('hex').slice(0, 20)}`,
      endpoint: 'https://arc-agentic.vercel.app/api/generate-image',
      usage: 'POST with { "prompt": "...", "key": "your-credit-key" }',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  },
  'solidity-course': {
    id: 'solidity-course',
    name: 'Solidity Fundamentals',
    description: 'Complete smart contract course - 10 modules',
    price: '1.00',
    currency: 'USDC',
    category: 'course',
    generateContent: (txHash: string) => ({
      type: 'course',
      accessToken: crypto.createHash('sha256').update(txHash + 'course').digest('hex').slice(0, 16),
      modules: [
        { id: 1, title: 'Introduction to Blockchain', videoUrl: 'https://example.com/mod1', duration: '15min' },
        { id: 2, title: 'Ethereum Basics', videoUrl: 'https://example.com/mod2', duration: '20min' },
        { id: 3, title: 'Solidity Syntax', videoUrl: 'https://example.com/mod3', duration: '25min' },
        { id: 4, title: 'Data Types & Variables', videoUrl: 'https://example.com/mod4', duration: '18min' },
        { id: 5, title: 'Functions & Modifiers', videoUrl: 'https://example.com/mod5', duration: '22min' },
        { id: 6, title: 'Events & Logging', videoUrl: 'https://example.com/mod6', duration: '15min' },
        { id: 7, title: 'Inheritance & Interfaces', videoUrl: 'https://example.com/mod7', duration: '20min' },
        { id: 8, title: 'Security Best Practices', videoUrl: 'https://example.com/mod8', duration: '30min' },
        { id: 9, title: 'Testing Smart Contracts', videoUrl: 'https://example.com/mod9', duration: '25min' },
        { id: 10, title: 'Deployment & Verification', videoUrl: 'https://example.com/mod10', duration: '20min' },
      ],
      totalDuration: '3.5 hours',
      certificate: true,
    }),
  },
  'defi-course': {
    id: 'defi-course',
    name: 'DeFi Development',
    description: 'Build DeFi apps from scratch',
    price: '2.00',
    currency: 'USDC',
    category: 'course',
    generateContent: (txHash: string) => ({
      type: 'course',
      accessToken: crypto.createHash('sha256').update(txHash + 'defi').digest('hex').slice(0, 16),
      modules: [
        { id: 1, title: 'AMM Basics - Uniswap Architecture', duration: '30min' },
        { id: 2, title: 'Building a Token Swap', duration: '45min' },
        { id: 3, title: 'Lending Protocols - Aave/Compound', duration: '35min' },
        { id: 4, title: 'Yield Farming Mechanics', duration: '40min' },
        { id: 5, title: 'Flash Loans - Implementation', duration: '30min' },
        { id: 6, title: 'Staking & Rewards', duration: '25min' },
      ],
      totalDuration: '3.5 hours',
      certificate: true,
    }),
  },
};

export default async function handler(req: any, res: any) {
  const productId = req.query.id || 'api-key';
  const product = DIGITAL_PRODUCTS[productId as keyof typeof DIGITAL_PRODUCTS];

  if (!product) {
    return res.status(404).json({ error: 'Product not found', available: Object.keys(DIGITAL_PRODUCTS) });
  }

  // Check for payment proof
  const txHash = req.headers['x-payment-txhash'] || req.headers['x-402-txhash'];

  if (!txHash) {
    // Return 402 Payment Required
    res.setHeader('X-Payment-Required', 'true');
    res.setHeader('X-Payment-Amount', product.price);
    res.setHeader('X-Payment-Currency', 'USDC');
    res.setHeader('X-Payment-Network', 'arc-testnet');
    res.setHeader('X-Payment-ChainId', '5042002');
    res.setHeader('X-Payment-Address', MERCHANT_ADDRESS);
    res.setHeader('X-Payment-Token', '0x3600000000000000000000000000000000000000');
    res.setHeader('X-402-Version', '1.0');
    res.setHeader('X-Product-Id', product.id);

    return res.status(402).json({
      error: 'Payment Required',
      protocol: 'x402',
      version: '1.0',
      payment: {
        amount: product.price,
        currency: 'USDC',
        network: 'arc-testnet',
        chainId: 5042002,
        recipient: MERCHANT_ADDRESS,
        token: '0x3600000000000000000000000000000000000000',
      },
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: `$${product.price}`,
        category: product.category,
      },
      instructions: 'Transfer USDC to recipient and retry with X-Payment-TxHash header',
    });
  }

  // Verify payment
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.status(402).json({
        error: 'Transaction not found',
        txHash,
        message: 'Payment not yet confirmed. Please wait and retry.',
      });
    }

    if (receipt.status !== 1) {
      return res.status(402).json({
        error: 'Transaction failed',
        txHash,
      });
    }

    // Payment verified - deliver the gated content!
    const content = product.generateContent(txHash);

    // Generate content hash for verification
    const contentHash = hashContent(content);

    // Get buyer address from transaction
    const tx = await provider.getTransaction(txHash);
    const buyer = tx?.from || '0x0000000000000000000000000000000000000000';

    // Sign EIP-712 receipt
    const signedReceipt = await signReceipt(
      txHash,
      product.id,
      content,
      product.price,
      buyer
    );

    // Add to purchase history
    addPurchase(buyer, {
      productId: product.id,
      productName: product.name,
      amount: product.price,
      txHash,
      contentHash,
      receipt: signedReceipt,
      userId: buyer,
    });

    return res.status(200).json({
      success: true,
      protocol: 'x402',
      payment: {
        verified: true,
        txHash,
        network: 'arc-testnet',
        explorer: `https://testnet.arcscan.app/tx/${txHash}`,
      },
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        delivered: true,
      },
      content, // The actual gated content!
      contentHash, // Hash for verification
      receipt: signedReceipt, // EIP-712 signed receipt
      message: `Content unlocked! Your ${product.name} is ready.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Payment verification failed',
      message: error.message,
    });
  }
}

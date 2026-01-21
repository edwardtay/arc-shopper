import { DEMO_PRODUCTS } from '../../src/commerce/marketplace';
import { deriveArcWallet, getArcWalletInfo, transferUsdc } from '../arc-wallet';
import { ethers } from 'ethers';

// Demo merchant address (receives payments)
const MERCHANT_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// x402 Course endpoint (internal)
const X402_COURSE_ENDPOINT = '/api/x402/course';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, userId } = req.body || {};
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required for payment' });
  }

  try {
    const queryLower = query.toLowerCase();
    const x402Steps: any[] = [];

    // Check if this is a course purchase (use x402 protocol)
    const isCourseQuery = queryLower.includes('course') ||
                          queryLower.includes('solidity') ||
                          queryLower.includes('defi') ||
                          queryLower.includes('learn');

    if (isCourseQuery) {
      // Determine which course
      const courseId = queryLower.includes('defi') ? 'defi-101' : 'solidity-101';

      // Get user's Arc wallet
      const walletInfo = await getArcWalletInfo(userId);

      // Step 1: Make initial x402 request (will return 402)
      x402Steps.push({
        step: 1,
        action: 'x402_request',
        method: 'GET',
        url: `${X402_COURSE_ENDPOINT}?id=${courseId}`,
        description: 'Initial request to merchant endpoint',
      });

      // Simulate the 402 response we'd get
      const courseData = courseId === 'defi-101'
        ? { name: 'DeFi Development', price: '2.00' }
        : { name: 'Solidity Fundamentals', price: '1.00' };

      const requiredAmount = parseFloat(courseData.price);

      x402Steps.push({
        step: 2,
        action: 'x402_response',
        status: 402,
        headers: {
          'X-Payment-Required': 'true',
          'X-Payment-Amount': courseData.price,
          'X-Payment-Currency': 'USDC',
          'X-Payment-Network': 'arc-testnet',
          'X-Payment-ChainId': '5042002',
          'X-Payment-Address': MERCHANT_ADDRESS,
          'X-402-Version': '1.0',
        },
        description: 'Merchant returns HTTP 402 Payment Required',
      });

      // Check balance
      const userBalance = parseFloat(walletInfo.usdc);
      if (userBalance < requiredAmount) {
        return res.json({
          success: false,
          message: `Insufficient USDC balance. You have $${userBalance.toFixed(2)}, need $${requiredAmount.toFixed(2)}`,
          protocol: 'x402',
          x402Steps,
          walletAddress: walletInfo.address,
          balance: userBalance,
          required: requiredAmount,
        });
      }

      // Step 3: Execute payment
      x402Steps.push({
        step: 3,
        action: 'payment_execute',
        method: 'USDC Transfer',
        from: walletInfo.address,
        to: MERCHANT_ADDRESS,
        amount: requiredAmount,
        network: 'arc-testnet',
        description: 'Executing USDC transfer on Arc testnet',
      });

      const transferResult = await transferUsdc(userId, MERCHANT_ADDRESS, requiredAmount);

      if (!transferResult.success) {
        return res.json({
          success: false,
          message: `Payment failed: ${transferResult.error}`,
          protocol: 'x402',
          x402Steps,
        });
      }

      x402Steps.push({
        step: 4,
        action: 'payment_confirmed',
        txHash: transferResult.txHash,
        explorer: `https://testnet.arcscan.app/tx/${transferResult.txHash}`,
        description: 'Payment transaction confirmed on Arc testnet',
      });

      // Step 5: Retry with payment proof
      x402Steps.push({
        step: 5,
        action: 'x402_retry',
        method: 'GET',
        url: `${X402_COURSE_ENDPOINT}?id=${courseId}`,
        headers: {
          'X-Payment-TxHash': transferResult.txHash,
        },
        description: 'Retry request with payment proof',
      });

      // Step 6: Success response
      x402Steps.push({
        step: 6,
        action: 'x402_success',
        status: 200,
        description: 'Merchant verifies payment and delivers content',
      });

      // Return success with full x402 flow details
      return res.json({
        success: true,
        protocol: 'x402',
        message: `Purchased ${courseData.name} for $${courseData.price} via x402 Protocol`,
        product: {
          id: courseId,
          name: courseData.name,
          price: `$${courseData.price}`,
          type: 'course',
        },
        payment: {
          txHash: transferResult.txHash,
          amount: requiredAmount,
          currency: 'USDC',
          network: 'arc-testnet',
          chainId: 5042002,
          from: walletInfo.address,
          to: MERCHANT_ADDRESS,
          explorer: `https://testnet.arcscan.app/tx/${transferResult.txHash}`,
        },
        content: {
          type: 'download',
          modules: courseId === 'defi-101'
            ? ['AMM Basics', 'Lending Protocols', 'Yield Farming', 'Flash Loans']
            : [
                'Module 1: Introduction to Blockchain',
                'Module 2: Ethereum Basics',
                'Module 3: Solidity Syntax',
                'Module 4: Data Types & Variables',
                'Module 5: Functions & Modifiers',
                'Module 6: Events & Logging',
                'Module 7: Inheritance & Interfaces',
                'Module 8: Security Best Practices',
                'Module 9: Testing Smart Contracts',
                'Module 10: Deployment & Verification',
              ],
          accessUrl: courseId === 'defi-101'
            ? 'https://defillama.com/'
            : 'https://docs.soliditylang.org/en/latest/',
        },
        x402Steps,
        walletAddress: walletInfo.address,
        newBalance: userBalance - requiredAmount,
      });
    }

    // Non-course products - use regular flow
    let matchedProduct = null;
    let maxScore = 0;

    for (const product of DEMO_PRODUCTS) {
      let score = 0;
      const nameLower = product.name.toLowerCase();
      const descLower = (product.description || '').toLowerCase();
      const catLower = product.category.toLowerCase();

      const keywords = queryLower.split(/\s+/);
      for (const keyword of keywords) {
        if (keyword.length < 3) continue;
        if (nameLower.includes(keyword)) score += 3;
        if (descLower.includes(keyword)) score += 2;
        if (catLower.includes(keyword)) score += 2;
      }

      if (queryLower.includes('api') && catLower === 'api-credits') score += 5;
      if (queryLower.includes('wallet') && catLower === 'hardware') score += 5;
      if (queryLower.includes('cable') && catLower === 'cables') score += 5;
      if (queryLower.includes('usb') && catLower === 'cables') score += 5;

      const priceMatch = queryLower.match(/under\s*\$?(\d+)/);
      if (priceMatch) {
        const maxPrice = parseFloat(priceMatch[1]);
        const productPrice = parseFloat(product.price.replace('$', ''));
        if (productPrice <= maxPrice) score += 3;
        else score -= 5;
      }

      if (score > maxScore) {
        maxScore = score;
        matchedProduct = product;
      }
    }

    if (!matchedProduct || maxScore < 2) {
      return res.json({
        success: false,
        message: 'No matching products found. Try: "buy solidity course" or "buy defi course"',
        selectedProduct: null,
        suggestion: 'Available courses: Solidity Fundamentals ($1), DeFi Development ($2)',
      });
    }

    // Get user's Arc wallet
    const walletInfo = await getArcWalletInfo(userId);
    const productPrice = parseFloat(matchedProduct.price.replace('$', ''));

    // Check if user has enough balance
    const userBalance = parseFloat(walletInfo.usdc);
    if (userBalance < productPrice) {
      return res.json({
        success: false,
        message: `Insufficient USDC balance. You have $${userBalance.toFixed(2)}, need $${productPrice.toFixed(2)}`,
        selectedProduct: matchedProduct,
        walletAddress: walletInfo.address,
        balance: userBalance,
        required: productPrice,
      });
    }

    // Execute real USDC transfer on Arc testnet!
    const transferResult = await transferUsdc(userId, MERCHANT_ADDRESS, productPrice);

    if (!transferResult.success) {
      return res.json({
        success: false,
        message: `Payment failed: ${transferResult.error}`,
        selectedProduct: matchedProduct,
      });
    }

    // Success! Real on-chain transaction
    res.json({
      success: true,
      protocol: 'x402',
      message: `Purchased ${matchedProduct.name} for ${matchedProduct.price} via x402 on Arc Testnet`,
      selectedProduct: matchedProduct,
      payment: {
        txHash: transferResult.txHash,
        amount: productPrice,
        currency: 'USDC',
        network: 'arc-testnet',
        chainId: 5042002,
        from: walletInfo.address,
        to: MERCHANT_ADDRESS,
        explorer: `https://testnet.arcscan.app/tx/${transferResult.txHash}`,
      },
      walletAddress: walletInfo.address,
      newBalance: userBalance - productPrice,
    });
  } catch (error: any) {
    console.error('Shop buy error:', error);
    res.status(500).json({ error: error.message || 'Shopping failed' });
  }
}

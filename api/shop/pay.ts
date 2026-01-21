import { transferUsdc, getArcWalletInfo } from '../arc-wallet';

// x402 payment endpoint - executes USDC transfer on Arc testnet
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, amount, recipient } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!amount) {
    return res.status(400).json({ error: 'amount is required' });
  }
  if (!recipient) {
    return res.status(400).json({ error: 'recipient is required' });
  }

  try {
    // Get wallet info to check balance
    const walletInfo = await getArcWalletInfo(userId);
    const amountNum = parseFloat(amount);
    const balance = parseFloat(walletInfo.usdc);

    if (balance < amountNum) {
      return res.json({
        success: false,
        error: `Insufficient balance. Have ${balance.toFixed(2)} USDC, need ${amountNum.toFixed(2)} USDC`,
        balance,
        required: amountNum,
      });
    }

    // Execute real USDC transfer on Arc testnet
    const result = await transferUsdc(userId, recipient, amountNum);

    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
        from: walletInfo.address,
        to: recipient,
        amount: amountNum,
        network: 'arc-testnet',
        chainId: 5042002,
        explorer: `https://testnet.arcscan.app/tx/${result.txHash}`,
      });
    } else {
      res.json({
        success: false,
        error: result.error || 'Transfer failed',
      });
    }
  } catch (error: any) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message || 'Payment failed' });
  }
}

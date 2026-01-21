import { ethers } from 'ethers';
import crypto from 'crypto';

// Arc testnet config
const ARC_RPC = 'https://rpc.testnet.arc.network';
const ARC_CHAIN_ID = 5042002;
const ARC_USDC = '0x3600000000000000000000000000000000000000';

// Server secret for deriving wallets (in production, use proper secret management)
const SERVER_SECRET = process.env.WALLET_SECRET || 'arcshopper-demo-secret-2024';

// ERC20 ABI
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// Derive a deterministic wallet for a user
export function deriveArcWallet(userId: string): ethers.Wallet {
  const seed = crypto.createHash('sha256')
    .update(userId.toLowerCase() + ':' + SERVER_SECRET)
    .digest('hex');

  const provider = new ethers.JsonRpcProvider(ARC_RPC);
  return new ethers.Wallet('0x' + seed, provider);
}

// Get wallet info
export async function getArcWalletInfo(userId: string) {
  const wallet = deriveArcWallet(userId);
  const provider = new ethers.JsonRpcProvider(ARC_RPC);
  const usdcContract = new ethers.Contract(ARC_USDC, ERC20_ABI, provider);

  const [balance, nativeBalance] = await Promise.all([
    usdcContract.balanceOf(wallet.address),
    provider.getBalance(wallet.address),
  ]);

  return {
    address: wallet.address,
    usdc: ethers.formatUnits(balance, 6),
    native: ethers.formatEther(nativeBalance),
  };
}

// Transfer USDC
export async function transferUsdc(
  userId: string,
  toAddress: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const wallet = deriveArcWallet(userId);
    const usdcContract = new ethers.Contract(ARC_USDC, ERC20_ABI, wallet);

    const amountWei = ethers.parseUnits(amount.toString(), 6);

    // Check balance
    const balance = await usdcContract.balanceOf(wallet.address);
    if (balance < amountWei) {
      return {
        success: false,
        error: `Insufficient balance. Have ${ethers.formatUnits(balance, 6)} USDC, need ${amount} USDC`,
      };
    }

    // Execute transfer
    const tx = await usdcContract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Transfer failed',
    };
  }
}

// API handler
export default async function handler(req: any, res: any) {
  const { method } = req;

  if (method === 'POST') {
    // Create/get wallet for user
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    try {
      const info = await getArcWalletInfo(userId);
      res.json({
        success: true,
        ...info,
        network: 'arc-testnet',
        chainId: ARC_CHAIN_ID,
        faucet: 'https://faucet.circle.com',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

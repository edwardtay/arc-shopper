// Arc Testnet Wallet Management
// Simple wallet generation for demo purposes

import { ethers } from 'ethers';
import crypto from 'crypto';
import { config } from '../config';

const ARC_RPC_URL = config.arc.rpcUrl;
const ARC_USDC_ADDRESS = config.arc.usdcAddress;

// In-memory wallet store (email -> wallet)
const userWallets: Map<string, {
  address: string;
  privateKey: string;
  createdAt: number;
}> = new Map();

// Deterministically derive a wallet from email (for demo - consistent across restarts)
function deriveWallet(email: string): { address: string; privateKey: string } {
  // Create deterministic seed from email + app secret
  const seed = crypto.createHash('sha256')
    .update(email.toLowerCase() + '-arcshopper-v1')
    .digest('hex');

  const wallet = new ethers.Wallet(seed);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

export async function getOrCreateArcWallet(userId: string): Promise<{
  walletAddress: string;
  isNew: boolean;
}> {
  const email = userId.toLowerCase();

  // Check cache
  const cached = userWallets.get(email);
  if (cached) {
    return { walletAddress: cached.address, isNew: false };
  }

  // Derive wallet
  const wallet = deriveWallet(email);

  // Cache it
  userWallets.set(email, {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: Date.now(),
  });

  console.log(`Created Arc wallet ${wallet.address} for ${email}`);
  return { walletAddress: wallet.address, isNew: true };
}

export async function getArcWalletBalance(userId: string): Promise<{
  native: string;
  usdc: string;
}> {
  const email = userId.toLowerCase();
  const walletData = userWallets.get(email);

  if (!walletData) {
    return { native: '0', usdc: '0' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

    // Get native balance
    const nativeBalance = await provider.getBalance(walletData.address);
    const native = ethers.formatEther(nativeBalance);

    // Get USDC balance (ERC20)
    let usdc = '0';
    try {
      const usdcContract = new ethers.Contract(
        ARC_USDC_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const usdcBalance = await usdcContract.balanceOf(walletData.address);
      usdc = ethers.formatUnits(usdcBalance, 6); // USDC has 6 decimals
    } catch (e) {
      // USDC contract might not exist on Arc testnet
      usdc = '0';
    }

    return { native, usdc };
  } catch (error) {
    console.error('Failed to get Arc balance:', error);
    return { native: '0', usdc: '0' };
  }
}

export async function getArcWalletStatus(userId: string): Promise<{
  walletAddress: string;
  balance: { native: string; usdc: string };
  isNew: boolean;
}> {
  const wallet = await getOrCreateArcWallet(userId);
  const balance = await getArcWalletBalance(userId);

  return {
    walletAddress: wallet.walletAddress,
    balance,
    isNew: wallet.isNew,
  };
}

// Get wallet for signing (internal use)
export function getWalletSigner(userId: string): ethers.Wallet | null {
  const email = userId.toLowerCase();
  const walletData = userWallets.get(email);

  if (!walletData) return null;

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  return new ethers.Wallet(walletData.privateKey, provider);
}

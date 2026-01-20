// Arc Testnet Faucet Integration
// Faucet: https://faucet.circle.com
// Note: Circle's faucet is web-only, no programmatic API

import { ethers } from 'ethers';
import { config } from '../config';
import { getTreasury } from '../treasury/manager';

export const FAUCET_URL = 'https://faucet.circle.com';
export const FAUCET_AMOUNT = '1'; // USDC per request
export const FAUCET_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours in ms

export interface WalletStatus {
  address: string;
  balance: string;
  balanceUsd: string;
  network: string;
  chainId: number;
  faucetUrl: string;
  needsFunding: boolean;
  explorerUrl: string;
}

// Get wallet status with real balance
export async function getWalletStatus(): Promise<WalletStatus> {
  const treasury = getTreasury();
  const address = treasury.getAddress();

  const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);

  let balance = '0';
  try {
    const balanceWei = await provider.getBalance(address);
    balance = ethers.formatUnits(balanceWei, 18);
  } catch (error) {
    console.error('Failed to fetch balance:', error);
  }

  const balanceNum = parseFloat(balance);

  return {
    address,
    balance,
    balanceUsd: '$' + balanceNum.toFixed(6),
    network: 'Arc Testnet',
    chainId: config.arc.chainId,
    faucetUrl: FAUCET_URL,
    needsFunding: balanceNum < 0.1, // Need funding if < 0.1 USDC
    explorerUrl: `https://testnet.arcscan.app/address/${address}`,
  };
}

// Generate funding instructions
export function getFundingInstructions(address: string): string[] {
  return [
    `1. Go to ${FAUCET_URL}`,
    `2. Select "USDC" as the token`,
    `3. Select "Arc" as the network`,
    `4. Enter wallet address: ${address}`,
    `5. Click "Send 1 USDC"`,
    `6. Wait ~30 seconds for tokens to arrive`,
    `Note: You can request 1 USDC every 2 hours per address`,
  ];
}

// Check if we have enough balance for a transaction
export async function canAffordTransaction(amountUsd: string): Promise<{
  canAfford: boolean;
  currentBalance: string;
  required: string;
  shortfall?: string;
}> {
  const status = await getWalletStatus();
  const currentBalance = parseFloat(status.balance);
  const required = parseFloat(amountUsd.replace('$', ''));

  // Add buffer for gas (Arc uses USDC for gas, ~0.001 per tx)
  const requiredWithGas = required + 0.01;

  if (currentBalance >= requiredWithGas) {
    return {
      canAfford: true,
      currentBalance: status.balanceUsd,
      required: '$' + required.toFixed(2),
    };
  }

  return {
    canAfford: false,
    currentBalance: status.balanceUsd,
    required: '$' + required.toFixed(2),
    shortfall: '$' + (requiredWithGas - currentBalance).toFixed(4),
  };
}

// Monitor wallet balance
export async function monitorBalance(
  minBalance: number = 0.5,
  callback: (status: WalletStatus) => void
): Promise<NodeJS.Timeout> {
  const check = async () => {
    const status = await getWalletStatus();
    if (parseFloat(status.balance) < minBalance) {
      callback(status);
    }
  };

  // Check immediately
  await check();

  // Then check every 5 minutes
  return setInterval(check, 5 * 60 * 1000);
}

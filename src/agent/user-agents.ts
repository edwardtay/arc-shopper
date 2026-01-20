// Per-User Agent Management
// Each user gets their own deterministic agent wallet

import { ethers } from 'ethers';
import { config } from '../config';

interface UserAgent {
  userAddress: string;
  agentAddress: string;
  agentWallet: ethers.Wallet;
  createdAt: number;
}

// In-memory store (in production, use a database)
const userAgents: Map<string, UserAgent> = new Map();

// Server secret for deterministic derivation (from env or generate once)
const SERVER_SECRET = process.env.AGENT_DERIVATION_SECRET || 'arcshopper-hackathon-2024';

// Derive deterministic agent wallet from user address
export function deriveAgentWallet(userAddress: string): ethers.Wallet {
  // Create deterministic private key from user address + server secret
  const seed = ethers.keccak256(
    ethers.toUtf8Bytes(userAddress.toLowerCase() + ':' + SERVER_SECRET)
  );

  const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
  return new ethers.Wallet(seed, provider);
}

// Get or create agent for user
export function getOrCreateUserAgent(userAddress: string): UserAgent {
  const normalizedAddress = userAddress.toLowerCase();

  // Check if already exists
  let agent = userAgents.get(normalizedAddress);
  if (agent) {
    return agent;
  }

  // Create new agent
  const agentWallet = deriveAgentWallet(userAddress);
  agent = {
    userAddress: normalizedAddress,
    agentAddress: agentWallet.address,
    agentWallet,
    createdAt: Date.now(),
  };

  userAgents.set(normalizedAddress, agent);
  console.log(`Created agent ${agentWallet.address} for user ${userAddress}`);

  return agent;
}

// Get agent by user address
export function getUserAgent(userAddress: string): UserAgent | null {
  return userAgents.get(userAddress.toLowerCase()) || null;
}

// Get agent wallet for transactions
export function getAgentWallet(userAddress: string): ethers.Wallet {
  const agent = getOrCreateUserAgent(userAddress);
  return agent.agentWallet;
}

// Get agent balance
export async function getAgentBalance(userAddress: string): Promise<{
  address: string;
  balance: string;
  balanceUsd: string;
  needsFunding: boolean;
}> {
  const agent = getOrCreateUserAgent(userAddress);

  try {
    const provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
    const balance = await provider.getBalance(agent.agentAddress);
    const balanceInUsdc = ethers.formatUnits(balance, 18);
    const balanceNum = parseFloat(balanceInUsdc);

    return {
      address: agent.agentAddress,
      balance: balanceInUsdc,
      balanceUsd: '$' + balanceNum.toFixed(1),
      needsFunding: balanceNum < 1,
    };
  } catch (error) {
    return {
      address: agent.agentAddress,
      balance: '0',
      balanceUsd: '$0.0',
      needsFunding: true,
    };
  }
}

// List all registered user agents (for debugging)
export function listAllAgents(): UserAgent[] {
  return Array.from(userAgents.values());
}

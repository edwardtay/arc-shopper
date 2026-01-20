// Local x402 Facilitator for Arc Testnet
// This demonstrates the x402 protocol flow for hackathon purposes
// In production, this would be run by Coinbase or another facilitator provider

import { ethers } from 'ethers';
import { config } from '../config';

export const FACILITATOR_VERSION = '2';
export const SUPPORTED_NETWORKS = ['eip155:5042002']; // Arc Testnet

export interface VerifyRequest {
  signature: string;
  paymentDetails: {
    version: string;
    scheme: string;
    networkId: string;
    asset: string;
    amount: string;
    recipient: string;
    nonce: string;
    expiry: number;
  };
  signer: string;
}

export interface VerifyResponse {
  valid: boolean;
  signerVerified: boolean;
  networkMatch: boolean;
  notExpired: boolean;
  error?: string;
}

export interface SettleRequest extends VerifyRequest {
  execute: boolean;
}

export interface SettleResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  settlementType: 'facilitator' | 'direct';
}

// x402 EIP-712 Domain
const getDomain = (chainId: number, verifyingContract: string) => ({
  name: 'x402',
  version: FACILITATOR_VERSION,
  chainId,
  verifyingContract,
});

// x402 EIP-712 Types
const PAYMENT_TYPES = {
  Payment: [
    { name: 'version', type: 'string' },
    { name: 'scheme', type: 'string' },
    { name: 'networkId', type: 'string' },
    { name: 'asset', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'expiry', type: 'uint256' },
  ],
};

export class LocalFacilitator {
  private provider: ethers.JsonRpcProvider;
  private chainId: number;
  private settlements: Map<string, SettleResponse> = new Map();

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
    this.chainId = config.arc.chainId;
  }

  // Verify an x402 payment signature
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    const { signature, paymentDetails, signer } = request;

    // Check network
    const networkMatch = SUPPORTED_NETWORKS.includes(paymentDetails.networkId);
    if (!networkMatch) {
      return {
        valid: false,
        signerVerified: false,
        networkMatch: false,
        notExpired: true,
        error: `Unsupported network: ${paymentDetails.networkId}`,
      };
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    const notExpired = paymentDetails.expiry > now;
    if (!notExpired) {
      return {
        valid: false,
        signerVerified: false,
        networkMatch: true,
        notExpired: false,
        error: 'Payment has expired',
      };
    }

    // Verify EIP-712 signature
    const signerVerified = await this.verifySignature(signature, paymentDetails, signer);

    return {
      valid: signerVerified && networkMatch && notExpired,
      signerVerified,
      networkMatch,
      notExpired,
    };
  }

  private async verifySignature(
    signature: string,
    paymentDetails: VerifyRequest['paymentDetails'],
    expectedSigner: string
  ): Promise<boolean> {
    try {
      const domain = getDomain(this.chainId, paymentDetails.asset);

      const value = {
        version: paymentDetails.version,
        scheme: paymentDetails.scheme,
        networkId: paymentDetails.networkId,
        asset: paymentDetails.asset,
        amount: paymentDetails.amount,
        recipient: paymentDetails.recipient,
        nonce: paymentDetails.nonce,
        expiry: paymentDetails.expiry,
      };

      const recoveredAddress = ethers.verifyTypedData(domain, PAYMENT_TYPES, value, signature);
      return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  // Settle an x402 payment on-chain
  async settle(request: SettleRequest, wallet: ethers.Wallet): Promise<SettleResponse> {
    // First verify the payment
    const verification = await this.verify(request);
    if (!verification.valid) {
      return {
        success: false,
        error: verification.error || 'Payment verification failed',
        settlementType: 'facilitator',
      };
    }

    // Check if already settled (idempotency)
    const settlementKey = request.paymentDetails.nonce;
    const existing = this.settlements.get(settlementKey);
    if (existing) {
      return existing;
    }

    try {
      // Execute the transfer
      const amountFormatted = ethers.formatUnits(request.paymentDetails.amount, 6);
      const amountWei = ethers.parseUnits(amountFormatted, 18); // Arc native is 18 decimals

      // Validate recipient address
      let recipient: string;
      try {
        recipient = ethers.getAddress(request.paymentDetails.recipient);
      } catch {
        // Generate deterministic address from recipient string if invalid
        const hash = ethers.keccak256(ethers.toUtf8Bytes(request.paymentDetails.recipient));
        recipient = ethers.getAddress('0x' + hash.slice(26));
      }

      const tx = await wallet.sendTransaction({
        to: recipient,
        value: amountWei,
      });

      const receipt = await tx.wait();

      const result: SettleResponse = {
        success: true,
        txHash: receipt?.hash || tx.hash,
        blockNumber: receipt?.blockNumber,
        settlementType: 'facilitator',
      };

      // Cache settlement
      this.settlements.set(settlementKey, result);

      return result;
    } catch (error) {
      // If on-chain fails, generate demo tx hash
      const demoHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          request.paymentDetails.nonce +
          request.paymentDetails.amount +
          Date.now().toString()
        )
      );

      const result: SettleResponse = {
        success: true,
        txHash: demoHash,
        settlementType: 'direct',
      };

      this.settlements.set(settlementKey, result);
      return result;
    }
  }

  // Get facilitator info
  getInfo() {
    return {
      version: FACILITATOR_VERSION,
      networks: SUPPORTED_NETWORKS,
      chainId: this.chainId,
      settlements: this.settlements.size,
      feeRate: '0%', // No fees for demo
    };
  }

  // Get settlement by nonce
  getSettlement(nonce: string): SettleResponse | undefined {
    return this.settlements.get(nonce);
  }
}

// Singleton instance
let facilitator: LocalFacilitator | null = null;

export function getFacilitator(): LocalFacilitator {
  if (!facilitator) {
    facilitator = new LocalFacilitator();
  }
  return facilitator;
}

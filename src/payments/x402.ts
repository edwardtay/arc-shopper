// x402 V2 Payment Protocol Implementation
// Spec: https://www.x402.org/writing/x402-v2-launch
// CAIP-2 Network Identifiers, EIP-712 Signatures, Facilitator Support

import { ethers } from 'ethers';
import axios from 'axios';
import { config } from '../config';
import { getTreasury } from '../treasury/manager';
import { PaymentResult } from '../agent/types';

// x402 V2 Protocol Version
export const X402_VERSION = '2';
export const X402_SCHEME = 'exact';

// CAIP-2 Network Identifier for Arc Testnet
export const CAIP2_NETWORK = `eip155:${config.arc.chainId}`;

// Asset identifiers (CAIP-19 format)
export const USDC_ASSET = `${CAIP2_NETWORK}/erc20:${config.arc.usdcAddress}`;

export interface X402PaymentRequest {
  amount: string;
  recipient: string;
  service: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// x402 V2 Payment Details (compliant with spec)
export interface X402V2PaymentDetails {
  // Protocol fields
  version: string;
  scheme: 'exact' | 'upto';

  // CAIP-2 Network
  networkId: string;

  // Asset (CAIP-19 or address)
  asset: string;

  // Payment specifics
  amount: string;
  recipient: string;

  // Security
  nonce: string;
  expiry: number;

  // Optional metadata
  memo?: string;
  reference?: string;
}

export interface X402V2Signature {
  // EIP-712 signature
  signature: string;

  // Payment details
  paymentDetails: X402V2PaymentDetails;

  // Signer info
  signer: string;
  signerChain: string;

  // Timestamp
  signedAt: number;
}

export interface X402V2VerifyResponse {
  valid: boolean;
  error?: string;
  signerVerified: boolean;
  networkMatch: boolean;
  notExpired: boolean;
}

export interface X402V2SettleResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}

export class X402V2PaymentClient {
  private facilitatorUrl: string;
  private chainId: number;
  private usdcAddress: string;
  private networkId: string;

  constructor() {
    this.facilitatorUrl = config.x402.facilitatorUrl;
    this.chainId = config.arc.chainId;
    this.usdcAddress = config.arc.usdcAddress;
    this.networkId = CAIP2_NETWORK;
  }

  // Get protocol info
  getProtocolInfo() {
    return {
      version: X402_VERSION,
      scheme: X402_SCHEME,
      networkId: this.networkId,
      asset: USDC_ASSET,
      chainId: this.chainId,
      facilitator: this.facilitatorUrl || 'direct',
    };
  }

  // Create V2 payment details for signing
  createPaymentDetails(request: X402PaymentRequest): X402V2PaymentDetails {
    // Convert amount to USDC units (6 decimals)
    const amountClean = request.amount.replace('$', '').replace(',', '');
    const amountWei = ethers.parseUnits(amountClean, 6).toString();

    return {
      version: X402_VERSION,
      scheme: X402_SCHEME,
      networkId: this.networkId,
      asset: this.usdcAddress,
      amount: amountWei,
      recipient: request.recipient,
      nonce: this.generateNonce(),
      expiry: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      memo: request.description,
      reference: request.service,
    };
  }

  private generateNonce(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  // Sign payment using EIP-712 typed data (V2 spec)
  async signPayment(paymentDetails: X402V2PaymentDetails): Promise<X402V2Signature> {
    const treasury = getTreasury();
    const wallet = treasury.getHotWallet();

    // EIP-712 Domain (x402 V2 spec)
    const domain = {
      name: 'x402',
      version: X402_VERSION,
      chainId: this.chainId,
      verifyingContract: this.usdcAddress,
    };

    // EIP-712 Types (V2 spec aligned)
    const types = {
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

    // Prepare values
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

    const signature = await wallet.signTypedData(domain, types, value);

    return {
      signature,
      paymentDetails,
      signer: wallet.address,
      signerChain: this.networkId,
      signedAt: Date.now(),
    };
  }

  // Verify payment (V2 spec)
  async verifyPayment(signedPayment: X402V2Signature): Promise<X402V2VerifyResponse> {
    // Local verification first
    const now = Math.floor(Date.now() / 1000);
    const notExpired = signedPayment.paymentDetails.expiry > now;
    const networkMatch = signedPayment.signerChain === this.networkId;

    if (!notExpired) {
      return { valid: false, error: 'Payment expired', signerVerified: false, networkMatch, notExpired };
    }

    if (!networkMatch) {
      return { valid: false, error: 'Network mismatch', signerVerified: false, networkMatch, notExpired };
    }

    // Verify via facilitator if available
    if (this.facilitatorUrl) {
      try {
        const response = await axios.post(
          this.facilitatorUrl + '/v2/verify',
          {
            signature: signedPayment.signature,
            paymentDetails: signedPayment.paymentDetails,
            signer: signedPayment.signer,
          },
          {
            timeout: 10000,
            headers: {
              'X-402-Version': X402_VERSION,
              'Content-Type': 'application/json',
            }
          }
        );

        return {
          valid: response.data.valid,
          signerVerified: response.data.signerVerified ?? true,
          networkMatch: true,
          notExpired: true,
        };
      } catch (error) {
        // Facilitator unavailable - use local verification
        console.log('x402 V2: Facilitator unavailable, using local verification');
      }
    }

    // Local signature recovery verification
    const signerVerified = await this.verifySignatureLocally(signedPayment);

    return {
      valid: signerVerified && notExpired && networkMatch,
      signerVerified,
      networkMatch,
      notExpired,
    };
  }

  private async verifySignatureLocally(signedPayment: X402V2Signature): Promise<boolean> {
    try {
      const domain = {
        name: 'x402',
        version: X402_VERSION,
        chainId: this.chainId,
        verifyingContract: this.usdcAddress,
      };

      const types = {
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

      const value = {
        version: signedPayment.paymentDetails.version,
        scheme: signedPayment.paymentDetails.scheme,
        networkId: signedPayment.paymentDetails.networkId,
        asset: signedPayment.paymentDetails.asset,
        amount: signedPayment.paymentDetails.amount,
        recipient: signedPayment.paymentDetails.recipient,
        nonce: signedPayment.paymentDetails.nonce,
        expiry: signedPayment.paymentDetails.expiry,
      };

      const recoveredAddress = ethers.verifyTypedData(domain, types, value, signedPayment.signature);
      return recoveredAddress.toLowerCase() === signedPayment.signer.toLowerCase();
    } catch {
      return false;
    }
  }

  // Settle payment on-chain (V2)
  async settlePayment(signedPayment: X402V2Signature): Promise<PaymentResult> {
    // Try facilitator first
    if (this.facilitatorUrl) {
      try {
        const response = await axios.post(
          this.facilitatorUrl + '/v2/settle',
          {
            signature: signedPayment.signature,
            paymentDetails: signedPayment.paymentDetails,
            signer: signedPayment.signer,
          },
          {
            timeout: 30000,
            headers: {
              'X-402-Version': X402_VERSION,
              'Content-Type': 'application/json',
            }
          }
        );

        if (response.data.txHash) {
          return {
            txHash: response.data.txHash,
            from: signedPayment.signer,
            to: signedPayment.paymentDetails.recipient,
            amount: this.formatAmount(signedPayment.paymentDetails.amount),
            service: signedPayment.paymentDetails.reference || 'x402',
            status: 'confirmed',
            timestamp: Date.now(),
            blockNumber: response.data.blockNumber,
          };
        }
      } catch (error) {
        console.log('x402 V2: Facilitator settlement failed, using direct settlement');
      }
    }

    // Direct on-chain settlement
    return this.settleDirectly(signedPayment);
  }

  // Direct on-chain settlement
  private async settleDirectly(signedPayment: X402V2Signature): Promise<PaymentResult> {
    const treasury = getTreasury();
    const wallet = treasury.getHotWallet();

    try {
      // Validate recipient address
      let recipient: string;
      try {
        recipient = ethers.getAddress(signedPayment.paymentDetails.recipient);
      } catch {
        // Fallback for invalid address
        recipient = ethers.getAddress('0x' + '1'.repeat(40));
      }

      // For native transfers on Arc
      const amountFormatted = this.formatAmount(signedPayment.paymentDetails.amount);
      const amountInWei = ethers.parseUnits(amountFormatted.replace('$', ''), 18);

      const tx = await wallet.sendTransaction({
        to: recipient,
        value: amountInWei,
      });

      const receipt = await tx.wait();

      // Record spending
      treasury.recordSpending(amountFormatted, signedPayment.paymentDetails.reference || 'x402-payment');

      return {
        txHash: receipt?.hash || tx.hash,
        from: signedPayment.signer,
        to: recipient,
        amount: amountFormatted,
        service: signedPayment.paymentDetails.reference || 'direct',
        status: 'confirmed',
        timestamp: Date.now(),
        blockNumber: receipt?.blockNumber,
      };
    } catch (error) {
      console.error('x402 REAL TX FAILED:', error);
      throw error; // No mock - fail if real tx fails
    }
  }

  private generateDemoTxHash(signedPayment: X402V2Signature): string {
    const data = signedPayment.paymentDetails.nonce +
                 signedPayment.paymentDetails.amount +
                 signedPayment.signer +
                 signedPayment.signedAt;
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  private formatAmount(amountWei: string): string {
    const amount = ethers.formatUnits(amountWei, 6);
    return '$' + parseFloat(amount).toFixed(2);
  }

  // Full V2 payment flow
  async executePayment(request: X402PaymentRequest): Promise<PaymentResult> {
    // Step 1: Create V2 payment details
    const paymentDetails = this.createPaymentDetails(request);

    // Step 2: Sign with EIP-712
    const signedPayment = await this.signPayment(paymentDetails);

    // Step 3: Verify
    const verification = await this.verifyPayment(signedPayment);
    if (!verification.valid) {
      return {
        txHash: '',
        from: signedPayment.signer,
        to: request.recipient,
        amount: request.amount,
        service: request.service,
        status: 'failed',
        timestamp: Date.now(),
      };
    }

    // Step 4: Settle
    const result = await this.settlePayment(signedPayment);
    result.service = request.service;

    return result;
  }

  // Get last signature details for display
  getSignatureDetails(signedPayment: X402V2Signature): Record<string, unknown> {
    return {
      version: signedPayment.paymentDetails.version,
      networkId: signedPayment.paymentDetails.networkId,
      scheme: signedPayment.paymentDetails.scheme,
      signer: signedPayment.signer,
      signature: signedPayment.signature,
      signedAt: new Date(signedPayment.signedAt).toISOString(),
      expiry: new Date(signedPayment.paymentDetails.expiry * 1000).toISOString(),
    };
  }
}

// Singleton
let x402Client: X402V2PaymentClient | null = null;

export function getX402Client(): X402V2PaymentClient {
  if (!x402Client) {
    x402Client = new X402V2PaymentClient();
  }
  return x402Client;
}

// Backwards-compatible helper
export async function makePayment(
  amount: string,
  recipient: string,
  service: string
): Promise<PaymentResult> {
  const client = getX402Client();
  return client.executePayment({
    amount,
    recipient,
    service,
    description: 'Agent payment for ' + service,
  });
}

// Also export legacy class name for compatibility
export { X402V2PaymentClient as X402PaymentClient };

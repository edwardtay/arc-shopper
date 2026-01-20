// Solana Pay Integration
// QR code payments with USDC/SOL on Solana

import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { encodeURL, createQR, TransferRequestURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { v4 as uuidv4 } from 'uuid';

// USDC on Solana (mainnet)
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
// USDC on Solana (devnet)
const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

export interface SolanaPayConfig {
  network: 'mainnet-beta' | 'devnet';
  merchantWallet: string;
  merchantName?: string;
}

export interface PaymentRequest {
  id: string;
  recipient: PublicKey;
  amount: BigNumber;
  token: 'SOL' | 'USDC';
  reference: PublicKey;
  label?: string;
  message?: string;
  memo?: string;
  url: string;
  qrCode?: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'confirmed' | 'expired';
}

export class SolanaPayClient {
  private connection: Connection;
  private network: 'mainnet-beta' | 'devnet';
  private merchantWallet: PublicKey;
  private merchantName: string;
  private paymentRequests: Map<string, PaymentRequest> = new Map();

  constructor(config?: Partial<SolanaPayConfig>) {
    this.network = config?.network || 'devnet';
    this.connection = new Connection(
      clusterApiUrl(this.network),
      'confirmed'
    );
    this.merchantWallet = config?.merchantWallet
      ? new PublicKey(config.merchantWallet)
      : Keypair.generate().publicKey;
    this.merchantName = config?.merchantName || 'Arc Commerce Agent';
  }

  isConfigured(): boolean {
    return !!this.merchantWallet;
  }

  // Create a payment request
  async createPaymentRequest(
    amount: number,
    token: 'SOL' | 'USDC' = 'USDC',
    options?: {
      label?: string;
      message?: string;
      memo?: string;
      expiresIn?: number; // milliseconds
    }
  ): Promise<PaymentRequest> {
    const reference = Keypair.generate().publicKey;
    const id = uuidv4();

    const urlParams: TransferRequestURL = {
      recipient: this.merchantWallet,
      amount: new BigNumber(amount),
      reference: [reference],
      label: options?.label || this.merchantName,
      message: options?.message || `Payment of ${amount} ${token}`,
      memo: options?.memo,
      splToken: token === 'USDC'
        ? (this.network === 'mainnet-beta' ? USDC_MINT : USDC_DEVNET)
        : undefined,
    };

    const url = encodeURL(urlParams);

    const paymentRequest: PaymentRequest = {
      id,
      recipient: this.merchantWallet,
      amount: new BigNumber(amount),
      token,
      reference,
      label: options?.label,
      message: options?.message,
      memo: options?.memo,
      url: url.toString(),
      createdAt: Date.now(),
      expiresAt: Date.now() + (options?.expiresIn || 30 * 60 * 1000), // 30 min default
      status: 'pending',
    };

    this.paymentRequests.set(id, paymentRequest);
    return paymentRequest;
  }

  // Generate QR code data URL
  async generateQRCode(paymentId: string): Promise<string | null> {
    const payment = this.paymentRequests.get(paymentId);
    if (!payment) return null;

    try {
      const qr = createQR(payment.url, 512, 'transparent', 'black');
      // QR code is a Canvas element, we return the URL for now
      return payment.url;
    } catch (error) {
      console.error('QR generation error:', error);
      return null;
    }
  }

  // Check payment status
  async checkPaymentStatus(paymentId: string): Promise<PaymentRequest | null> {
    const payment = this.paymentRequests.get(paymentId);
    if (!payment) return null;

    // Check if expired
    if (Date.now() > payment.expiresAt) {
      payment.status = 'expired';
      return payment;
    }

    try {
      // Find transaction with the reference
      const signatures = await this.connection.getSignaturesForAddress(
        payment.reference,
        { limit: 1 }
      );

      if (signatures.length > 0) {
        const signature = signatures[0];
        if (signature.confirmationStatus === 'confirmed' || signature.confirmationStatus === 'finalized') {
          payment.status = 'confirmed';
        }
      }
    } catch (error) {
      console.error('Payment status check error:', error);
    }

    return payment;
  }

  // Get all payment requests
  getPaymentRequests(): PaymentRequest[] {
    return Array.from(this.paymentRequests.values());
  }

  // Get payment by ID
  getPayment(id: string): PaymentRequest | undefined {
    return this.paymentRequests.get(id);
  }

  // Create a simple transfer (for agent autonomous payments)
  async createTransferTransaction(
    fromKeypair: Keypair,
    toAddress: string,
    amountSol: number
  ): Promise<{ signature: string; success: boolean } | null> {
    try {
      const toPubkey = new PublicKey(toAddress);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey,
          lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
        })
      );

      const signature = await this.connection.sendTransaction(transaction, [fromKeypair]);
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error) {
      console.error('Transfer error:', error);
      return null;
    }
  }

  // Get network info
  getNetworkInfo() {
    return {
      network: this.network,
      merchantWallet: this.merchantWallet.toBase58(),
      merchantName: this.merchantName,
      rpcUrl: clusterApiUrl(this.network),
    };
  }
}

// Singleton
let solanaPayClient: SolanaPayClient | null = null;

export function getSolanaPayClient(config?: Partial<SolanaPayConfig>): SolanaPayClient {
  if (!solanaPayClient) {
    solanaPayClient = new SolanaPayClient(config);
  }
  return solanaPayClient;
}

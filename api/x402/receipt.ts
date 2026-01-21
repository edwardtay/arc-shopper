// EIP-712 Payment Receipts - Cryptographic proof of delivery
import { ethers } from 'ethers';
import crypto from 'crypto';

// Merchant wallet for signing receipts
const MERCHANT_SECRET = process.env.WALLET_SECRET || 'arcshopper-merchant-secret-2024';
const merchantWallet = new ethers.Wallet(
  '0x' + crypto.createHash('sha256').update(MERCHANT_SECRET + ':merchant').digest('hex')
);

// EIP-712 Domain
const DOMAIN = {
  name: 'ArcShopper x402',
  version: '1.0',
  chainId: 5042002,
  verifyingContract: '0x0000000000000000000000000000000000000402',
};

// EIP-712 Types
const RECEIPT_TYPES = {
  PaymentReceipt: [
    { name: 'paymentTxHash', type: 'bytes32' },
    { name: 'productId', type: 'string' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'buyer', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

export interface PaymentReceipt {
  paymentTxHash: string;
  productId: string;
  contentHash: string;
  amount: string;
  buyer: string;
  timestamp: number;
  nonce: number;
  signature: string;
  merchant: string;
}

// Generate content hash from delivered content
export function hashContent(content: any): string {
  const contentStr = JSON.stringify(content, Object.keys(content).sort());
  return '0x' + crypto.createHash('sha256').update(contentStr).digest('hex');
}

// Sign a payment receipt using EIP-712
export async function signReceipt(
  paymentTxHash: string,
  productId: string,
  content: any,
  amount: string,
  buyer: string
): Promise<PaymentReceipt> {
  const contentHash = hashContent(content);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 1000000);

  // Convert amount to wei (6 decimals for USDC)
  const amountWei = ethers.parseUnits(amount, 6);

  const message = {
    paymentTxHash: ethers.zeroPadValue(paymentTxHash, 32),
    productId,
    contentHash,
    amount: amountWei,
    buyer,
    timestamp,
    nonce,
  };

  const signature = await merchantWallet.signTypedData(DOMAIN, RECEIPT_TYPES, message);

  return {
    paymentTxHash,
    productId,
    contentHash,
    amount,
    buyer,
    timestamp,
    nonce,
    signature,
    merchant: merchantWallet.address,
  };
}

// Verify a receipt signature
export function verifyReceipt(receipt: PaymentReceipt): boolean {
  try {
    const amountWei = ethers.parseUnits(receipt.amount, 6);

    const message = {
      paymentTxHash: ethers.zeroPadValue(receipt.paymentTxHash, 32),
      productId: receipt.productId,
      contentHash: receipt.contentHash,
      amount: amountWei,
      buyer: receipt.buyer,
      timestamp: receipt.timestamp,
      nonce: receipt.nonce,
    };

    const recoveredAddress = ethers.verifyTypedData(DOMAIN, RECEIPT_TYPES, message, receipt.signature);
    return recoveredAddress.toLowerCase() === receipt.merchant.toLowerCase();
  } catch {
    return false;
  }
}

// API endpoint to verify receipts
export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    // Verify a receipt
    const { receipt } = req.body;
    if (!receipt) {
      return res.status(400).json({ error: 'Receipt required' });
    }

    const isValid = verifyReceipt(receipt);
    return res.json({
      valid: isValid,
      merchant: merchantWallet.address,
      domain: DOMAIN,
    });
  }

  // GET - return merchant info
  res.json({
    merchant: merchantWallet.address,
    domain: DOMAIN,
    types: RECEIPT_TYPES,
  });
}

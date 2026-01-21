# ArcShopper

**Trustless AI Shopping Agent** - Buy gated digital content with real USDC payments via x402 protocol on Arc testnet.

🔗 **Live Demo:** https://arc-agentic.vercel.app

## What It Does

ArcShopper demonstrates the x402 HTTP Payment Protocol for gated digital content:

1. **User requests content** → GET /api/x402/products
2. **Server returns HTTP 402** → Payment Required with amount, recipient, token
3. **User pays USDC on-chain** → Real transfer on Arc testnet
4. **User retries with proof** → X-Payment-TxHash header
5. **Server verifies & delivers** → Content unlocked!

## Digital Products (Real Gated Content)

| Product | Price | What You Get |
|---------|-------|--------------|
| **API Key** | $0.50 | 30-day API access key |
| **Security Report** | $1.00 | DeFi audit report + download |
| **Code Template** | $2.00 | x402 integration kit |
| **AI Credits** | $1.50 | 100 image generation credits |
| **Solidity Course** | $1.00 | 10 video modules + certificate |

Each product generates **unique access tokens/keys** based on the payment transaction hash.

## Technical Architecture

### Stack
- **Frontend:** Vanilla HTML/JS (single page)
- **Backend:** Vercel Serverless Functions (TypeScript)
- **Blockchain:** Arc Testnet (Chain ID: 5042002)
- **Token:** USDC at `0x3600000000000000000000000000000000000000`
- **Protocol:** x402 (HTTP 402 Payment Required)

### x402 Flow (Visible in Network Tab!)

```
┌─────────┐     GET /product      ┌──────────┐
│  User   │ ──────────────────────▶│ Merchant │
│ Browser │ ◀────────────────────── │  Server  │
└────┬────┘    HTTP 402 + Headers  └────┬─────┘
     │                                   │
     │  X-Payment-Amount: 1.00           │
     │  X-Payment-Address: 0xdead...     │
     │  X-Payment-Network: arc-testnet   │
     │                                   │
     ▼                                   │
┌─────────┐   USDC.transfer()     ┌──────────┐
│   Arc   │ ◀─────────────────────│  User    │
│ Testnet │                       │  Wallet  │
└────┬────┘                       └────┬─────┘
     │                                 │
     │  txHash: 0xabc123...            │
     ▼                                 ▼
┌─────────┐  GET + X-Payment-TxHash  ┌──────────┐
│  User   │ ─────────────────────────▶│ Merchant │
│ Browser │ ◀───────────────────────── │  Server  │
└─────────┘    HTTP 200 + Content    └──────────┘
```

### Key Files

```
api/
├── x402/products.ts    # x402 merchant endpoint (402 → verify → 200)
├── shop/pay.ts         # Execute USDC transfer
├── arc-wallet.ts       # Deterministic wallet derivation
public/
└── index.html          # Single-page app with x402 client
```

### Wallet System

Users sign in with email. Wallets are **deterministically derived** server-side:

```typescript
const seed = sha256(email + SERVER_SECRET);
const wallet = new ethers.Wallet('0x' + seed, arcProvider);
```

This enables:
- No seed phrase management for users
- Consistent wallet per email
- Server can sign transactions on behalf of user

## No Facilitator (Direct x402)

This implementation uses **direct x402** without a facilitator:

```
User ──── USDC ────▶ Merchant
     ◀─── Content ──
```

**Pros:** Simple, no middleman, lower fees
**Cons:** User must trust merchant, no dispute resolution

### How a Facilitator Would Improve x402

A facilitator (like Coinbase's x402 implementation) adds:

```
User ── USDC ──▶ Facilitator ── USDC ──▶ Merchant
     ◀─ Signed ─┘            ◀─ Content ─┘
       Receipt
```

**Benefits:**
1. **Escrow** - Hold funds until content delivered
2. **Dispute Resolution** - Refunds if merchant doesn't deliver
3. **Payment Attestations** - Cryptographic proof of payment
4. **Multi-chain** - Facilitator handles cross-chain payments
5. **Subscriptions** - Recurring payment management
6. **Analytics** - Payment tracking dashboard

## Potential Improvements

### For This Demo
- [ ] Add payment receipt signatures (EIP-712)
- [ ] Implement content hash verification
- [ ] Add subscription support for courses
- [ ] Stream payments for API usage metering
- [ ] Add refund mechanism

### For x402 Protocol
- [ ] Standardize facilitator interface
- [ ] Define payment attestation format
- [ ] Add support for payment channels
- [ ] Define dispute resolution flow
- [ ] Multi-currency support (not just USDC)

## Quick Start

```bash
# Clone
git clone https://github.com/edwardtay/arc-shopper
cd arc-shopper

# Install
npm install

# Deploy to Vercel
npx vercel

# Or run locally
npm run dev
```

### Environment Variables

```env
WALLET_SECRET=your-secret-for-wallet-derivation
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/x402/products?id=X` | GET | Get product (returns 402 or 200) |
| `/api/shop/pay` | POST | Execute USDC payment |
| `/api/arc-wallet` | POST | Get/create wallet for user |
| `/api/products` | GET | List all products |

### x402 Headers

**Request (after payment):**
```
X-Payment-TxHash: 0x123abc...
```

**Response (402):**
```
X-Payment-Required: true
X-Payment-Amount: 1.00
X-Payment-Currency: USDC
X-Payment-Network: arc-testnet
X-Payment-ChainId: 5042002
X-Payment-Address: 0x000...dEaD
X-Payment-Token: 0x360...000
X-402-Version: 1.0
```

## Links

- [Live Demo](https://arc-agentic.vercel.app)
- [GitHub Repo](https://github.com/edwardtay/arc-shopper)
- [Arc Testnet Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com) - Get testnet USDC
- [x402 Protocol](https://www.x402.org)
- [Coinbase x402](https://github.com/coinbase/x402)

## Hackathon: Best Trustless AI Agent

| Criteria | Implementation |
|----------|---------------|
| **Identity** | Deterministic wallets from email |
| **Payments** | Real USDC on Arc testnet |
| **Protocol** | x402 (HTTP 402 Payment Required) |
| **Gating** | Content unlocked after payment verification |
| **Verification** | On-chain transaction receipt check |

## License

MIT

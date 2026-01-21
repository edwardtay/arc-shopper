# ArcShopper

**Autonomous Commerce Agent with x402 HTTP Payment Protocol**

ArcShopper demonstrates machine-to-machine payments using the x402 protocol—an extension of HTTP that enables programmatic, cryptographically-signed payment authorization without human intervention at transaction time. An AI agent autonomously discovers, evaluates, and purchases digital content while a policy engine enforces spending constraints.

## Core Concept

Traditional web payments require user interaction at checkout. x402 eliminates this friction by embedding payment authorization directly into HTTP request/response cycles. When a resource returns `402 Payment Required`, the client can automatically construct a signed payment payload, submit it for settlement, and retry the request—all without user intervention.

This project implements that flow end-to-end: from wallet provisioning to EIP-712 signature generation to on-chain settlement to gated content delivery.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  User (Email Auth)                                                          │
│       │                                                                      │
│       ▼                                                                      │
│  Wallet Provisioning ────────────────────────────────────────────────────┐  │
│       │                                                                   │  │
│       ├── Circle Developer-Controlled Wallet (primary)                   │  │
│       │       └── Custodial wallet via Circle API                        │  │
│       │       └── Encrypted key storage                                  │  │
│       │                                                                   │  │
│       └── Local Deterministic Wallet (fallback)                          │  │
│               └── keccak256(email) → private key derivation              │  │
│               └── Zero external dependencies                             │  │
│                                                                           │  │
└───────────────────────────────────────────────────────────────────────────┘  │
                                                                               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Shopping Agent (LLM-powered)                                               │
│       │                                                                      │
│       ├── Natural language query parsing                                    │
│       ├── Product catalog search & matching                                 │
│       └── Purchase intent extraction                                        │
│               │                                                              │
│               ▼                                                              │
│  Policy Engine ──────────────────────────────────────────────────────────┐  │
│       │                                                                   │  │
│       ├── Per-transaction limits ($10 max default)                       │  │
│       ├── Daily spending caps                                            │  │
│       ├── Category restrictions                                          │  │
│       └── Approval/rejection with audit trail                            │  │
│                                                                           │  │
└───────────────────────────────────────────────────────────────────────────┘  │
                                                                               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PAYMENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  x402 Client                                                                │
│       │                                                                      │
│       ├── Constructs payment payload:                                       │
│       │       {                                                              │
│       │         version: "2",                                               │
│       │         scheme: "exact",                                            │
│       │         networkId: "eip155:5042002",                                │
│       │         asset: "0x...",                                             │
│       │         amount: "990000",  // 6 decimals                            │
│       │         recipient: "0x...",                                         │
│       │         nonce: "0x...",    // 32-byte random                        │
│       │         expiry: 1234567890                                          │
│       │       }                                                              │
│       │                                                                      │
│       └── Signs with EIP-712 typed data                                     │
│               │                                                              │
│               ▼                                                              │
│  Local Facilitator                                                          │
│       │                                                                      │
│       ├── POST /api/x402/v2/verify                                          │
│       │       └── Recovers signer from EIP-712 signature                    │
│       │       └── Validates network, expiry, nonce                          │
│       │                                                                      │
│       └── POST /api/x402/v2/settle                                          │
│               └── Executes on-chain transfer                                │
│               └── Returns txHash for verification                           │
│               └── Idempotent (nonce-based dedup)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BLOCKCHAIN LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Arc Testnet (Chain ID: 5042002)                                            │
│       │                                                                      │
│       ├── EVM-compatible execution                                          │
│       ├── Native token for gas + payments                                   │
│       └── Block explorer: testnet.arcscan.app                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## x402 Protocol Implementation

### EIP-712 Typed Data Structure

The x402 payment signature uses EIP-712 for structured, human-readable signing. The domain separator binds the signature to a specific chain and contract:

```typescript
const domain = {
  name: 'x402',
  version: '2',
  chainId: 5042002,
  verifyingContract: assetAddress
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
    { name: 'expiry', type: 'uint256' }
  ]
};
```

### Payment Flow

1. **Resource Request**: Client requests gated content
2. **402 Response**: Server returns payment requirements in `X-402-*` headers
3. **Signature Generation**: Client constructs payment payload, signs with user's private key
4. **Facilitator Verification**: Signature verified via `ecrecover`, expiry/network validated
5. **On-Chain Settlement**: Facilitator executes transfer, returns txHash
6. **Content Delivery**: Original request retried with payment proof, content delivered

### Facilitator Architecture

The facilitator is a trusted intermediary that:

- **Verifies** EIP-712 signatures without requiring on-chain calls
- **Settles** payments by executing the actual token transfer
- **Deduplicates** via nonce tracking (prevents replay attacks)
- **Abstracts** blockchain complexity from content servers

In production, facilitators would be operated by payment processors (Coinbase, etc.). This implementation includes a local facilitator for demonstration.

## Digital Product Catalog

| Product | Price | Endpoint | Content Type |
|---------|-------|----------|--------------|
| Crypto API Access | $0.99 | `/api/gated/crypto-api` | Live price feed (BTC, ETH, SOL, ARC) |
| Premium Image | $0.50 | `/api/gated/premium-image` | SVG network visualization |
| Trend Report | $1.99 | `/api/gated/trend-report` | AI-generated market analysis |
| Arc Crash Course | $2.99 | `/api/gated/course` | 5-module development curriculum |

Each endpoint validates the x402 payment header before serving content. Invalid or expired payments return `402 Payment Required` with fresh payment parameters.

## Wallet Architecture

### Circle Developer-Controlled Wallets (Primary)

Circle's custodial wallet infrastructure provides:
- Email-based wallet provisioning (no seed phrases)
- Server-side key management with HSM backing
- Programmatic transaction signing via API
- Wallet-set isolation per application

### Local Deterministic Wallets (Fallback)

When Circle API is unavailable, the system derives wallets deterministically:

```typescript
const hash = keccak256(toUtf8Bytes(email.toLowerCase()));
const privateKey = hash; // 32 bytes
const wallet = new Wallet(privateKey);
```

This provides:
- Zero external dependencies
- Consistent address across sessions
- Immediate availability

**Security Note**: Deterministic derivation from email is suitable for testnet demonstration only. Production systems should use proper key management.

## API Reference

### Wallet Management

```
POST /api/circle/wallet
Body: { email: string }
Response: { address: string, walletId?: string }
```

Creates or retrieves wallet for email. Falls back to local derivation if Circle unavailable.

```
GET /api/balance/:address
Response: { native: string, formatted: string }
```

Queries Arc testnet balance directly via RPC.

### Commerce

```
POST /api/x402/buy
Body: { query: string, userId?: string }
Response: {
  success: boolean,
  product?: string,
  txHash?: string,
  content?: any
}
```

Executes autonomous purchase. When `userId` provided, payment originates from user's wallet rather than orchestrator.

```
GET /api/shop/products
Response: { products: Product[] }
```

Lists available digital products with prices and descriptions.

### x402 Facilitator

```
POST /api/x402/v2/verify
Body: { signature, paymentDetails, signer }
Response: { valid, signerVerified, networkMatch, notExpired }
```

Verifies payment signature without settlement.

```
POST /api/x402/v2/settle
Body: { signature, paymentDetails, signer, execute: true }
Response: { success, txHash, blockNumber, settlementType }
```

Verifies and executes on-chain settlement.

### Gated Content

```
GET /api/gated/:product
Headers: X-402-Payment: <base64-encoded-payment>
Response: Product content or 402 with payment requirements
```

## Environment Configuration

```env
# Arc Testnet RPC
ARC_RPC_URL=https://rpc.testnet.arc.network

# Circle Developer-Controlled Wallets
CIRCLE_API_KEY=your_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
CIRCLE_WALLET_SET_ID=your_wallet_set_id

# Orchestrator (agent's payment wallet)
ORCHESTRATOR_PRIVATE_KEY=0x...

# LLM for agent reasoning (optional, defaults to Groq)
GROQ_API_KEY=your_groq_key
```

## Running Locally

```bash
npm install
npm run dev
# Server: http://localhost:3001
```

## Technical Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Server | Express.js |
| Blockchain | ethers.js v6 |
| Wallets | Circle Web3 Services SDK |
| LLM | Groq (llama-3.3-70b) |
| Signatures | EIP-712 via ethers |

## Network Details

- **Chain**: Arc Testnet
- **Chain ID**: 5042002
- **RPC**: `https://rpc.testnet.arc.network`
- **Explorer**: [testnet.arcscan.app](https://testnet.arcscan.app)
- **Faucet**: [faucet.circle.com](https://faucet.circle.com)

## References

- [x402 Protocol Specification](https://www.x402.org)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Circle Developer-Controlled Wallets](https://developers.circle.com/w3s/developer-controlled-wallets-quickstart)

## License

MIT

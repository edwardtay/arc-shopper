# ArcShopper

**Autonomous Commerce Agent with x402 HTTP Payment Protocol**

ArcShopper demonstrates machine-to-machine payments using the x402 protocol - an extension of HTTP that enables programmatic, cryptographically-signed payment authorization without human intervention at transaction time. An AI agent autonomously discovers, evaluates, and purchases digital content while a policy engine enforces spending constraints.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [x402 Protocol Implementation](#x402-protocol-implementation)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Digital Product Catalog](#digital-product-catalog)
- [Wallet Architecture](#wallet-architecture)
- [Policy Engine](#policy-engine)
- [Configuration](#configuration)
- [Tech Stack](#tech-stack)
- [Network Details](#network-details)
- [References](#references)

## Overview

Traditional web payments require user interaction at checkout. x402 eliminates this friction by embedding payment authorization directly into HTTP request/response cycles. When a resource returns `402 Payment Required`, the client can automatically construct a signed payment payload, submit it for settlement, and retry the request - all without user intervention.

This project implements that flow end-to-end: from wallet provisioning to EIP-712 signature generation to on-chain settlement to gated content delivery.

## Key Features

| Feature | Description |
|---------|-------------|
| **x402 Payment Protocol** | EIP-712 cryptographic signatures for trustless machine-to-machine payments |
| **Autonomous Shopping Agent** | LLM-powered agent that parses queries, searches products, and executes purchases |
| **Policy-Governed Spending** | Multi-tier spending limits (daily, weekly, monthly) with approval thresholds |
| **Gated Content Delivery** | Digital products delivered only after payment verification |
| **Multi-Wallet Support** | Circle Developer-Controlled Wallets with local fallback |
| **On-Chain Settlement** | Real payments on Arc testnet via x402 facilitator |
| **Audit Trail** | Complete logging of all decisions and transactions |

## System Architecture

```
+-----------------------------------------------------------------------------+
|                              CLIENT LAYER                                    |
+-----------------------------------------------------------------------------+
|  User (Email Auth)                                                          |
|       |                                                                      |
|       v                                                                      |
|  Wallet Provisioning                                                        |
|       |                                                                      |
|       +-- Circle Developer-Controlled Wallet (primary)                      |
|       |       +-- Custodial wallet via Circle API                           |
|       |       +-- Encrypted key storage                                     |
|       |                                                                      |
|       +-- Local Deterministic Wallet (fallback)                             |
|               +-- keccak256(email) -> private key derivation                |
|               +-- Zero external dependencies                                |
|                                                                              |
+-----------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------+
|                              AGENT LAYER                                     |
+-----------------------------------------------------------------------------+
|                                                                              |
|  Trustless Agent (src/agent/core.ts)                                        |
|       |                                                                      |
|       +-- Natural language query processing                                 |
|       +-- Intent classification (market_data, search, analysis, etc.)       |
|       +-- Action planning and execution                                     |
|               |                                                              |
|               v                                                              |
|  Shopping Agent (src/commerce/shopping-agent.ts)                            |
|       |                                                                      |
|       +-- Product catalog search & matching                                 |
|       +-- Price comparison and selection                                    |
|       +-- Purchase intent extraction                                        |
|               |                                                              |
|               v                                                              |
|  Policy Engine (src/policy/engine.ts)                                       |
|       |                                                                      |
|       +-- Per-transaction limits ($10 max default)                          |
|       +-- Daily/weekly/monthly spending caps                                |
|       +-- Domain whitelisting and rate limits                               |
|       +-- Emergency stop mechanism                                          |
|                                                                              |
+-----------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------+
|                              PAYMENT LAYER                                   |
+-----------------------------------------------------------------------------+
|                                                                              |
|  x402 Client (src/payments/x402.ts)                                         |
|       |                                                                      |
|       +-- Constructs EIP-712 typed payment payloads                         |
|       +-- Signs with wallet private key                                     |
|               |                                                              |
|               v                                                              |
|  Local Facilitator (src/facilitator/index.ts)                               |
|       |                                                                      |
|       +-- POST /api/x402/v2/verify                                          |
|       |       +-- Recovers signer from EIP-712 signature                    |
|       |       +-- Validates network, expiry, nonce                          |
|       |                                                                      |
|       +-- POST /api/x402/v2/settle                                          |
|               +-- Executes on-chain transfer                                |
|               +-- Returns txHash for verification                           |
|               +-- Idempotent (nonce-based deduplication)                    |
|                                                                              |
+-----------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------+
|                              BLOCKCHAIN LAYER                                |
+-----------------------------------------------------------------------------+
|                                                                              |
|  Arc Testnet (Chain ID: 5042002)                                            |
|       |                                                                      |
|       +-- EVM-compatible execution                                          |
|       +-- Native token for gas + payments                                   |
|       +-- Block explorer: testnet.arcscan.app                               |
|                                                                              |
+-----------------------------------------------------------------------------+
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

```
1. Resource Request     Client requests gated content
         |
         v
2. 402 Response         Server returns payment requirements in X-402-* headers
         |
         v
3. Signature Gen        Client constructs payment payload, signs with EIP-712
         |
         v
4. Verify               Facilitator verifies signature via ecrecover
         |
         v
5. Settle               Facilitator executes on-chain transfer, returns txHash
         |
         v
6. Content Delivery     Original request retried with payment proof
```

### Facilitator Architecture

The facilitator is a trusted intermediary that:

- **Verifies** EIP-712 signatures without requiring on-chain calls
- **Settles** payments by executing the actual token transfer
- **Deduplicates** via nonce tracking (prevents replay attacks)
- **Abstracts** blockchain complexity from content servers

In production, facilitators would be operated by payment processors (Coinbase, etc.). This implementation includes a local facilitator for demonstration.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Private key for Arc testnet (for orchestrator wallet)

### Installation

```bash
# Clone the repository
git clone https://github.com/edwardtay/arc-shopper.git
cd arc-shopper

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

### Environment Setup

Create a `.env` file with the following variables:

```env
# Required
ORCHESTRATOR_PRIVATE_KEY=0x...your_private_key...

# Arc Testnet RPC
ARC_RPC_URL=https://rpc.testnet.arc.network

# LLM (at least one required for agent reasoning)
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...

# Optional - Circle Developer-Controlled Wallets
CIRCLE_API_KEY=your_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
CIRCLE_WALLET_SET_ID=your_wallet_set_id

# Server Configuration
PORT=3001
HOST=0.0.0.0
```

### Running the Server

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

The server will be available at `http://localhost:3001`

### Quick Test

```bash
# Check health
curl http://localhost:3001/api/health

# List products
curl http://localhost:3001/api/shop/products

# Autonomous shopping (requires funded wallet)
curl -X POST http://localhost:3001/api/x402/buy \
  -H "Content-Type: application/json" \
  -d '{"query": "I want a crypto course"}'
```

## API Reference

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Blockchain status with live block number |
| `/api/status` | GET | Agent state, treasury, policy status |
| `/api/identity` | GET | Agent identity information |
| `/api/agent/llm` | GET | LLM provider and model info |

### Wallet Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/circle/wallet` | POST | Create/get wallet for user |
| `/api/balance/:address` | GET | Query Arc testnet balance |
| `/api/circle/transfer` | POST | Execute token transfer |
| `/api/circle/balance/:walletId` | GET | Get wallet balance via Circle |

**POST /api/circle/wallet**
```json
// Request
{ "userId": "user@example.com" }

// Response
{
  "success": true,
  "isNew": false,
  "walletId": "abc123",
  "walletAddress": "0x...",
  "balance": { "native": "1.5", "usdc": "10.0" }
}
```

### Agent Processing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/query` | POST | Main reasoning endpoint |
| `/api/agent/thinking` | GET | Access agent memory and reasoning |
| `/api/agent/register` | POST | Register user and get agent wallet |
| `/api/agent/status/:userAddress` | GET | Get user's agent status |

**POST /api/query**
```json
// Request
{ "query": "What is the current Bitcoin price?", "context": {} }

// Response
{
  "success": true,
  "query": "...",
  "intent": "crypto_analysis",
  "thinking": [...],
  "actions": [...],
  "payments": [...],
  "totalCost": "$0.03",
  "duration": 1234
}
```

### Commerce (x402 Gated Products)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shop/products` | GET | List all digital products |
| `/api/shop/search` | GET | Search with filters |
| `/api/shop/categories` | GET | Get product categories |
| `/api/x402/buy` | POST | Autonomous shopping (find + purchase) |
| `/api/shop/orders` | GET | Get order history |
| `/api/shop/orders/:orderId` | GET | Get specific order |

**POST /api/x402/buy**
```json
// Request
{ "query": "I want a crypto course under $3", "userId": "user@email.com" }

// Response
{
  "success": true,
  "message": "Successfully purchased Arc Blockchain Course",
  "thinking": [...],
  "selectedProduct": {...},
  "order": {
    "id": "order_xyz",
    "totalAmount": "$2.99",
    "paymentStatus": "confirmed",
    "paymentMethod": "x402",
    "txHash": "0x..."
  },
  "duration": 2500
}
```

### x402 Facilitator

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/x402/info` | GET | Facilitator info (version, networks) |
| `/api/x402/v2/verify` | POST | Verify payment signature |
| `/api/x402/v2/settle` | POST | Verify + execute settlement |
| `/api/x402/settlement/:nonce` | GET | Get settlement status |

**POST /api/x402/v2/verify**
```json
// Request
{
  "signature": "0x...",
  "paymentDetails": {
    "version": "2",
    "scheme": "exact",
    "networkId": "eip155:5042002",
    "asset": "0x...",
    "amount": "990000",
    "recipient": "0x...",
    "nonce": "0x...",
    "expiry": 1234567890
  },
  "signer": "0x..."
}

// Response
{
  "valid": true,
  "signerVerified": true,
  "networkMatch": true,
  "notExpired": true
}
```

### Gated Content Endpoints

| Endpoint | Method | Price | Content Type |
|----------|--------|-------|--------------|
| `/api/gated/crypto-prices` | GET | $0.99 | Live CoinGecko data |
| `/api/gated/premium-image` | GET | $0.50 | SVG blockchain visualization |
| `/api/gated/trend-report` | GET | $1.99 | AI-generated market analysis |
| `/api/gated/arc-course` | GET | $2.99 | 5-module blockchain curriculum |

### Policy & Treasury

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/policy` | GET | Get current spending policy |
| `/api/policy/emergency-stop` | POST | Activate/deactivate emergency stop |
| `/api/treasury` | GET | Treasury status with pending approvals |
| `/api/treasury/approve/:approvalId` | POST | Approve pending request |
| `/api/audit` | GET | Audit trail of all decisions |
| `/api/payments` | GET | Payment history |

### Multi-Source Aggregator

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aggregate/search` | GET | Search across all commerce sources |
| `/api/aggregate/products` | GET | Get products from all sources |
| `/api/aggregate/compare` | GET | Price comparison across sources |
| `/api/aggregate/smart-buy` | POST | Find best deal and purchase |
| `/api/aggregate/sources` | GET | List available commerce sources |

### Additional Payment Integrations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/solana-pay/create` | POST | Create Solana Pay payment request |
| `/api/solana-pay/status/:paymentId` | GET | Check Solana Pay payment status |
| `/api/crossmint/collections` | GET | List NFT collections |
| `/api/crossmint/mint` | POST | Mint NFT |
| `/api/helio/paylink` | POST | Create Helio payment link |

## Digital Product Catalog

| Product | Price | Endpoint | Description |
|---------|-------|----------|-------------|
| CoinGecko API Access | $0.99 | `/api/gated/crypto-prices` | Real-time crypto prices (BTC, ETH, SOL, ARC) |
| Premium Stock Image | $0.50 | `/api/gated/premium-image` | High-resolution blockchain visualization SVG |
| Crypto Trend Report | $1.99 | `/api/gated/trend-report` | AI-generated market analysis with predictions |
| Arc Blockchain Course | $2.99 | `/api/gated/arc-course` | 5-module crash course curriculum |

Each endpoint validates the x402 payment before serving content. Invalid or expired payments return `402 Payment Required` with fresh payment parameters.

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

## Policy Engine

The policy engine (`src/policy/engine.ts`) enforces spending constraints:

### Spending Limits

| Limit | Default Value |
|-------|---------------|
| Max Single Payment | $10.00 |
| Daily Limit | $100.00 |
| Weekly Limit | $500.00 |
| Monthly Limit | $1,000.00 |
| Approval Threshold | $25.00 |

### Features

- **Action Permissions**: Whitelist specific actions (search, fetch_data, analyze, pay, purchase)
- **Domain Restrictions**: Rate limiting per domain with cost caps
- **Time Restrictions**: Optional hour/day-of-week constraints
- **Emergency Stop**: Instant halt of all agent actions
- **Audit Trail**: Complete logging of policy decisions

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ORCHESTRATOR_PRIVATE_KEY` | Yes | Private key for agent wallet |
| `ARC_RPC_URL` | No | Arc testnet RPC (default: rpc.testnet.arc.network) |
| `GROQ_API_KEY` | Recommended | Groq API for fast LLM inference |
| `OPENAI_API_KEY` | Optional | OpenAI fallback for LLM |
| `CIRCLE_API_KEY` | Optional | Circle Developer-Controlled Wallets |
| `PORT` | No | Server port (default: 3000) |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Server | Express.js v5 |
| Blockchain | ethers.js v6 |
| Wallets | Circle Web3 Services SDK |
| LLM | Groq (llama-3.3-70b) / OpenAI |
| Signatures | EIP-712 via ethers |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |

## Network Details

| Property | Value |
|----------|-------|
| Chain | Arc Testnet |
| Chain ID | 5042002 |
| CAIP-2 | eip155:5042002 |
| RPC | https://rpc.testnet.arc.network |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |

## Project Structure

```
src/
+-- index.ts                 # Application entry point
+-- server/
|   +-- index.ts             # Express server with all endpoints
+-- agent/
|   +-- core.ts              # TrustlessAgent class with LLM reasoning
|   +-- types.ts             # Agent interfaces
|   +-- user-agents.ts       # Per-user agent management
+-- commerce/
|   +-- shopping-agent.ts    # Autonomous shopping logic
|   +-- marketplace.ts       # Product catalog
|   +-- types.ts             # Commerce interfaces
|   +-- aggregator.ts        # Multi-source product aggregation
|   +-- *.ts                 # Payment integrations (Circle, Stripe, etc.)
+-- payments/
|   +-- x402.ts              # x402 V2 payment client
+-- facilitator/
|   +-- index.ts             # Local x402 facilitator
+-- policy/
|   +-- engine.ts            # Policy enforcement
|   +-- types.ts             # Policy interfaces
+-- treasury/
|   +-- manager.ts           # Multi-tier wallet management
+-- wallet/
|   +-- index.ts             # Wallet utilities
|   +-- circle-wallets.ts    # Circle API integration
+-- audit/
|   +-- logger.ts            # Audit logging
+-- faucet/
|   +-- index.ts             # Testnet funding utilities
+-- config/
    +-- index.ts             # Environment configuration

public/
+-- index.html               # Dashboard UI
+-- store.html               # E-commerce store UI
```

## References

- [x402 Protocol Specification](https://www.x402.org)
- [EIP-712: Typed Structured Data Hashing and Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Circle Developer-Controlled Wallets](https://developers.circle.com/w3s/developer-controlled-wallets-quickstart)
- [Arc Blockchain Documentation](https://docs.arc.network)

## License

MIT

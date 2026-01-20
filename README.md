# Arc Agentic Commerce

Trustless AI Agent for autonomous shopping with on-chain USDC payments.

## Demo

**User Interface:** Simple shopping experience - just tell the agent what you want.

**Behind the scenes:**
- AI agent (Groq llama-3.3-70b) understands your request
- Searches marketplace for best options
- Checks guardrails (spending limits, policies)
- Executes real on-chain payment via x402 protocol

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Add your API keys

# Run
npm run dev
```

Visit http://localhost:3001

## Technical Architecture

### Stack
- TypeScript, Express, ethers.js
- Groq LLM (llama-3.3-70b-versatile)
- Arc Testnet (Chain ID: 5042002)
- x402 V2 Protocol with EIP-712 signatures

### Key Components

**Agent Identity** (`src/agent/core.ts`)
- On-chain wallet address
- Policy-bound spending limits
- Real LLM reasoning

**Guardrails** (`src/policy/engine.ts`)
- Max transaction: $10
- Daily limit: $100
- Category restrictions
- Merchant verification

**Treasury** (`src/treasury/manager.ts`)
- Hot/Warm/Cold wallet tiers
- Spending history tracking
- Balance management

**x402 Payments** (`src/payments/x402.ts`)
- EIP-712 typed data signatures
- CAIP-2 network identifiers
- Direct on-chain settlement

### Hackathon Criteria

**Best Trustless AI Agent:**
- ✅ Identity: On-chain agent wallet
- ✅ Policies: Spending limits, categories
- ✅ Guardrails: Real-time policy checks
- ✅ Treasury: USDC balance management

## API Endpoints

```
GET  /api/health          - Server status
GET  /api/status          - Agent status
GET  /api/faucet/status   - Wallet balance
POST /api/shop/buy        - Execute purchase
GET  /api/shop/orders     - Order history
GET  /api/aggregate/products - List products
```

## Environment Variables

```
ORCHESTRATOR_PRIVATE_KEY=0x...  # Agent wallet
GROQ_API_KEY=gsk_...            # LLM
ARC_RPC_URL=https://rpc.testnet.arc.network
```

## Links

- [Arc Testnet Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com) - Get testnet USDC
- [x402 Protocol](https://www.x402.org)

## License

MIT

# Contributing to ArcShopper

Thank you for your interest in contributing to ArcShopper! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Adding New Features](#adding-new-features)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- A code editor (VS Code recommended)
- Access to Arc testnet (for testing payments)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/arc-shopper.git
cd arc-shopper
```

3. Add upstream remote:

```bash
git remote add upstream https://github.com/edwardtay/arc-shopper.git
```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Environment Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Required for agent operations
ORCHESTRATOR_PRIVATE_KEY=0x...

# At least one LLM provider
GROQ_API_KEY=gsk_...    # Recommended - faster inference
OPENAI_API_KEY=sk-...   # Optional fallback
```

### Getting Testnet Tokens

1. Visit [faucet.circle.com](https://faucet.circle.com)
2. Request Arc testnet tokens for your orchestrator address
3. Verify balance at [testnet.arcscan.app](https://testnet.arcscan.app)

### Running the Development Server

```bash
npm run dev
```

The server runs at `http://localhost:3001` (or the port specified in `.env`).

## Project Architecture

```
src/
+-- index.ts              # Entry point
+-- server/index.ts       # Express API server
+-- agent/                # AI agent logic
|   +-- core.ts           # TrustlessAgent class
|   +-- types.ts          # Type definitions
|   +-- user-agents.ts    # Per-user agent management
+-- commerce/             # E-commerce functionality
|   +-- shopping-agent.ts # Autonomous shopping
|   +-- marketplace.ts    # Product catalog
|   +-- aggregator.ts     # Multi-source aggregation
+-- payments/x402.ts      # x402 protocol client
+-- facilitator/index.ts  # x402 facilitator
+-- policy/engine.ts      # Spending policy engine
+-- treasury/manager.ts   # Wallet management
+-- config/index.ts       # Configuration
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Trustless Agent | `src/agent/core.ts` | LLM-powered reasoning and action execution |
| Shopping Agent | `src/commerce/shopping-agent.ts` | Product search and purchase automation |
| x402 Client | `src/payments/x402.ts` | EIP-712 signature generation |
| Facilitator | `src/facilitator/index.ts` | Payment verification and settlement |
| Policy Engine | `src/policy/engine.ts` | Spending limits and constraints |
| Treasury | `src/treasury/manager.ts` | Multi-tier wallet management |

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Define explicit types for function parameters and return values
- Use interfaces for object shapes
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// Good
interface Product {
  id: string;
  name: string;
  price: string;
}

function getProduct(id: string): Product | undefined {
  return PRODUCTS.find(p => p.id === id);
}

// Avoid
function getProduct(id) {
  return PRODUCTS.find(p => p.id === id);
}
```

### Naming Conventions

- **Files**: kebab-case (`shopping-agent.ts`)
- **Classes**: PascalCase (`TrustlessAgent`)
- **Functions**: camelCase (`searchProducts`)
- **Constants**: UPPER_SNAKE_CASE (`DEMO_PRODUCTS`)
- **Interfaces**: PascalCase with `I` prefix optional (`Product` or `IProduct`)

### File Organization

- One class per file (for main classes)
- Group related types in `types.ts` files
- Export singletons via getter functions (`getAgent()`, `getTreasury()`)

## Making Changes

### Branch Naming

Use descriptive branch names:

```
feature/add-new-payment-method
fix/x402-signature-verification
docs/update-api-reference
refactor/policy-engine-cleanup
```

### Commit Messages

Follow conventional commits format:

```
feat: add Stripe payment integration
fix: correct EIP-712 domain separator
docs: update API reference for x402 endpoints
refactor: extract common validation logic
test: add unit tests for policy engine
```

### Code Changes Checklist

- [ ] Code follows the project style guide
- [ ] New functions have proper TypeScript types
- [ ] Error handling is appropriate
- [ ] No sensitive data (keys, secrets) is hardcoded
- [ ] New endpoints are documented in README

## Testing

### Manual Testing

```bash
# Start the server
npm run dev

# Test health endpoint
curl http://localhost:3001/api/health

# Test product listing
curl http://localhost:3001/api/shop/products

# Test x402 info
curl http://localhost:3001/api/x402/info
```

### Testing Payment Flow

1. Ensure your wallet has testnet tokens
2. Create a wallet for a test user:

```bash
curl -X POST http://localhost:3001/api/circle/wallet \
  -H "Content-Type: application/json" \
  -d '{"userId": "test@example.com"}'
```

3. Execute a purchase:

```bash
curl -X POST http://localhost:3001/api/x402/buy \
  -H "Content-Type: application/json" \
  -d '{"query": "I want a crypto course"}'
```

### Verifying Transactions

Check transaction on the explorer:
- https://testnet.arcscan.app/tx/{txHash}

## Submitting a Pull Request

### Before Submitting

1. Sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

2. Build the project:

```bash
npm run build
```

3. Test your changes manually

### PR Description Template

```markdown
## Summary
Brief description of changes

## Changes Made
- Change 1
- Change 2

## Testing Done
- Tested feature X with command Y
- Verified transaction on explorer

## Screenshots (if applicable)
```

### Review Process

1. Submit PR against `main` branch
2. Address reviewer feedback
3. Squash commits if requested
4. Maintainer will merge once approved

## Adding New Features

### Adding a New API Endpoint

1. Add route in `src/server/index.ts`:

```typescript
app.get('/api/my-endpoint', async (req: Request, res: Response) => {
  try {
    const result = await someFunction();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process request' });
  }
});
```

2. Add validation if needed:

```typescript
app.post('/api/my-endpoint',
  body('field').isString().notEmpty(),
  validate,
  async (req: Request, res: Response) => {
    // ...
  }
);
```

3. Document in README API Reference section

### Adding a New Payment Method

1. Create file in `src/commerce/` (e.g., `my-payment.ts`)
2. Implement the payment client class
3. Export getter function
4. Add endpoints in server
5. Update aggregator if applicable
6. Document in README

### Adding a New Product

Edit `src/commerce/marketplace.ts`:

```typescript
export const DEMO_PRODUCTS: Product[] = [
  // Existing products...

  // Add your new product
  {
    id: 'new-product',
    name: 'New Product Name',
    description: 'Product description',
    price: '$1.99',
    currency: 'USD',
    category: 'content',
    merchant: 'Arc Digital',
    inStock: true,
    attributes: {
      source: 'x402-gated',
      type: 'content',
      endpoint: '/api/gated/new-product',
      deliveryType: 'content',
    },
  },
];
```

Then add the gated endpoint in `src/server/index.ts`.

### Extending the Policy Engine

To add new policy rules, edit `src/policy/engine.ts`:

1. Add new fields to `AgentPolicy` interface
2. Implement check logic in `checkPolicy()` method
3. Update `DEFAULT_POLICY` with sensible defaults

## Questions?

If you have questions about contributing:

1. Check existing issues and discussions
2. Open a new issue with the "question" label
3. Reach out to maintainers

Thank you for contributing to ArcShopper!

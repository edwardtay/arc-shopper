// Shopping Agent - Autonomous Commerce Capabilities

import { v4 as uuidv4 } from 'uuid';
import { getAgent } from '../agent/core';
import { PolicyEngine } from '../policy/engine';
import { getAuditLogger } from '../audit/logger';
import { 
  searchProducts, 
  findCheapestProduct, 
  findBestValueProduct,
  getProduct,
  DEMO_PRODUCTS 
} from './marketplace';
import { getOrderManager, getCoinbaseClient } from './coinbase';
import { Product, SearchCriteria, PurchaseIntent, Order } from './types';
import { ThinkingStep, PaymentResult } from '../agent/types';

export interface ShoppingDecision {
  id: string;
  query: string;
  thinking: ThinkingStep[];
  searchCriteria: SearchCriteria;
  productsFound: Product[];
  selectedProduct?: Product;
  reasoning: string;
  approved: boolean;
  requiresApproval: boolean;
  estimatedCost: string;
  policyViolations: string[];
}

export interface ShoppingResult {
  success: boolean;
  decision: ShoppingDecision;
  order?: Order;
  payment?: PaymentResult;
  message: string;
  duration: number;
}

export class ShoppingAgent {
  private policy: PolicyEngine;
  private purchaseHistory: PurchaseIntent[] = [];

  constructor(policy: PolicyEngine) {
    this.policy = policy;
  }

  // Main shopping entry point
  async shop(query: string): Promise<ShoppingResult> {
    const startTime = Date.now();
    const auditLogger = getAuditLogger();

    // Step 1: Understand the shopping request
    const decision = await this.analyzeShoppingRequest(query);

    // Log decision
    auditLogger.logDecision({
      id: decision.id,
      query,
      intent: 'shopping',
      requiredActions: ['search', 'evaluate', 'purchase'],
      estimatedCost: decision.estimatedCost,
      policyCheck: {
        allowed: decision.approved,
        violations: decision.policyViolations,
        warnings: [],
        appliedRules: [],
      },
      thinking: decision.thinking,
      approved: decision.approved,
      requiresHumanApproval: decision.requiresApproval,
    });

    // Step 2: Check if approved to proceed
    if (!decision.approved) {
      return {
        success: false,
        decision,
        message: 'Purchase not approved: ' + decision.policyViolations.join(', '),
        duration: Date.now() - startTime,
      };
    }

    // Step 3: Check if human approval needed
    if (decision.requiresApproval) {
      return {
        success: false,
        decision,
        message: 'Purchase requires human approval for ' + decision.estimatedCost,
        duration: Date.now() - startTime,
      };
    }

    // Step 4: Execute purchase
    if (!decision.selectedProduct) {
      return {
        success: false,
        decision,
        message: 'No suitable product found matching criteria',
        duration: Date.now() - startTime,
      };
    }

    try {
      const agent = getAgent();
      const orderManager = getOrderManager();

      // Use x402 protocol for real on-chain payments
      const order = await orderManager.purchase(
        decision.selectedProduct,
        agent.getIdentity().address,
        'x402'
      );

      // Record in policy spending
      this.policy.recordSpending(decision.estimatedCost);

      // Log successful execution to audit trail
      auditLogger.logExecution({
        decision: {
          id: decision.id,
          query,
          intent: 'shopping',
          requiredActions: ['search', 'evaluate', 'purchase'],
          estimatedCost: decision.estimatedCost,
          policyCheck: {
            allowed: true,
            violations: [],
            warnings: [],
            appliedRules: [],
          },
          thinking: decision.thinking,
          approved: true,
          requiresHumanApproval: false,
        },
        success: true,
        actions: [{
          action: 'purchase',
          success: true,
          data: {
            product: decision.selectedProduct.name,
            price: decision.selectedProduct.price,
            orderId: order.id,
          },
          paymentRequired: true,
          duration: Date.now() - startTime,
        }],
        payments: order.txHash ? [{
          txHash: order.txHash,
          from: agent.getIdentity().address,
          to: '0x000000000000000000000000000000000000dEaD',
          amount: decision.estimatedCost,
          service: 'x402',
          status: 'confirmed' as const,
          timestamp: Date.now(),
        }] : [],
        totalCost: decision.estimatedCost,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        decision,
        order,
        message: 'Successfully purchased ' + decision.selectedProduct.name,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Log failed execution to audit trail
      auditLogger.logError(decision.id, error instanceof Error ? error.message : 'Unknown error');

      return {
        success: false,
        decision,
        message: 'Purchase failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
        duration: Date.now() - startTime,
      };
    }
  }

  // Analyze shopping request and make decision
  private async analyzeShoppingRequest(query: string): Promise<ShoppingDecision> {
    const decisionId = uuidv4();
    const thinking: ThinkingStep[] = [];
    let stepNum = 0;

    // Step 1: Parse the query
    const criteria = this.parseShoppingQuery(query);
    thinking.push({
      step: ++stepNum,
      thought: 'Parsing shopping request',
      reasoning: 'Looking for: ' + criteria.keywords.join(', ') + 
                 (criteria.maxPrice ? ' under ' + criteria.maxPrice : ''),
      timestamp: Date.now(),
    });

    // Step 2: Search products
    const products = searchProducts(criteria);
    thinking.push({
      step: ++stepNum,
      thought: 'Searching marketplace',
      reasoning: 'Found ' + products.length + ' products matching criteria',
      timestamp: Date.now(),
    });

    // Step 3: Evaluate options
    let selectedProduct: Product | undefined;
    let reasoning = '';

    if (products.length === 0) {
      reasoning = 'No products found matching the criteria';
    } else if (products.length === 1) {
      selectedProduct = products[0];
      reasoning = 'Only one product matches: ' + selectedProduct.name + ' at ' + selectedProduct.price;
    } else {
      // Find best option
      selectedProduct = findCheapestProduct(criteria);
      reasoning = 'Selected cheapest option: ' + selectedProduct?.name + ' at ' + selectedProduct?.price + 
                  ' (compared ' + products.length + ' options)';
    }

    thinking.push({
      step: ++stepNum,
      thought: 'Evaluating options',
      reasoning,
      timestamp: Date.now(),
    });

    // Step 4: Check policy
    const estimatedCost = selectedProduct?.price || '$0.00';
    const policyCheck = this.policy.checkPolicy(
      ['pay'],
      estimatedCost,
      ['marketplace']
    );

    thinking.push({
      step: ++stepNum,
      thought: 'Checking purchase policy',
      reasoning: policyCheck.allowed 
        ? 'Purchase approved within policy limits' 
        : 'Policy violation: ' + policyCheck.violations.join(', '),
      timestamp: Date.now(),
    });

    // Step 5: Determine if approval needed
    const requiresApproval = selectedProduct 
      ? this.policy.requiresApproval(selectedProduct.price)
      : false;

    if (requiresApproval) {
      thinking.push({
        step: ++stepNum,
        thought: 'Approval check',
        reasoning: 'Amount ' + estimatedCost + ' exceeds auto-approval limit - requesting human approval',
        timestamp: Date.now(),
      });
    }

    return {
      id: decisionId,
      query,
      thinking,
      searchCriteria: criteria,
      productsFound: products,
      selectedProduct,
      reasoning,
      approved: policyCheck.allowed && !!selectedProduct,
      requiresApproval,
      estimatedCost,
      policyViolations: policyCheck.violations,
    };
  }

  // Parse natural language shopping query into search criteria
  private parseShoppingQuery(query: string): SearchCriteria {
    const lowerQuery = query.toLowerCase();
    const keywords: string[] = [];
    let maxPrice: string | undefined;
    let category: string | undefined;

    // Extract price constraints
    const priceMatch = lowerQuery.match(/under\s*\$?(\d+)/);
    if (priceMatch) {
      maxPrice = '$' + priceMatch[1] + '.00';
    }
    const budgetMatch = lowerQuery.match(/budget\s*(?:of|is)?\s*\$?(\d+)/);
    if (budgetMatch) {
      maxPrice = '$' + budgetMatch[1] + '.00';
    }

    // Extract category hints
    const categories = ['hardware', 'software', 'courses', 'api-credits', 'apparel', 'security'];
    for (const cat of categories) {
      if (lowerQuery.includes(cat)) {
        category = cat;
      }
    }

    // Extract product keywords
    const productKeywords = [
      'ledger', 'trezor', 'wallet', 'yubikey',
      'openai', 'anthropic', 'api', 'credits',
      'cursor', 'vercel', 'github', 'copilot',
      'course', 'bootcamp', 'book', 'ebook',
      'hoodie', 'shirt', 'cap', 'merch',
      'hardware', 'security',
    ];

    for (const kw of productKeywords) {
      if (lowerQuery.includes(kw)) {
        keywords.push(kw);
      }
    }

    // If no keywords found, extract from query
    if (keywords.length === 0) {
      const words = lowerQuery
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['want', 'need', 'buy', 'get', 'find', 'under', 'with'].includes(w));
      keywords.push(...words.slice(0, 3));
    }

    return {
      keywords,
      maxPrice,
      category,
      mustBeInStock: true,
    };
  }

  // List available products
  listProducts(category?: string): Product[] {
    if (category) {
      return DEMO_PRODUCTS.filter(p => p.category === category);
    }
    return DEMO_PRODUCTS;
  }

  // Get purchase history
  getPurchaseHistory(): Order[] {
    return getOrderManager().getOrders();
  }
}

// Singleton
let shoppingAgent: ShoppingAgent | null = null;

export function initShoppingAgent(policy: PolicyEngine): ShoppingAgent {
  if (!shoppingAgent) {
    shoppingAgent = new ShoppingAgent(policy);
  }
  return shoppingAgent;
}

export function getShoppingAgent(): ShoppingAgent {
  if (!shoppingAgent) {
    throw new Error('Shopping agent not initialized');
  }
  return shoppingAgent;
}

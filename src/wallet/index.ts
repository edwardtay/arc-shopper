import { ethers } from 'ethers';
import { config } from '../config';

export class AgentWallet {
  public wallet: ethers.Wallet;
  public provider: ethers.JsonRpcProvider;
  public address: string;

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(config.arc.rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.address);
    return ethers.formatUnits(balance, 18);
  }

  async signMessage(message: string): Promise<string> {
    return this.wallet.signMessage(message);
  }

  static generate(): { address: string; privateKey: string } {
    const wallet = ethers.Wallet.createRandom();
    return { address: wallet.address, privateKey: wallet.privateKey };
  }
}

let wallets: Record<string, AgentWallet> = {};

export function initWallets() {
  if (config.agents.orchestrator.privateKey) {
    wallets.orchestrator = new AgentWallet(config.agents.orchestrator.privateKey);
  }
  if (config.agents.search.privateKey) {
    wallets.search = new AgentWallet(config.agents.search.privateKey);
  }
  if (config.agents.data.privateKey) {
    wallets.data = new AgentWallet(config.agents.data.privateKey);
  }
  if (config.agents.analyzer.privateKey) {
    wallets.analyzer = new AgentWallet(config.agents.analyzer.privateKey);
  }
  return wallets;
}

export function getWallets() {
  return wallets;
}

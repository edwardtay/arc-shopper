import axios from 'axios';
import { AgentTask, AgentResult } from './types';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

interface PriceData {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
}

export async function executeDataFetch(task: AgentTask): Promise<AgentResult> {
  const start = Date.now();
  const query = task.query.toLowerCase();

  try {
    // Determine what data to fetch based on query
    if (query.includes('price') || query.includes('market') || query.includes('crypto')) {
      const prices = await fetchPrices();
      const global = await fetchGlobalData();

      return {
        success: true,
        data: {
          prices,
          global,
          timestamp: new Date().toISOString(),
        },
        duration: Date.now() - start,
      };
    }

    if (query.includes('defi') || query.includes('tvl')) {
      const defi = await fetchDefiData();
      return {
        success: true,
        data: { defi, timestamp: new Date().toISOString() },
        duration: Date.now() - start,
      };
    }

    // Default: fetch top coins
    const prices = await fetchPrices();
    return {
      success: true,
      data: { prices, timestamp: new Date().toISOString() },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Data fetch failed',
      duration: Date.now() - start,
    };
  }
}

async function fetchPrices(): Promise<PriceData[]> {
  const response = await axios.get(`${COINGECKO_BASE}/coins/markets`, {
    params: {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 10,
      sparkline: false,
    },
    timeout: 10000,
  });

  return response.data.map((coin: any) => ({
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    current_price: coin.current_price,
    price_change_percentage_24h: coin.price_change_percentage_24h,
    market_cap: coin.market_cap,
    total_volume: coin.total_volume,
  }));
}

async function fetchGlobalData() {
  const response = await axios.get(`${COINGECKO_BASE}/global`, { timeout: 10000 });
  const data = response.data.data;

  return {
    total_market_cap: data.total_market_cap.usd,
    total_volume: data.total_volume.usd,
    btc_dominance: data.market_cap_percentage.btc,
    active_cryptocurrencies: data.active_cryptocurrencies,
    market_cap_change_24h: data.market_cap_change_percentage_24h_usd,
  };
}

async function fetchDefiData() {
  const response = await axios.get(`${COINGECKO_BASE}/global/decentralized_finance_defi`, { timeout: 10000 });
  const data = response.data.data;

  return {
    defi_market_cap: data.defi_market_cap,
    eth_market_cap: data.eth_market_cap,
    defi_to_eth_ratio: data.defi_to_eth_ratio,
    defi_dominance: data.defi_dominance,
    top_coin_name: data.top_coin_name,
    top_coin_defi_dominance: data.top_coin_defi_dominance,
  };
}

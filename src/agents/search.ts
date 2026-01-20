import axios from 'axios';
import { config, isConfigured } from '../config';
import { AgentTask, AgentResult } from './types';

export async function executeSearch(task: AgentTask): Promise<AgentResult> {
  const start = Date.now();

  try {
    // Try Firecrawl first if configured
    if (isConfigured.firecrawl()) {
      const firecrawlResult = await tryFirecrawl(task.query);
      if (firecrawlResult) {
        return {
          success: true,
          data: { query: task.query, source: 'firecrawl', ...firecrawlResult },
          duration: Date.now() - start,
        };
      }
    }

    // Fallback to DuckDuckGo (free, no API key)
    const ddgResult = await searchDuckDuckGo(task.query);
    return {
      success: true,
      data: { query: task.query, source: 'duckduckgo', ...ddgResult },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Search failed',
      duration: Date.now() - start,
    };
  }
}

async function tryFirecrawl(query: string) {
  try {
    const response = await axios.post(
      'https://api.firecrawl.dev/v1/search',
      { query, limit: 5 },
      {
        headers: {
          'Authorization': `Bearer ${config.apis.firecrawl}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    if (response.data.success && response.data.data?.length) {
      return {
        results: response.data.data.map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        })),
        count: response.data.data.length,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string) {
  const response = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
    timeout: 10000,
  });

  const results: Array<{ title: string; url: string; snippet: string }> = [];

  if (response.data.AbstractText) {
    results.push({
      title: response.data.Heading || query,
      url: response.data.AbstractURL || '',
      snippet: response.data.AbstractText,
    });
  }

  if (response.data.RelatedTopics) {
    for (const topic of response.data.RelatedTopics.slice(0, 4)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0],
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      }
    }
  }

  return { results, count: results.length };
}

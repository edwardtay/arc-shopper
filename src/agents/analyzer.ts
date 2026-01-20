import OpenAI from 'openai';
import { config, isConfigured } from '../config';
import { AgentTask, AgentResult } from './types';

export async function executeAnalysis(task: AgentTask): Promise<AgentResult> {
  const start = Date.now();

  if (!isConfigured.openai()) {
    return {
      success: false,
      data: null,
      error: 'OPENAI_API_KEY not configured',
      duration: Date.now() - start,
    };
  }

  const openai = new OpenAI({ apiKey: config.apis.openai });

  try {
    const systemPrompt = `You are a concise analyst. Analyze the provided data and query.
Return a JSON object with:
- summary: 2-3 sentence summary
- insights: array of 3 key insights
- recommendation: one actionable recommendation`;

    const userPrompt = task.context
      ? `Query: ${task.query}\n\nData:\n${JSON.stringify(task.context, null, 2)}`
      : `Analyze: ${task.query}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const analysis = JSON.parse(content);

    return {
      success: true,
      data: {
        query: task.query,
        analysis,
        model: 'gpt-4o-mini',
        tokens: response.usage?.total_tokens || 0,
      },
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Analysis failed',
      duration: Date.now() - start,
    };
  }
}

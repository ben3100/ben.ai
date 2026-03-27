import { AIProvider, ChatMessage, ChatOptions, ModelInfo } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096
      })
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  async streamChat(messages: ChatMessage[], onChunk: (chunk: string) => void, options: ChatOptions = {}): Promise<void> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        stream: true
      })
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI stream error: ${res.statusText}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const obj = JSON.parse(line.slice(6)) as { choices: Array<{ delta: { content?: string } }> };
          const content = obj.choices[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: Array<{ id: string }> };
    return data.data.map(m => ({ id: m.id, name: m.id }));
  }

  async structuredOutput<T>(messages: ChatMessage[], schema: object): Promise<T> {
    const systemPrompt = `Respond ONLY with valid JSON matching this schema: ${JSON.stringify(schema)}. No explanation, no markdown.`;
    const augmented: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
    const raw = await this.chat(augmented);
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON found in response');
    return JSON.parse(match[0]) as T;
  }
}

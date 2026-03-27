import { AIProvider, ChatMessage, ChatOptions, ModelInfo } from './types';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 4096
        }
      })
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
    const data = await res.json() as { message: { content: string } };
    return data.message.content;
  }

  async streamChat(messages: ChatMessage[], onChunk: (chunk: string) => void, options: ChatOptions = {}): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: { temperature: options.temperature ?? 0.2 }
      })
    });
    if (!res.ok || !res.body) throw new Error(`Ollama stream error: ${res.statusText}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as { message?: { content: string }; done?: boolean };
          if (obj.message?.content) onChunk(obj.message.content);
        } catch {}
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models: Array<{ name: string }> };
    return data.models.map(m => ({ id: m.name, name: m.name }));
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

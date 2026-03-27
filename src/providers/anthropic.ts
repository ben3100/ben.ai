import { AIProvider, ChatMessage, ChatOptions, ModelInfo } from './types';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  private toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: Array<{ role: string; content: string }> } {
    const system = messages.find(m => m.role === 'system')?.content;
    const filtered = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    return { system, messages: filtered };
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const { system, messages: msgs } = this.toAnthropicMessages(messages);
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: msgs
    };
    if (system) body['system'] = system;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.statusText}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    return data.content[0].text;
  }

  async streamChat(messages: ChatMessage[], onChunk: (chunk: string) => void, options: ChatOptions = {}): Promise<void> {
    const { system, messages: msgs } = this.toAnthropicMessages(messages);
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: msgs,
      stream: true
    };
    if (system) body['system'] = system;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic stream error: ${res.statusText}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const obj = JSON.parse(line.slice(6)) as { type: string; delta?: { text?: string } };
          if (obj.type === 'content_block_delta' && obj.delta?.text) onChunk(obj.delta.text);
        } catch {}
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
    ];
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

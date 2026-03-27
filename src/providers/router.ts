import * as vscode from 'vscode';
import { AIProvider, ModelInfo } from './types';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { SecureStorage } from '../storage/secureStorage';

export type TaskType = 'plan' | 'code' | 'fix' | 'test' | 'refactor' | 'chat';

export class ProviderRouter {
  private providers: Map<string, AIProvider> = new Map();
  private storage: SecureStorage;

  constructor(storage: SecureStorage) {
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ben-ai');
    const ollamaUrl = config.get<string>('ollamaUrl', 'http://localhost:11434');
    const ollamaModel = config.get<string>('ollamaModel', 'codellama');
    this.providers.set('ollama', new OllamaProvider(ollamaUrl, ollamaModel));

    const openaiKey = await this.storage.get('openai-key');
    if (openaiKey) {
      const model = config.get<string>('openaiModel', 'gpt-4o-mini');
      this.providers.set('openai', new OpenAIProvider(openaiKey, model));
    }

    const anthropicKey = await this.storage.get('anthropic-key');
    if (anthropicKey) {
      const model = config.get<string>('anthropicModel', 'claude-3-haiku-20240307');
      this.providers.set('anthropic', new AnthropicProvider(anthropicKey, model));
    }
  }

  async getProviderForTask(task: TaskType): Promise<AIProvider> {
    const config = vscode.workspace.getConfiguration('ben-ai');
    const preferred = config.get<string>('provider', 'ollama');

    const routing: Record<TaskType, string[]> = {
      plan: ['anthropic', 'openai', 'ollama'],
      code: ['openai', 'ollama', 'anthropic'],
      fix: ['ollama', 'openai', 'anthropic'],
      test: ['ollama', 'openai', 'anthropic'],
      refactor: ['openai', 'anthropic', 'ollama'],
      chat: [preferred, 'ollama', 'openai', 'anthropic']
    };

    const candidates = routing[task];
    for (const name of candidates) {
      const provider = this.providers.get(name);
      if (provider && await provider.isAvailable()) return provider;
    }
    throw new Error('No AI provider available. Make sure Ollama is running or set an API key.');
  }

  async listAllModels(): Promise<Map<string, ModelInfo[]>> {
    const result = new Map<string, ModelInfo[]>();
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        result.set(name, await provider.listModels());
      }
    }
    return result;
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  streamChat(messages: ChatMessage[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  structuredOutput<T>(messages: ChatMessage[], schema: object): Promise<T>;
  isAvailable(): Promise<boolean>;
}

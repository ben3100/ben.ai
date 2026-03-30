export interface CodeSymbol {
  name: string;
  kind: 'class' | 'function' | 'interface' | 'variable' | 'method' | 'property' | 'type' | 'enum';
  filePath: string;
  line: number;
  signature?: string;
  documentation?: string;
}

export interface FileIndex {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  summary?: string;
}

export interface ProjectContext {
  rootPath: string;
  name: string;
  files: Map<string, FileIndex>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  totalFiles: number;
  totalSymbols: number;
  languages: string[];
  lastIndexed: number;
}

export interface ContextWindow {
  relevantFiles: FileIndex[];
  relevantSymbols: CodeSymbol[];
  currentFile?: FileIndex;
  maxTokens: number;
}

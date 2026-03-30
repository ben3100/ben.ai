import * as vscode from 'vscode';
import * as fs from 'fs';
import { ProjectIndexer } from './projectIndexer';
import { FileIndex, CodeSymbol, ContextWindow, ProjectContext } from './types';

export class ContextManager {
  private indexer: ProjectIndexer;
  private maxContextTokens: number;

  constructor(maxContextTokens = 8000) {
    this.indexer = new ProjectIndexer();
    this.maxContextTokens = maxContextTokens;
  }

  setProgressCallback(cb: (message: string, progress: number) => void): void {
    this.indexer.setProgressCallback(cb);
  }

  async initialize(): Promise<ProjectContext | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    
    return this.indexer.indexProject(folders[0].uri.fsPath);
  }

  async refresh(): Promise<ProjectContext | null> {
    return this.initialize();
  }

  getProjectContext(): ProjectContext | null {
    return this.indexer.getContext();
  }

  buildContextWindow(query: string, currentFilePath?: string): ContextWindow {
    const context = this.indexer.getContext();
    const relevantFiles: FileIndex[] = [];
    const relevantSymbols: CodeSymbol[] = [];
    let currentFile: FileIndex | undefined;

    if (!context) {
      return { relevantFiles, relevantSymbols, maxTokens: this.maxContextTokens };
    }

    // Get current file if specified
    if (currentFilePath) {
      currentFile = context.files.get(currentFilePath);
      if (currentFile) {
        relevantFiles.push(currentFile);
        relevantSymbols.push(...currentFile.symbols);
      }
    }

    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // Find relevant symbols
    for (const keyword of keywords) {
      const symbols = this.indexer.findSymbol(keyword);
      for (const symbol of symbols) {
        if (!relevantSymbols.find(s => s.name === symbol.name && s.filePath === symbol.filePath)) {
          relevantSymbols.push(symbol);
        }
      }
    }

    // Find relevant files by content/name
    for (const keyword of keywords) {
      const files = this.indexer.findFilesByPattern(keyword);
      for (const file of files) {
        if (!relevantFiles.find(f => f.relativePath === file.relativePath)) {
          relevantFiles.push(file);
        }
      }
    }

    // Add related files for current file
    if (currentFilePath) {
      const related = this.indexer.getRelatedFiles(currentFilePath);
      for (const file of related) {
        if (!relevantFiles.find(f => f.relativePath === file.relativePath)) {
          relevantFiles.push(file);
        }
      }
    }

    // Limit to maxContextTokens (rough estimation: 1 token ≈ 4 chars)
    const maxChars = this.maxContextTokens * 4;
    let currentChars = 0;
    const filteredFiles: FileIndex[] = [];

    for (const file of relevantFiles) {
      if (currentChars + file.size < maxChars) {
        filteredFiles.push(file);
        currentChars += file.size;
      }
    }

    return {
      relevantFiles: filteredFiles,
      relevantSymbols: relevantSymbols.slice(0, 50),
      currentFile,
      maxTokens: this.maxContextTokens
    };
  }

  private extractKeywords(query: string): string[] {
    // Remove common words and extract meaningful keywords
    const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom',
      'how', 'why', 'where', 'when', 'and', 'or', 'but', 'if', 'then', 'else',
      'for', 'of', 'to', 'from', 'in', 'on', 'at', 'by', 'with', 'about', 'into',
      'file', 'code', 'function', 'class', 'method', 'add', 'create', 'make', 'change',
      'update', 'fix', 'implement', 'write', 'generate'];
    
    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.includes(w));
    
    // Also look for camelCase or PascalCase patterns in the original query
    const camelCaseMatches = query.match(/[A-Z][a-z]+|[a-z]+(?=[A-Z])/g) || [];
    
    return [...new Set([...words, ...camelCaseMatches.map(w => w.toLowerCase())])];
  }

  formatContextForPrompt(contextWindow: ContextWindow): string {
    const parts: string[] = [];

    if (contextWindow.currentFile) {
      parts.push(`## Current File: ${contextWindow.currentFile.relativePath}`);
      parts.push(`Language: ${contextWindow.currentFile.language}`);
      if (contextWindow.currentFile.symbols.length > 0) {
        parts.push('Symbols:');
        for (const symbol of contextWindow.currentFile.symbols.slice(0, 20)) {
          parts.push(`  - ${symbol.kind}: ${symbol.name} (line ${symbol.line})`);
        }
      }
    }

    if (contextWindow.relevantSymbols.length > 0) {
      parts.push('\n## Relevant Symbols in Project:');
      for (const symbol of contextWindow.relevantSymbols.slice(0, 30)) {
        parts.push(`  - ${symbol.kind} "${symbol.name}" in ${symbol.filePath}:${symbol.line}`);
      }
    }

    if (contextWindow.relevantFiles.length > 0) {
      parts.push('\n## Relevant Files:');
      for (const file of contextWindow.relevantFiles.slice(0, 10)) {
        parts.push(`  - ${file.relativePath} (${file.language}, ${file.symbols.length} symbols)`);
      }
    }

    return parts.join('\n');
  }

  async getFileContent(relativePath: string): Promise<string | null> {
    const context = this.indexer.getContext();
    if (!context) return null;

    const file = context.files.get(relativePath);
    if (!file) return null;

    try {
      return fs.readFileSync(file.path, 'utf8');
    } catch {
      return null;
    }
  }

  getSummary(): string {
    const context = this.indexer.getContext();
    if (!context) return 'No project indexed.';

    return `Project: ${context.name}
Files: ${context.totalFiles}
Symbols: ${context.totalSymbols}
Languages: ${context.languages.join(', ')}
Dependencies: ${Object.keys(context.dependencies).length}
Last indexed: ${new Date(context.lastIndexed).toLocaleString()}`;
  }
}

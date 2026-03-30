import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileIndex, CodeSymbol, ProjectContext } from './types';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust', '.cpp': 'cpp', '.c': 'c',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin',
  '.vue': 'vue', '.svelte': 'svelte', '.html': 'html', '.css': 'css', '.scss': 'scss',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.sql': 'sql'
};

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'coverage', '.vscode'];
const IGNORE_FILES = ['.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

export class ProjectIndexer {
  private context: ProjectContext | null = null;
  private onProgressCallback?: (message: string, progress: number) => void;

  setProgressCallback(cb: (message: string, progress: number) => void): void {
    this.onProgressCallback = cb;
  }

  private emit(message: string, progress: number): void {
    this.onProgressCallback?.(message, progress);
  }

  async indexProject(rootPath: string): Promise<ProjectContext> {
    this.emit('Starting project indexing...', 0);
    
    const projectName = path.basename(rootPath);
    const files = new Map<string, FileIndex>();
    const allFiles = this.collectFiles(rootPath, rootPath);
    
    let processed = 0;
    const total = allFiles.length;
    
    for (const filePath of allFiles) {
      const fileIndex = await this.indexFile(filePath, rootPath);
      if (fileIndex) {
        files.set(fileIndex.relativePath, fileIndex);
      }
      processed++;
      this.emit(`Indexing: ${path.basename(filePath)}`, (processed / total) * 100);
    }

    const { dependencies, devDependencies } = this.readPackageJson(rootPath);
    const languages = [...new Set([...files.values()].map(f => f.language))];
    const totalSymbols = [...files.values()].reduce((sum, f) => sum + f.symbols.length, 0);

    this.context = {
      rootPath,
      name: projectName,
      files,
      dependencies,
      devDependencies,
      totalFiles: files.size,
      totalSymbols,
      languages,
      lastIndexed: Date.now()
    };

    this.emit(`Indexed ${files.size} files, ${totalSymbols} symbols`, 100);
    return this.context;
  }

  private collectFiles(dir: string, rootPath: string): string[] {
    const results: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (IGNORE_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          results.push(...this.collectFiles(fullPath, rootPath));
        } else if (entry.isFile()) {
          if (IGNORE_FILES.includes(entry.name)) continue;
          const ext = path.extname(entry.name);
          if (LANGUAGE_MAP[ext]) {
            results.push(fullPath);
          }
        }
      }
    } catch {}
    
    return results;
  }

  private async indexFile(filePath: string, rootPath: string): Promise<FileIndex | null> {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 500000) return null; // Skip files > 500KB
      
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath);
      const language = LANGUAGE_MAP[ext] || 'text';
      const relativePath = path.relative(rootPath, filePath);
      
      const symbols = this.extractSymbols(content, language, relativePath);
      const imports = this.extractImports(content, language);
      const exports = this.extractExports(content, language);

      return {
        path: filePath,
        relativePath,
        language,
        size: stat.size,
        lastModified: stat.mtimeMs,
        symbols,
        imports,
        exports
      };
    } catch {
      return null;
    }
  }

  private extractSymbols(content: string, language: string, filePath: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    const patterns: Record<string, RegExp[]> = {
      typescript: [
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /(?:export\s+)?class\s+(\w+)/,
        /(?:export\s+)?interface\s+(\w+)/,
        /(?:export\s+)?type\s+(\w+)\s*=/,
        /(?:export\s+)?enum\s+(\w+)/,
        /(?:export\s+)?const\s+(\w+)\s*[:=]/,
        /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/
      ],
      javascript: [
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
        /(?:export\s+)?class\s+(\w+)/,
        /(?:export\s+)?const\s+(\w+)\s*=/,
        /(\w+)\s*:\s*(?:async\s+)?function/
      ],
      python: [
        /^def\s+(\w+)\s*\(/m,
        /^class\s+(\w+)/m,
        /^(\w+)\s*=\s*(?:lambda|def)/m
      ]
    };

    const langPatterns = patterns[language] || patterns['javascript'] || [];

    lines.forEach((line, index) => {
      for (const pattern of langPatterns) {
        const match = line.match(pattern);
        if (match && match[1] && !match[1].startsWith('_')) {
          const kind = this.determineKind(line, language);
          symbols.push({
            name: match[1],
            kind,
            filePath,
            line: index + 1,
            signature: line.trim().slice(0, 100)
          });
        }
      }
    });

    return symbols;
  }

  private determineKind(line: string, language: string): CodeSymbol['kind'] {
    if (/class\s/.test(line)) return 'class';
    if (/interface\s/.test(line)) return 'interface';
    if (/type\s+\w+\s*=/.test(line)) return 'type';
    if (/enum\s/.test(line)) return 'enum';
    if (/function\s|=>\s*{|def\s/.test(line)) return 'function';
    if (/:\s*function/.test(line)) return 'method';
    return 'variable';
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    
    if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
      const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        imports.push(match[1]);
      }
      const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const match of requireMatches) {
        imports.push(match[1]);
      }
    } else if (language === 'python') {
      const importMatches = content.matchAll(/(?:from\s+(\S+)\s+)?import\s+(\S+)/g);
      for (const match of importMatches) {
        imports.push(match[1] || match[2]);
      }
    }
    
    return [...new Set(imports)];
  }

  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];
    
    if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
      const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g);
      for (const match of exportMatches) {
        exports.push(match[1]);
      }
    }
    
    return exports;
  }

  private readPackageJson(rootPath: string): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
    try {
      const pkgPath = path.join(rootPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return {
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {}
        };
      }
    } catch {}
    return { dependencies: {}, devDependencies: {} };
  }

  getContext(): ProjectContext | null {
    return this.context;
  }

  findSymbol(name: string): CodeSymbol[] {
    if (!this.context) return [];
    const results: CodeSymbol[] = [];
    
    for (const file of this.context.files.values()) {
      for (const symbol of file.symbols) {
        if (symbol.name.toLowerCase().includes(name.toLowerCase())) {
          results.push(symbol);
        }
      }
    }
    
    return results;
  }

  findFilesByPattern(pattern: string): FileIndex[] {
    if (!this.context) return [];
    const results: FileIndex[] = [];
    const regex = new RegExp(pattern, 'i');
    
    for (const file of this.context.files.values()) {
      if (regex.test(file.relativePath)) {
        results.push(file);
      }
    }
    
    return results;
  }

  getRelatedFiles(filePath: string): FileIndex[] {
    if (!this.context) return [];
    
    const file = this.context.files.get(filePath);
    if (!file) return [];
    
    const related: FileIndex[] = [];
    
    // Files that import this file
    for (const f of this.context.files.values()) {
      if (f.imports.some(imp => imp.includes(path.basename(filePath, path.extname(filePath))))) {
        related.push(f);
      }
    }
    
    // Files this file imports
    for (const imp of file.imports) {
      if (imp.startsWith('.')) {
        const importedPath = path.normalize(path.join(path.dirname(filePath), imp));
        for (const f of this.context.files.values()) {
          if (f.relativePath.startsWith(importedPath.replace(/\\/g, '/'))) {
            related.push(f);
          }
        }
      }
    }
    
    return [...new Set(related)];
  }
}

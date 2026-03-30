import * as path from 'path';
import { ProviderRouter, ChatMessage } from '../providers';

export interface CodeIssue {
  type: 'error' | 'warning' | 'suggestion' | 'info';
  message: string;
  line?: number;
  code?: string;
  fix?: string;
}

export interface AnalysisResult {
  filePath: string;
  language: string;
  issues: CodeIssue[];
  metrics: CodeMetrics;
  summary: string;
}

export interface CodeMetrics {
  lines: number;
  functions: number;
  classes: number;
  complexity: 'low' | 'medium' | 'high';
  maintainability: 'good' | 'moderate' | 'poor';
}

export class CodeAnalyzer {
  private router: ProviderRouter;

  constructor(router: ProviderRouter) {
    this.router = router;
  }

  async analyzeCode(filePath: string, fileContent: string): Promise<AnalysisResult> {
    const ext = path.extname(filePath);
    const language = this.detectLanguage(ext);
    
    // Basic metrics
    const metrics = this.calculateMetrics(fileContent, language);
    
    // AI-powered analysis
    const issues = await this.findIssues(fileContent, language);
    const summary = this.generateSummary(metrics, issues);

    return {
      filePath,
      language,
      issues,
      metrics,
      summary
    };
  }

  async findIssues(code: string, language: string): Promise<CodeIssue[]> {
    const provider = await this.router.getProviderForTask('code');

    const schema = {
      issues: [{
        type: 'string',
        message: 'string',
        line: 'number?',
        code: 'string?',
        fix: 'string?'
      }]
    };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code review expert. Analyze code for:
1. Bugs and potential errors
2. Security vulnerabilities
3. Performance issues
4. Code style and best practices
5. Maintainability concerns

Be specific and actionable. Include line numbers when possible.`
      },
      {
        role: 'user',
        content: `Analyze this ${language} code for issues:

\`\`\`${language}
${code}
\`\`\`

Return issues found:`
      }
    ];

    try {
      const result = await provider.structuredOutput<{ issues: CodeIssue[] }>(messages, schema);
      return result.issues || [];
    } catch {
      return [];
    }
  }

  async suggestImprovements(code: string, language: string): Promise<string[]> {
    const provider = await this.router.getProviderForTask('code');

    const schema = { suggestions: ['string'] };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Suggest specific improvements for the code. Be concise and actionable.'
      },
      {
        role: 'user',
        content: `Suggest improvements for this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Return a list of suggestions:`
      }
    ];

    try {
      const result = await provider.structuredOutput<{ suggestions: string[] }>(messages, schema);
      return result.suggestions || [];
    } catch {
      return [];
    }
  }

  async explainCode(code: string, language: string): Promise<string> {
    const provider = await this.router.getProviderForTask('chat');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Explain code clearly and concisely. Focus on what it does, not how it works line by line.'
      },
      {
        role: 'user',
        content: `Explain this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Provide a clear explanation:`
      }
    ];

    return provider.chat(messages);
  }

  async findSecurityIssues(code: string, language: string): Promise<CodeIssue[]> {
    const provider = await this.router.getProviderForTask('code');

    const schema = {
      issues: [{
        type: 'string',
        message: 'string',
        line: 'number?',
        code: 'string?',
        fix: 'string?'
      }]
    };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a security expert. Find security vulnerabilities:
1. Injection attacks (SQL, XSS, command injection)
2. Authentication/authorization issues
3. Sensitive data exposure
4. Insecure configurations
5. Cryptographic weaknesses`
      },
      {
        role: 'user',
        content: `Find security issues in this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Return security issues found:`
      }
    ];

    try {
      const result = await provider.structuredOutput<{ issues: CodeIssue[] }>(messages, schema);
      return (result.issues || []).map(i => ({ ...i, type: 'warning' as const }));
    } catch {
      return [];
    }
  }

  private calculateMetrics(code: string, language: string): CodeMetrics {
    const lines = code.split('\n').length;
    
    let functions = 0;
    let classes = 0;

    if (['typescript', 'javascript'].includes(language)) {
      functions = (code.match(/(?:function\s+\w+|=>\s*[{(]|\w+\s*\([^)]*\)\s*{)/g) || []).length;
      classes = (code.match(/class\s+\w+/g) || []).length;
    } else if (language === 'python') {
      functions = (code.match(/def\s+\w+/g) || []).length;
      classes = (code.match(/class\s+\w+/g) || []).length;
    }

    // Simple complexity estimation
    const conditionals = (code.match(/if|else|switch|case|while|for|try|catch|\?/g) || []).length;
    const complexityRatio = conditionals / Math.max(lines, 1);
    
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (complexityRatio > 0.15) complexity = 'high';
    else if (complexityRatio > 0.08) complexity = 'medium';

    // Maintainability based on various factors
    const avgLineLength = code.length / Math.max(lines, 1);
    const hasComments = /\/\/|\/\*|#.*|"""|'''/.test(code);
    
    let maintainability: 'good' | 'moderate' | 'poor' = 'good';
    if (avgLineLength > 100 || (!hasComments && lines > 50)) maintainability = 'poor';
    else if (avgLineLength > 80 || lines > 200) maintainability = 'moderate';

    return {
      lines,
      functions,
      classes,
      complexity,
      maintainability
    };
  }

  private generateSummary(metrics: CodeMetrics, issues: CodeIssue[]): string {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    
    return `${metrics.lines} lines, ${metrics.functions} functions, ${metrics.classes} classes. ` +
      `Complexity: ${metrics.complexity}, Maintainability: ${metrics.maintainability}. ` +
      `Issues: ${errorCount} errors, ${warningCount} warnings.`;
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust'
    };
    return langMap[ext] || 'javascript';
  }
}

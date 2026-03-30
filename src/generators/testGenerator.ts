import * as vscode from 'vscode';
import * as path from 'path';
import { ProviderRouter, ChatMessage } from '../providers';
import { ContextManager } from '../context';

export interface TestOptions {
  framework?: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'unittest';
  style?: 'unit' | 'integration' | 'e2e';
  coverage?: boolean;
  mocks?: boolean;
}

export interface GeneratedTest {
  filePath: string;
  testFilePath: string;
  content: string;
  framework: string;
  testCount: number;
}

export class TestGenerator {
  private router: ProviderRouter;
  private contextManager: ContextManager;

  constructor(router: ProviderRouter, contextManager: ContextManager) {
    this.router = router;
    this.contextManager = contextManager;
  }

  async generateTests(filePath: string, fileContent: string, options: TestOptions = {}): Promise<GeneratedTest> {
    const ext = path.extname(filePath);
    const language = this.detectLanguage(ext);
    const framework = options.framework || this.detectFramework(language);
    
    const provider = await this.router.getProviderForTask('code');
    
    const contextWindow = this.contextManager.buildContextWindow(`tests for ${path.basename(filePath)}`, filePath);
    const contextInfo = this.contextManager.formatContextForPrompt(contextWindow);

    const systemPrompt = `You are an expert test engineer. Generate comprehensive, well-structured tests.
Rules:
1. Return ONLY valid test code, no explanations or markdown
2. Include edge cases, error handling, and boundary conditions
3. Use descriptive test names that explain the expected behavior
4. Mock external dependencies when appropriate
5. Follow ${framework} best practices and conventions`;

    const userPrompt = `Generate ${options.style || 'unit'} tests for this ${language} file using ${framework}.

File: ${filePath}
${options.mocks ? 'Include mocks for external dependencies.' : ''}
${options.coverage ? 'Aim for high code coverage.' : ''}

Project Context:
${contextInfo}

Source Code:
\`\`\`${language}
${fileContent}
\`\`\`

Generate complete test file:`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const testContent = await provider.chat(messages);
    const cleanContent = this.cleanCodeResponse(testContent);
    const testFilePath = this.generateTestFilePath(filePath, framework);
    const testCount = this.countTests(cleanContent, framework);

    return {
      filePath,
      testFilePath,
      content: cleanContent,
      framework,
      testCount
    };
  }

  async generateTestsForFunction(
    filePath: string,
    functionName: string,
    functionCode: string,
    options: TestOptions = {}
  ): Promise<string> {
    const ext = path.extname(filePath);
    const language = this.detectLanguage(ext);
    const framework = options.framework || this.detectFramework(language);
    
    const provider = await this.router.getProviderForTask('code');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert test engineer. Generate comprehensive tests for the given function.
Return ONLY valid ${framework} test code, no explanations.`
      },
      {
        role: 'user',
        content: `Generate tests for this function using ${framework}:

Function name: ${functionName}
File: ${filePath}

\`\`\`${language}
${functionCode}
\`\`\`

Include:
- Normal cases
- Edge cases
- Error cases
- Boundary conditions

Generate test code:`
      }
    ];

    const testContent = await provider.chat(messages);
    return this.cleanCodeResponse(testContent);
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust'
    };
    return langMap[ext] || 'javascript';
  }

  private detectFramework(language: string): string {
    const frameworkMap: Record<string, string> = {
      'typescript': 'jest',
      'javascript': 'jest',
      'python': 'pytest',
      'java': 'junit',
      'go': 'testing',
      'rust': 'cargo test'
    };
    return frameworkMap[language] || 'jest';
  }

  private generateTestFilePath(filePath: string, framework: string): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    
    if (framework === 'pytest') {
      return path.join(dir, '__tests__', `test_${base}.py`);
    }
    
    return path.join(dir, '__tests__', `${base}.test${ext}`);
  }

  private countTests(content: string, framework: string): number {
    const patterns: Record<string, RegExp> = {
      'jest': /(?:it|test)\s*\(/g,
      'vitest': /(?:it|test)\s*\(/g,
      'mocha': /(?:it|test)\s*\(/g,
      'pytest': /def\s+test_/g,
      'unittest': /def\s+test_/g
    };
    
    const pattern = patterns[framework] || patterns['jest'];
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private cleanCodeResponse(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    
    const codeBlockMatch = cleaned.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    }
    
    // Remove leading/trailing explanation text
    const lines = cleaned.split('\n');
    const codeStart = lines.findIndex(l => 
      /^(?:import|const|let|var|function|class|describe|test|it|def|from|export)/.test(l.trim())
    );
    
    if (codeStart > 0) {
      cleaned = lines.slice(codeStart).join('\n');
    }
    
    return cleaned.trim();
  }
}

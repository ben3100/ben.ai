import * as path from 'path';
import { ProviderRouter, ChatMessage } from '../providers';
import { ContextManager } from '../context';

export interface RefactorOptions {
  type?: 'extract-function' | 'rename' | 'simplify' | 'modernize' | 'optimize' | 'clean' | 'full';
  targetName?: string;
  newName?: string;
  preserveComments?: boolean;
}

export interface RefactorResult {
  original: string;
  refactored: string;
  changes: RefactorChange[];
  suggestions: string[];
}

export interface RefactorChange {
  type: string;
  description: string;
  line?: number;
}

export class RefactorEngine {
  private router: ProviderRouter;
  private contextManager: ContextManager;

  constructor(router: ProviderRouter, contextManager: ContextManager) {
    this.router = router;
    this.contextManager = contextManager;
  }

  async refactorCode(
    filePath: string,
    fileContent: string,
    options: RefactorOptions = {}
  ): Promise<RefactorResult> {
    const ext = path.extname(filePath);
    const language = this.detectLanguage(ext);
    const refactorType = options.type || 'full';
    
    const provider = await this.router.getProviderForTask('refactor');
    const contextWindow = this.contextManager.buildContextWindow(`refactor ${path.basename(filePath)}`, filePath);
    const contextInfo = this.contextManager.formatContextForPrompt(contextWindow);

    const systemPrompt = this.buildSystemPrompt(refactorType, language, options);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Refactor this ${language} code (${refactorType}):

File: ${filePath}
${options.targetName ? `Target: ${options.targetName}` : ''}
${options.newName ? `New name: ${options.newName}` : ''}

Project Context:
${contextInfo}

Code:
\`\`\`${language}
${fileContent}
\`\`\`

Return ONLY the refactored code:`
      }
    ];

    const refactored = await provider.chat(messages);
    const cleanRefactored = this.cleanCodeResponse(refactored);
    
    // Get analysis of changes
    const analysis = await this.analyzeChanges(fileContent, cleanRefactored, language);

    return {
      original: fileContent,
      refactored: cleanRefactored,
      changes: analysis.changes,
      suggestions: analysis.suggestions
    };
  }

  async extractFunction(
    code: string,
    selectionStart: number,
    selectionEnd: number,
    newFunctionName: string,
    language: string
  ): Promise<string> {
    const selectedCode = code.substring(selectionStart, selectionEnd);
    const provider = await this.router.getProviderForTask('refactor');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert at code refactoring. Extract the selected code into a new function.
Rules:
1. Identify all variables used in the selection that come from outside
2. Pass these as parameters
3. Identify what the selection returns/produces
4. Return this from the new function
5. Replace the original selection with a call to the new function
6. Return the complete refactored code`
      },
      {
        role: 'user',
        content: `Extract this selected code into a function named "${newFunctionName}":

Full code:
\`\`\`${language}
${code}
\`\`\`

Selected code to extract (characters ${selectionStart}-${selectionEnd}):
\`\`\`${language}
${selectedCode}
\`\`\`

Return the complete refactored code with the new function:`
      }
    ];

    const result = await provider.chat(messages);
    return this.cleanCodeResponse(result);
  }

  async renameSymbol(
    code: string,
    oldName: string,
    newName: string,
    language: string
  ): Promise<string> {
    const provider = await this.router.getProviderForTask('refactor');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Rename the symbol while preserving all functionality.
Rules:
1. Rename all occurrences of the symbol
2. Update all references
3. Update imports/exports if necessary
4. Preserve code formatting
5. Return ONLY the updated code`
      },
      {
        role: 'user',
        content: `Rename "${oldName}" to "${newName}" in this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Return the updated code:`
      }
    ];

    const result = await provider.chat(messages);
    return this.cleanCodeResponse(result);
  }

  async simplifyCode(code: string, language: string): Promise<RefactorResult> {
    const provider = await this.router.getProviderForTask('refactor');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Simplify the code while maintaining functionality.
Focus on:
1. Removing redundant code
2. Simplifying complex conditionals
3. Using more concise syntax
4. Removing dead code
5. Consolidating duplicate logic`
      },
      {
        role: 'user',
        content: `Simplify this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Return the simplified code:`
      }
    ];

    const result = await provider.chat(messages);
    const cleanResult = this.cleanCodeResponse(result);
    const analysis = await this.analyzeChanges(code, cleanResult, language);

    return {
      original: code,
      refactored: cleanResult,
      changes: analysis.changes,
      suggestions: analysis.suggestions
    };
  }

  async modernizeCode(code: string, language: string): Promise<RefactorResult> {
    const provider = await this.router.getProviderForTask('refactor');

    const modernFeatures: Record<string, string> = {
      'typescript': 'ES2022+ features, optional chaining, nullish coalescing, template literals, async/await, destructuring',
      'javascript': 'ES2022+ features, arrow functions, const/let, template literals, async/await, destructuring',
      'python': 'Python 3.10+ features, walrus operator, pattern matching, f-strings, type hints'
    };

    const features = modernFeatures[language] || 'modern language features';

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Modernize the code using current best practices and language features.
Use: ${features}
Maintain backward compatibility where critical.`
      },
      {
        role: 'user',
        content: `Modernize this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Return the modernized code:`
      }
    ];

    const result = await provider.chat(messages);
    const cleanResult = this.cleanCodeResponse(result);
    const analysis = await this.analyzeChanges(code, cleanResult, language);

    return {
      original: code,
      refactored: cleanResult,
      changes: analysis.changes,
      suggestions: analysis.suggestions
    };
  }

  private buildSystemPrompt(type: string, language: string, options: RefactorOptions): string {
    const basePrompt = `You are an expert code refactoring assistant for ${language}.
${options.preserveComments ? 'Preserve all comments.' : 'Update comments to match changes.'}
Return ONLY the refactored code, no explanations.`;

    const typePrompts: Record<string, string> = {
      'extract-function': `${basePrompt}\nExtract selected code into a well-named function with proper parameters.`,
      'rename': `${basePrompt}\nRename symbols consistently throughout the code.`,
      'simplify': `${basePrompt}\nSimplify code by removing redundancy and using cleaner patterns.`,
      'modernize': `${basePrompt}\nUpdate to use modern language features and best practices.`,
      'optimize': `${basePrompt}\nOptimize for performance without sacrificing readability.`,
      'clean': `${basePrompt}\nClean up code style, formatting, and organization.`,
      'full': `${basePrompt}\nPerform comprehensive refactoring: simplify, modernize, optimize, and clean.`
    };

    return typePrompts[type] || typePrompts['full'];
  }

  private async analyzeChanges(
    original: string,
    refactored: string,
    language: string
  ): Promise<{ changes: RefactorChange[]; suggestions: string[] }> {
    const provider = await this.router.getProviderForTask('code');

    try {
      const schema = {
        changes: [{ type: 'string', description: 'string', line: 'number?' }],
        suggestions: ['string']
      };

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'Analyze the refactoring changes and provide a brief summary. Be concise.'
        },
        {
          role: 'user',
          content: `Compare original and refactored ${language} code:

Original:
\`\`\`
${original.slice(0, 2000)}
\`\`\`

Refactored:
\`\`\`
${refactored.slice(0, 2000)}
\`\`\`

List the key changes made and any additional suggestions.`
        }
      ];

      return await provider.structuredOutput<{ changes: RefactorChange[]; suggestions: string[] }>(messages, schema);
    } catch {
      return { changes: [], suggestions: [] };
    }
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust'
    };
    return langMap[ext] || 'javascript';
  }

  private cleanCodeResponse(response: string): string {
    let cleaned = response.trim();
    const codeBlockMatch = cleaned.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    }
    return cleaned.trim();
  }
}

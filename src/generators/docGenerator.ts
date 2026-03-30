import * as path from 'path';
import { ProviderRouter, ChatMessage } from '../providers';
import { ContextManager } from '../context';

export interface DocOptions {
  style?: 'jsdoc' | 'tsdoc' | 'docstring' | 'markdown' | 'readme';
  verbose?: boolean;
  includeExamples?: boolean;
}

export interface GeneratedDoc {
  filePath: string;
  content: string;
  style: string;
  sections: string[];
}

export class DocGenerator {
  private router: ProviderRouter;
  private contextManager: ContextManager;

  constructor(router: ProviderRouter, contextManager: ContextManager) {
    this.router = router;
    this.contextManager = contextManager;
  }

  async generateFileDoc(filePath: string, fileContent: string, options: DocOptions = {}): Promise<GeneratedDoc> {
    const ext = path.extname(filePath);
    const language = this.detectLanguage(ext);
    const style = options.style || this.detectDocStyle(language);
    
    const provider = await this.router.getProviderForTask('code');

    const systemPrompt = `You are a technical documentation expert. Generate clear, comprehensive documentation.
Rules:
1. Use ${style} format consistently
2. Include parameter descriptions with types
3. Document return values and exceptions
4. ${options.includeExamples ? 'Include usage examples for each function' : 'Focus on descriptions'}
5. ${options.verbose ? 'Be detailed and thorough' : 'Be concise but complete'}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate ${style} documentation for all functions/classes in this ${language} file.

File: ${filePath}

\`\`\`${language}
${fileContent}
\`\`\`

Return the complete file with documentation added:`
      }
    ];

    const docContent = await provider.chat(messages);
    const cleanContent = this.cleanCodeResponse(docContent);
    const sections = this.extractSections(cleanContent);

    return {
      filePath,
      content: cleanContent,
      style,
      sections
    };
  }

  async generateFunctionDoc(
    functionCode: string,
    language: string,
    options: DocOptions = {}
  ): Promise<string> {
    const style = options.style || this.detectDocStyle(language);
    const provider = await this.router.getProviderForTask('code');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Generate ${style} documentation. Return ONLY the documentation comment, nothing else.`
      },
      {
        role: 'user',
        content: `Generate ${style} documentation for this ${language} function:

\`\`\`${language}
${functionCode}
\`\`\`

${options.includeExamples ? 'Include a usage example.' : ''}
Return only the documentation comment:`
      }
    ];

    const doc = await provider.chat(messages);
    return this.cleanDocResponse(doc, style);
  }

  async generateReadme(projectContext: string): Promise<string> {
    const provider = await this.router.getProviderForTask('code');
    const context = this.contextManager.getProjectContext();

    let projectInfo = projectContext;
    if (context) {
      projectInfo += `\n\nProject Stats:
- Files: ${context.totalFiles}
- Languages: ${context.languages.join(', ')}
- Dependencies: ${Object.keys(context.dependencies).join(', ')}`;
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a documentation expert. Generate a professional README.md file.
Include: project title, description, features, installation, usage, API reference (if applicable), contributing, and license sections.`
      },
      {
        role: 'user',
        content: `Generate a comprehensive README.md for this project:

${projectInfo}

Return complete markdown:`
      }
    ];

    const readme = await provider.chat(messages);
    return this.cleanDocResponse(readme, 'markdown');
  }

  async generateAPIDoc(filePaths: string[], fileContents: Map<string, string>): Promise<string> {
    const provider = await this.router.getProviderForTask('code');
    
    let allCode = '';
    for (const [path, content] of fileContents) {
      allCode += `\n### ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Generate comprehensive API documentation in markdown format.
Include: endpoint descriptions, parameters, return types, examples, and error codes.`
      },
      {
        role: 'user',
        content: `Generate API documentation for these files:
${allCode}

Return complete markdown documentation:`
      }
    ];

    const apiDoc = await provider.chat(messages);
    return this.cleanDocResponse(apiDoc, 'markdown');
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust', '.rb': 'ruby'
    };
    return langMap[ext] || 'javascript';
  }

  private detectDocStyle(language: string): string {
    const styleMap: Record<string, string> = {
      'typescript': 'tsdoc',
      'javascript': 'jsdoc',
      'python': 'docstring',
      'java': 'javadoc',
      'go': 'godoc',
      'rust': 'rustdoc'
    };
    return styleMap[language] || 'jsdoc';
  }

  private extractSections(content: string): string[] {
    const sections: string[] = [];
    
    // Extract documented functions/classes
    const docPatterns = [
      /\/\*\*[\s\S]*?\*\/\s*(?:export\s+)?(?:async\s+)?(?:function|class|const)\s+(\w+)/g,
      /"""[\s\S]*?"""\s*def\s+(\w+)/g,
      /\/\/\/.*\n(?:pub\s+)?fn\s+(\w+)/g
    ];
    
    for (const pattern of docPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) sections.push(match[1]);
      }
    }
    
    return sections;
  }

  private cleanCodeResponse(response: string): string {
    let cleaned = response.trim();
    const codeBlockMatch = cleaned.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    }
    return cleaned.trim();
  }

  private cleanDocResponse(response: string, style: string): string {
    let cleaned = response.trim();
    
    if (style === 'markdown') {
      // Keep markdown as is but remove code block wrappers
      const mdMatch = cleaned.match(/```(?:markdown|md)?\n([\s\S]*?)```/);
      if (mdMatch) cleaned = mdMatch[1];
    } else {
      // For code documentation, extract just the comment
      const commentPatterns = [
        /\/\*\*[\s\S]*?\*\//,
        /"""[\s\S]*?"""/,
        /'''[\s\S]*?'''/,
        /\/\/\/[^\n]*/
      ];
      
      for (const pattern of commentPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
          cleaned = match[0];
          break;
        }
      }
    }
    
    return cleaned.trim();
  }
}

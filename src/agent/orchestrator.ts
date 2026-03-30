import * as vscode from 'vscode';
import { ProviderRouter, ChatMessage } from '../providers';
import { ContextManager } from '../context';
import { TestGenerator, DocGenerator, RefactorEngine, CodeAnalyzer } from '../generators';
import * as tools from '../tools';
import { Logger } from '../storage/logger';

export interface Task {
  id: string;
  type: 'create_file' | 'modify_file' | 'run_command' | 'analyze' | 'fix' | 'test' | 'document' | 'refactor';
  description: string;
  filePath?: string;
  content?: string;
  command?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export interface Plan {
  goal: string;
  tasks: Task[];
}

export class Orchestrator {
  private router: ProviderRouter;
  private logger: Logger;
  private contextManager: ContextManager;
  private testGenerator: TestGenerator;
  private docGenerator: DocGenerator;
  private refactorEngine: RefactorEngine;
  private codeAnalyzer: CodeAnalyzer;
  private onProgress?: (message: string) => void;
  private isIndexing = false;

  constructor(router: ProviderRouter, logger: Logger) {
    this.router = router;
    this.logger = logger;
    this.contextManager = new ContextManager();
    this.testGenerator = new TestGenerator(router, this.contextManager);
    this.docGenerator = new DocGenerator(router, this.contextManager);
    this.refactorEngine = new RefactorEngine(router, this.contextManager);
    this.codeAnalyzer = new CodeAnalyzer(router);
  }

  setProgressCallback(cb: (message: string) => void): void {
    this.onProgress = cb;
    this.contextManager.setProgressCallback((msg, progress) => {
      this.emit(`[Index ${Math.round(progress)}%] ${msg}`);
    });
  }

  private emit(message: string): void {
    this.logger.log(message);
    this.onProgress?.(message);
  }

  // ============ CONTEXT MANAGEMENT ============
  async indexProject(): Promise<string> {
    if (this.isIndexing) return 'Indexing already in progress...';
    
    this.isIndexing = true;
    this.emit('Starting project indexing...');
    
    try {
      await this.contextManager.initialize();
      const summary = this.contextManager.getSummary();
      this.emit('Indexing complete.');
      return summary;
    } finally {
      this.isIndexing = false;
    }
  }

  async refreshIndex(): Promise<string> {
    return this.indexProject();
  }

  getProjectSummary(): string {
    return this.contextManager.getSummary();
  }

  // ============ CHAT ============
  async chat(userMessage: string, history: ChatMessage[] = []): Promise<string> {
    const provider = await this.router.getProviderForTask('chat');
    
    // Build context if available
    const contextWindow = this.contextManager.buildContextWindow(userMessage);
    const contextInfo = this.contextManager.formatContextForPrompt(contextWindow);
    
    const systemContent = contextInfo 
      ? `You are Ben.AI, an expert coding assistant. Use this project context to provide relevant answers:\n\n${contextInfo}\n\nAnswer questions clearly and concisely.`
      : 'You are Ben.AI, an expert coding assistant. Answer questions about code clearly and concisely.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: userMessage }
    ];
    
    return provider.chat(messages);
  }

  async streamChat(
    userMessage: string,
    onChunk: (chunk: string) => void,
    history: ChatMessage[] = []
  ): Promise<void> {
    const provider = await this.router.getProviderForTask('chat');
    
    const contextWindow = this.contextManager.buildContextWindow(userMessage);
    const contextInfo = this.contextManager.formatContextForPrompt(contextWindow);
    
    const systemContent = contextInfo 
      ? `You are Ben.AI, an expert coding assistant.\n\nProject Context:\n${contextInfo}`
      : 'You are Ben.AI, an expert coding assistant.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: userMessage }
    ];
    
    await provider.streamChat(messages, onChunk);
  }

  // ============ FILE EDITING ============
  async editFile(filePath: string, instruction: string): Promise<void> {
    this.emit(`Reading ${filePath}...`);
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const provider = await this.router.getProviderForTask('code');
    
    const contextWindow = this.contextManager.buildContextWindow(instruction, filePath);
    const contextInfo = this.contextManager.formatContextForPrompt(contextWindow);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code editor. Return ONLY the complete new file content, no explanations, no markdown code blocks.
        
Project Context:
${contextInfo}`
      },
      {
        role: 'user',
        content: `File: ${filePath}\n\nCurrent content:\n${fileResult.output}\n\nInstruction: ${instruction}\n\nReturn the complete updated file content:`
      }
    ];

    this.emit(`Generating edit for ${filePath}...`);
    const newContent = await provider.chat(messages);
    await tools.diffPreview(filePath, newContent.trim());
  }

  // ============ TEST GENERATION ============
  async generateTests(filePath: string, options: { framework?: string; style?: string } = {}): Promise<string> {
    this.emit(`Generating tests for ${filePath}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const result = await this.testGenerator.generateTests(filePath, fileResult.output, {
      framework: options.framework as any,
      style: options.style as any
    });

    this.emit(`Generated ${result.testCount} tests`);
    
    // Write the test file
    await tools.writeFile(result.testFilePath, result.content);
    this.emit(`Test file created: ${result.testFilePath}`);
    
    return `Generated ${result.testCount} tests in ${result.testFilePath}`;
  }

  // ============ DOCUMENTATION ============
  async generateDocs(filePath: string, options: { style?: string; verbose?: boolean } = {}): Promise<string> {
    this.emit(`Generating documentation for ${filePath}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const result = await this.docGenerator.generateFileDoc(filePath, fileResult.output, {
      style: options.style as any,
      verbose: options.verbose
    });

    this.emit(`Documented ${result.sections.length} sections`);
    
    // Show diff preview
    await tools.diffPreview(filePath, result.content);
    
    return `Added documentation for ${result.sections.length} items`;
  }

  async generateReadme(): Promise<string> {
    this.emit('Generating README.md...');
    
    const context = this.contextManager.getProjectContext();
    if (!context) {
      await this.indexProject();
    }
    
    const summary = this.contextManager.getSummary();
    const readme = await this.docGenerator.generateReadme(summary);
    
    await tools.writeFile('README.md', readme);
    this.emit('README.md generated');
    
    return 'README.md generated successfully';
  }

  // ============ REFACTORING ============
  async refactorFile(
    filePath: string,
    options: { type?: string; targetName?: string; newName?: string } = {}
  ): Promise<string> {
    this.emit(`Refactoring ${filePath}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const result = await this.refactorEngine.refactorCode(filePath, fileResult.output, {
      type: options.type as any,
      targetName: options.targetName,
      newName: options.newName
    });

    const changesSummary = result.changes.map(c => `- ${c.description}`).join('\n');
    this.emit(`Refactoring complete. ${result.changes.length} changes.`);
    
    // Show diff preview
    await tools.diffPreview(filePath, result.refactored);
    
    return `Refactoring:\n${changesSummary}\n\nSuggestions:\n${result.suggestions.join('\n')}`;
  }

  async extractFunction(
    filePath: string,
    startLine: number,
    endLine: number,
    functionName: string
  ): Promise<string> {
    this.emit(`Extracting function ${functionName}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const lines = fileResult.output.split('\n');
    const selectedLines = lines.slice(startLine - 1, endLine);
    const selectionStart = lines.slice(0, startLine - 1).join('\n').length + 1;
    const selectionEnd = selectionStart + selectedLines.join('\n').length;
    
    const ext = filePath.split('.').pop() || 'ts';
    const language = ext === 'py' ? 'python' : 'typescript';

    const refactored = await this.refactorEngine.extractFunction(
      fileResult.output,
      selectionStart,
      selectionEnd,
      functionName,
      language
    );

    await tools.diffPreview(filePath, refactored);
    
    return `Function ${functionName} extracted`;
  }

  // ============ CODE ANALYSIS ============
  async analyzeFile(filePath: string): Promise<string> {
    this.emit(`Analyzing ${filePath}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const result = await this.codeAnalyzer.analyzeCode(filePath, fileResult.output);
    
    let output = `## Analysis: ${filePath}\n\n`;
    output += `**Summary:** ${result.summary}\n\n`;
    
    if (result.issues.length > 0) {
      output += `### Issues Found:\n`;
      for (const issue of result.issues) {
        const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : '💡';
        output += `${icon} ${issue.message}`;
        if (issue.line) output += ` (line ${issue.line})`;
        output += '\n';
      }
    } else {
      output += `✅ No issues found!\n`;
    }
    
    this.emit(`Analysis complete: ${result.issues.length} issues found`);
    return output;
  }

  async securityScan(filePath: string): Promise<string> {
    this.emit(`Security scan: ${filePath}...`);
    
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const ext = filePath.split('.').pop() || 'ts';
    const language = ext === 'py' ? 'python' : 'typescript';
    
    const issues = await this.codeAnalyzer.findSecurityIssues(fileResult.output, language);
    
    let output = `## Security Scan: ${filePath}\n\n`;
    
    if (issues.length > 0) {
      output += `Found ${issues.length} potential security issues:\n\n`;
      for (const issue of issues) {
        output += `🔒 **${issue.message}**`;
        if (issue.line) output += ` (line ${issue.line})`;
        if (issue.fix) output += `\n   Fix: ${issue.fix}`;
        output += '\n\n';
      }
    } else {
      output += `✅ No security issues detected!\n`;
    }
    
    this.emit(`Security scan complete: ${issues.length} issues`);
    return output;
  }

  async explainCode(filePath: string): Promise<string> {
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const ext = filePath.split('.').pop() || 'ts';
    const language = ext === 'py' ? 'python' : 'typescript';
    
    return this.codeAnalyzer.explainCode(fileResult.output, language);
  }

  // ============ PROJECT BUILD ============
  async buildProject(description: string): Promise<void> {
    this.emit('Planning project...');
    const plan = await this.planProject(description);
    this.emit(`Plan ready: ${plan.tasks.length} tasks`);

    for (const task of plan.tasks) {
      task.status = 'running';
      this.emit(`[${task.id}] ${task.description}`);
      try {
        await this.executeTask(task, description);
        task.status = 'done';
        this.emit(`[${task.id}] Done`);
      } catch (e) {
        task.status = 'failed';
        this.emit(`[${task.id}] Failed: ${String(e)}`);
        const fixed = await this.autoFix(task, String(e), description);
        if (!fixed) {
          this.emit(`[${task.id}] Could not auto-fix. Skipping.`);
        }
      }
    }
    
    // Index the new project
    this.emit('Indexing new project...');
    await this.indexProject();
    
    this.emit('Project build complete.');
  }

  private async planProject(description: string): Promise<Plan> {
    const provider = await this.router.getProviderForTask('plan');
    const schema = {
      goal: 'string',
      tasks: [{ id: 'string', type: 'string', description: 'string', filePath: 'string?', content: 'string?', command: 'string?' }]
    };
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a software architect. Given a project description, produce a detailed task plan as JSON.
Task types: create_file, modify_file, run_command, analyze, fix, test, document, refactor.
For create_file tasks, include the full file content in the 'content' field.
Create production-ready, well-structured code.`
      },
      { role: 'user', content: `Create a complete project plan for:\n\n${description}` }
    ];
    return provider.structuredOutput<Plan>(messages, schema);
  }

  private async executeTask(task: Task, context: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('ben-ai');
    const allowed = config.get<string[]>('allowedCommands', []);

    switch (task.type) {
      case 'create_file':
      case 'modify_file': {
        if (!task.filePath) throw new Error('No filePath');
        let content = task.content;
        if (!content) {
          const provider = await this.router.getProviderForTask('code');
          const messages: ChatMessage[] = [
            { role: 'system', content: 'You are an expert developer. Return ONLY the file content, no markdown.' },
            { role: 'user', content: `Project context: ${context}\n\nGenerate content for: ${task.filePath}\nTask: ${task.description}` }
          ];
          content = await provider.chat(messages);
        }
        await tools.writeFile(task.filePath, content.trim());
        break;
      }
      case 'run_command': {
        if (!task.command) throw new Error('No command');
        const result = await tools.runCommand(task.command, allowed);
        if (!result.success) throw new Error(result.error);
        break;
      }
      case 'test': {
        if (task.filePath) {
          await this.generateTests(task.filePath);
        }
        break;
      }
      case 'document': {
        if (task.filePath) {
          await this.generateDocs(task.filePath);
        }
        break;
      }
      case 'refactor': {
        if (task.filePath) {
          await this.refactorFile(task.filePath);
        }
        break;
      }
      case 'analyze': {
        const wsFiles = await tools.listFiles('.');
        this.emit(`Workspace:\n${wsFiles.output}`);
        break;
      }
    }
  }

  private async autoFix(task: Task, error: string, context: string): Promise<boolean> {
    if (!task.filePath) return false;
    const provider = await this.router.getProviderForTask('fix');
    const fileResult = await tools.readFile(task.filePath);
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a debugging expert. Fix the file and return ONLY the corrected content.' },
      {
        role: 'user',
        content: `File: ${task.filePath}\nError: ${error}\nContext: ${context}\n\nCurrent content:\n${fileResult.output}\n\nReturn fixed content:`
      }
    ];
    try {
      const fixed = await provider.chat(messages);
      await tools.writeFile(task.filePath, fixed.trim());
      this.emit(`Auto-fixed ${task.filePath}`);
      return true;
    } catch {
      return false;
    }
  }
}

import * as vscode from 'vscode';
import { ProviderRouter, ChatMessage } from '../providers';
import * as tools from '../tools';
import { Logger } from '../storage/logger';

export interface Task {
  id: string;
  type: 'create_file' | 'modify_file' | 'run_command' | 'analyze' | 'fix';
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
  private onProgress?: (message: string) => void;

  constructor(router: ProviderRouter, logger: Logger) {
    this.router = router;
    this.logger = logger;
  }

  setProgressCallback(cb: (message: string) => void): void {
    this.onProgress = cb;
  }

  private emit(message: string): void {
    this.logger.log(message);
    this.onProgress?.(message);
  }

  async chat(userMessage: string, history: ChatMessage[] = []): Promise<string> {
    const provider = await this.router.getProviderForTask('chat');
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an expert coding assistant. Answer questions about code clearly and concisely.' },
      ...history,
      { role: 'user', content: userMessage }
    ];
    return provider.chat(messages);
  }

  async editFile(filePath: string, instruction: string): Promise<void> {
    this.emit(`Reading ${filePath}...`);
    const fileResult = await tools.readFile(filePath);
    if (!fileResult.success) throw new Error(`Cannot read file: ${fileResult.error}`);

    const provider = await this.router.getProviderForTask('code');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are an expert code editor. Return ONLY the complete new file content, no explanations, no markdown code blocks.'
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
Task types: create_file, modify_file, run_command, analyze, fix.
For create_file tasks, include the full file content in the 'content' field.`
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

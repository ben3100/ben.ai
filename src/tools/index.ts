import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

function workspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw new Error('No workspace open');
  return folders[0].uri.fsPath;
}

export async function readFile(filePath: string): Promise<ToolResult> {
  try {
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot(), filePath);
    const content = fs.readFileSync(absolute, 'utf8');
    return { success: true, output: content };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function writeFile(filePath: string, content: string): Promise<ToolResult> {
  try {
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot(), filePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, 'utf8');
    return { success: true, output: `Written: ${filePath}` };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function deleteFile(filePath: string, confirm = true): Promise<ToolResult> {
  try {
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot(), filePath);
    if (confirm) {
      const answer = await vscode.window.showWarningMessage(
        `Ben.AI wants to delete: ${filePath}`,
        { modal: true },
        'Delete',
        'Cancel'
      );
      if (answer !== 'Delete') return { success: false, output: 'Cancelled by user' };
    }
    fs.unlinkSync(absolute);
    return { success: true, output: `Deleted: ${filePath}` };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function listFiles(dirPath = '.'): Promise<ToolResult> {
  try {
    const absolute = path.isAbsolute(dirPath) ? dirPath : path.join(workspaceRoot(), dirPath);
    const walk = (dir: string, prefix = ''): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const results: string[] = [];
      for (const entry of entries) {
        if (['node_modules', '.git', 'dist', '__pycache__'].includes(entry.name)) continue;
        if (entry.isDirectory()) {
          results.push(`${prefix}${entry.name}/`);
          results.push(...walk(path.join(dir, entry.name), `${prefix}  `));
        } else {
          results.push(`${prefix}${entry.name}`);
        }
      }
      return results;
    };
    return { success: true, output: walk(absolute).join('\n') };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function searchWorkspace(query: string, glob = '**/*'): Promise<ToolResult> {
  try {
    const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 50);
    const results: string[] = [];
    for (const uri of uris) {
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const lines = content.split('\n');
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              results.push(`${vscode.workspace.asRelativePath(uri)}:${i + 1}: ${line.trim()}`);
            }
          });
        }
      } catch {}
    }
    return { success: true, output: results.join('\n') || 'No matches found' };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function runCommand(command: string, allowedCommands: string[]): Promise<ToolResult> {
  const base = command.trim().split(' ')[0];
  if (!allowedCommands.includes(base)) {
    return { success: false, output: '', error: `Command '${base}' is not whitelisted.` };
  }
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot(), timeout: 60000 });
    return { success: true, output: stdout + (stderr ? `\nSTDERR: ${stderr}` : '') };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { success: false, output: err.stdout ?? '', error: err.stderr ?? err.message ?? String(e) };
  }
}

export async function diffPreview(filePath: string, newContent: string): Promise<ToolResult> {
  try {
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot(), filePath);
    const tmpPath = absolute + '.ben-ai-preview';
    fs.writeFileSync(tmpPath, newContent, 'utf8');
    const originalUri = vscode.Uri.file(absolute);
    const previewUri = vscode.Uri.file(tmpPath);
    await vscode.commands.executeCommand('vscode.diff', originalUri, previewUri, `Ben.AI: ${path.basename(filePath)} (preview)`);
    const answer = await vscode.window.showInformationMessage('Apply these changes?', 'Apply', 'Discard');
    fs.unlinkSync(tmpPath);
    if (answer === 'Apply') {
      fs.writeFileSync(absolute, newContent, 'utf8');
      return { success: true, output: 'Changes applied.' };
    }
    return { success: false, output: 'Changes discarded by user.' };
  } catch (e) {
    return { success: false, output: '', error: String(e) };
  }
}

export async function gitStatus(): Promise<ToolResult> {
  return runCommand('git status --short', ['git']);
}

import * as vscode from 'vscode';
import { Orchestrator } from '../agent';
import { SecureStorage } from '../storage';

export function registerCommands(
  context: vscode.ExtensionContext,
  orchestrator: Orchestrator,
  storage: SecureStorage
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ben-ai.chat', async () => {
      const input = await vscode.window.showInputBox({ prompt: 'Ask Ben.AI anything about your code...' });
      if (!input) return;
      try {
        const answer = await orchestrator.chat(input);
        const doc = await vscode.workspace.openTextDocument({ content: answer, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
      }
    }),

    vscode.commands.registerCommand('ben-ai.edit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to edit.');
        return;
      }
      const instruction = await vscode.window.showInputBox({ prompt: 'What should Ben.AI change in this file?' });
      if (!instruction) return;
      try {
        await orchestrator.editFile(vscode.workspace.asRelativePath(editor.document.uri), instruction);
      } catch (e) {
        vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
      }
    }),

    vscode.commands.registerCommand('ben-ai.buildProject', async () => {
      const description = await vscode.window.showInputBox({
        prompt: 'Describe the project you want Ben.AI to build...',
        placeHolder: 'e.g. A REST API with Express and TypeScript that manages a todo list'
      });
      if (!description) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Building project...', cancellable: false },
        async () => {
          try {
            await orchestrator.buildProject(description);
            vscode.window.showInformationMessage('Ben.AI: Project build complete.');
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('ben-ai.setApiKey', async () => {
      const provider = await vscode.window.showQuickPick(['openai', 'anthropic'], { placeHolder: 'Select provider' });
      if (!provider) return;
      const key = await vscode.window.showInputBox({
        prompt: `Enter your ${provider} API key`,
        password: true
      });
      if (!key) return;
      await storage.set(`${provider}-key`, key);
      vscode.window.showInformationMessage(`Ben.AI: ${provider} API key saved.`);
    }),

    vscode.commands.registerCommand('ben-ai.showPanel', () => {
      vscode.commands.executeCommand('ben-ai.sidebarView.focus');
    })
  );
}

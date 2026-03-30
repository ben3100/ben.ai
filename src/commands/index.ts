import * as vscode from 'vscode';
import { Orchestrator } from '../agent';
import { SecureStorage } from '../storage';

export function registerCommands(
  context: vscode.ExtensionContext,
  orchestrator: Orchestrator,
  storage: SecureStorage
): void {
  context.subscriptions.push(
    // ============ CHAT ============
    vscode.commands.registerCommand('ben-ai.chat', async () => {
      const input = await vscode.window.showInputBox({ 
        prompt: 'Ask Ben.AI anything about your code...',
        placeHolder: 'e.g., How does this function work?'
      });
      if (!input) return;
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Thinking...' },
        async () => {
          try {
            const answer = await orchestrator.chat(input);
            const doc = await vscode.workspace.openTextDocument({ content: answer, language: 'markdown' });
            await vscode.window.showTextDocument(doc);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ EDIT FILE ============
    vscode.commands.registerCommand('ben-ai.edit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file to edit.');
        return;
      }
      
      const instruction = await vscode.window.showInputBox({ 
        prompt: 'What should Ben.AI change in this file?',
        placeHolder: 'e.g., Add error handling, refactor this function...'
      });
      if (!instruction) return;
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Editing...', cancellable: false },
        async () => {
          try {
            await orchestrator.editFile(vscode.workspace.asRelativePath(editor.document.uri), instruction);
            vscode.window.showInformationMessage('Ben.AI: Check the diff preview.');
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ BUILD PROJECT ============
    vscode.commands.registerCommand('ben-ai.buildProject', async () => {
      const description = await vscode.window.showInputBox({
        prompt: 'Describe the project you want Ben.AI to build...',
        placeHolder: 'e.g., A REST API with Express and TypeScript that manages a todo list'
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

    // ============ GENERATE TESTS ============
    vscode.commands.registerCommand('ben-ai.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      const framework = await vscode.window.showQuickPick(
        ['jest', 'vitest', 'mocha', 'pytest', 'unittest'],
        { placeHolder: 'Select test framework (or press Enter for auto-detect)' }
      );
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Generating tests...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.generateTests(
              vscode.workspace.asRelativePath(editor.document.uri),
              { framework }
            );
            vscode.window.showInformationMessage(`Ben.AI: ${result}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ GENERATE DOCS ============
    vscode.commands.registerCommand('ben-ai.generateDocs', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Generating docs...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.generateDocs(
              vscode.workspace.asRelativePath(editor.document.uri)
            );
            vscode.window.showInformationMessage(`Ben.AI: ${result}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ GENERATE README ============
    vscode.commands.registerCommand('ben-ai.generateReadme', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Generating README...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.generateReadme();
            vscode.window.showInformationMessage(`Ben.AI: ${result}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ REFACTOR ============
    vscode.commands.registerCommand('ben-ai.refactor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      const refactorType = await vscode.window.showQuickPick(
        [
          { label: 'Full Refactor', value: 'full', description: 'Complete code improvement' },
          { label: 'Simplify', value: 'simplify', description: 'Remove redundancy, cleaner code' },
          { label: 'Modernize', value: 'modernize', description: 'Use modern language features' },
          { label: 'Optimize', value: 'optimize', description: 'Improve performance' },
          { label: 'Clean', value: 'clean', description: 'Style and formatting' }
        ],
        { placeHolder: 'Select refactoring type' }
      );
      if (!refactorType) return;
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Refactoring...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.refactorFile(
              vscode.workspace.asRelativePath(editor.document.uri),
              { type: refactorType.value }
            );
            const doc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ EXTRACT FUNCTION ============
    vscode.commands.registerCommand('ben-ai.extractFunction', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage('Please select code to extract.');
        return;
      }
      
      const functionName = await vscode.window.showInputBox({
        prompt: 'Enter the new function name',
        placeHolder: 'e.g., calculateTotal'
      });
      if (!functionName) return;
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Extracting function...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.extractFunction(
              vscode.workspace.asRelativePath(editor.document.uri),
              selection.start.line + 1,
              selection.end.line + 1,
              functionName
            );
            vscode.window.showInformationMessage(`Ben.AI: ${result}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ ANALYZE FILE ============
    vscode.commands.registerCommand('ben-ai.analyze', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Analyzing...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.analyzeFile(
              vscode.workspace.asRelativePath(editor.document.uri)
            );
            const doc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ SECURITY SCAN ============
    vscode.commands.registerCommand('ben-ai.securityScan', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Security scan...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.securityScan(
              vscode.workspace.asRelativePath(editor.document.uri)
            );
            const doc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ EXPLAIN CODE ============
    vscode.commands.registerCommand('ben-ai.explain', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active file.');
        return;
      }
      
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Explaining...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.explainCode(
              vscode.workspace.asRelativePath(editor.document.uri)
            );
            const doc = await vscode.workspace.openTextDocument({ content: result, language: 'markdown' });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ INDEX PROJECT ============
    vscode.commands.registerCommand('ben-ai.indexProject', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ben.AI: Indexing project...', cancellable: false },
        async () => {
          try {
            const result = await orchestrator.indexProject();
            vscode.window.showInformationMessage(`Ben.AI: Index complete!\n${result}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Ben.AI: ${String(e)}`);
          }
        }
      );
    }),

    // ============ SET API KEY ============
    vscode.commands.registerCommand('ben-ai.setApiKey', async () => {
      const provider = await vscode.window.showQuickPick(
        [
          { label: 'OpenAI', value: 'openai', description: 'GPT-4, GPT-3.5, etc.' },
          { label: 'Anthropic', value: 'anthropic', description: 'Claude models' }
        ],
        { placeHolder: 'Select provider' }
      );
      if (!provider) return;
      
      const key = await vscode.window.showInputBox({
        prompt: `Enter your ${provider.label} API key`,
        password: true,
        placeHolder: 'sk-...'
      });
      if (!key) return;
      
      await storage.set(`${provider.value}-key`, key);
      vscode.window.showInformationMessage(`Ben.AI: ${provider.label} API key saved. Reload the window to apply.`);
    }),

    // ============ SHOW PANEL ============
    vscode.commands.registerCommand('ben-ai.showPanel', () => {
      vscode.commands.executeCommand('ben-ai.sidebarView.focus');
    })
  );
}

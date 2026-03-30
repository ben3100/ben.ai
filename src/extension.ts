import * as vscode from 'vscode';
import { ProviderRouter } from './providers';
import { Orchestrator } from './agent';
import { SecureStorage, Logger } from './storage';
import { SidebarProvider } from './ui';
import { registerCommands } from './commands';

let logger: Logger;
let orchestrator: Orchestrator;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger('Ben.AI');
  logger.log('Ben.AI v0.2.0 activating...');

  const storage = new SecureStorage(context.secrets);
  const router = new ProviderRouter(storage);
  await router.initialize();

  orchestrator = new Orchestrator(router, logger);

  const sidebarProvider = new SidebarProvider(orchestrator);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  registerCommands(context, orchestrator, storage);

  // Auto-index if enabled
  const config = vscode.workspace.getConfiguration('ben-ai');
  if (config.get<boolean>('autoIndex', false)) {
    logger.log('Auto-indexing project...');
    orchestrator.indexProject().then(() => {
      logger.log('Auto-index complete.');
    }).catch((e) => {
      logger.log(`Auto-index failed: ${String(e)}`);
    });
  }

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(hubot) Ben.AI';
  statusBarItem.tooltip = 'Click to open Ben.AI panel';
  statusBarItem.command = 'ben-ai.showPanel';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  logger.log('Ben.AI ready. Open the sidebar to start chatting!');
  logger.show();
}

export function deactivate(): void {
  logger?.dispose();
}

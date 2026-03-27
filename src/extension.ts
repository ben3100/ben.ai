import * as vscode from 'vscode';
import { ProviderRouter } from './providers';
import { Orchestrator } from './agent';
import { SecureStorage, Logger } from './storage';
import { SidebarProvider } from './ui';
import { registerCommands } from './commands';

let logger: Logger;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger('Ben.AI');
  logger.log('Ben.AI activating...');

  const storage = new SecureStorage(context.secrets);
  const router = new ProviderRouter(storage);
  await router.initialize();

  const orchestrator = new Orchestrator(router, logger);

  const sidebarProvider = new SidebarProvider(orchestrator);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  registerCommands(context, orchestrator, storage);

  logger.log('Ben.AI ready.');
  logger.show();
}

export function deactivate(): void {
  logger?.dispose();
}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Logger {
  private outputChannel: vscode.OutputChannel;
  private logFile?: string;

  constructor(channelName: string, logFile?: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
    this.logFile = logFile;
  }

  log(message: string): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}`;
    this.outputChannel.appendLine(line);
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line + '\n');
      } catch {}
    }
  }

  show(): void {
    this.outputChannel.show(true);
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

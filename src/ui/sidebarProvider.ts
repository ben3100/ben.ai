import * as vscode from 'vscode';
import { Orchestrator } from '../agent';
import { ChatMessage } from '../providers';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ben-ai.sidebarView';
  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private orchestrator: Orchestrator;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
    this.orchestrator.setProgressCallback((msg) => {
      this.postMessage({ type: 'progress', text: msg });
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; text?: string; mode?: string }) => {
      if (message.type === 'send') {
        const text = message.text ?? '';
        const mode = message.mode ?? 'chat';
        this.postMessage({ type: 'user', text });

        try {
          if (mode === 'chat') {
            this.history.push({ role: 'user', content: text });
            const reply = await this.orchestrator.chat(text, this.history);
            this.history.push({ role: 'assistant', content: reply });
            this.postMessage({ type: 'assistant', text: reply });
          } else if (mode === 'edit') {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { this.postMessage({ type: 'error', text: 'No active file.' }); return; }
            await this.orchestrator.editFile(vscode.workspace.asRelativePath(editor.document.uri), text);
            this.postMessage({ type: 'assistant', text: 'Edit applied.' });
          } else if (mode === 'build') {
            this.postMessage({ type: 'assistant', text: 'Building project...' });
            await this.orchestrator.buildProject(text);
            this.postMessage({ type: 'assistant', text: 'Project build complete.' });
          }
        } catch (e) {
          this.postMessage({ type: 'error', text: String(e) });
        }
      }

      if (message.type === 'clear') {
        this.history = [];
        this.postMessage({ type: 'cleared' });
      }
    });
  }

  private postMessage(data: object): void {
    this.view?.webview.postMessage(data);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; }
  #messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .msg { padding: 8px 10px; border-radius: 6px; max-width: 95%; word-wrap: break-word; white-space: pre-wrap; }
  .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
  .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); align-self: flex-start; }
  .error { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); align-self: flex-start; }
  .progress { color: var(--vscode-descriptionForeground); font-size: 11px; align-self: flex-start; font-style: italic; }
  #controls { padding: 8px; border-top: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; gap: 6px; }
  #mode-bar { display: flex; gap: 4px; }
  .mode-btn { flex: 1; padding: 4px; border: 1px solid var(--vscode-panel-border); background: transparent; color: var(--vscode-foreground); cursor: pointer; border-radius: 4px; font-size: 11px; }
  .mode-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  #input-row { display: flex; gap: 4px; }
  #input { flex: 1; padding: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; resize: none; font-family: inherit; font-size: 12px; }
  #send { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
  #send:hover { background: var(--vscode-button-hoverBackground); }
  #clear { font-size: 10px; color: var(--vscode-descriptionForeground); background: transparent; border: none; cursor: pointer; text-align: right; }
</style>
</head>
<body>
<div id="messages"></div>
<div id="controls">
  <div id="mode-bar">
    <button class="mode-btn active" data-mode="chat">Chat</button>
    <button class="mode-btn" data-mode="edit">Edit</button>
    <button class="mode-btn" data-mode="build">Build</button>
  </div>
  <div id="input-row">
    <textarea id="input" rows="3" placeholder="Ask Ben.AI..."></textarea>
    <button id="send">Send</button>
  </div>
  <button id="clear">Clear history</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let mode = 'chat';
  const messages = document.getElementById('messages');
  const input = document.getElementById('input');

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode;
    });
  });

  document.getElementById('send').addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));

  function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    vscode.postMessage({ type: 'send', text, mode });
  }

  function addMsg(cls, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'user') addMsg('user', msg.text);
    else if (msg.type === 'assistant') addMsg('assistant', msg.text);
    else if (msg.type === 'error') addMsg('error', '⚠ ' + msg.text);
    else if (msg.type === 'progress') addMsg('progress', '⟳ ' + msg.text);
    else if (msg.type === 'cleared') messages.innerHTML = '';
  });
</script>
</body>
</html>`;
  }
}

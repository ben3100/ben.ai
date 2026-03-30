import * as vscode from 'vscode';
import { Orchestrator } from '../agent';
import { ChatMessage } from '../providers';

interface WebviewMessage {
  type: string;
  text?: string;
  mode?: string;
  filePath?: string;
  options?: Record<string, unknown>;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ben-ai.sidebarView';
  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private orchestrator: Orchestrator;
  private isStreaming = false;

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

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    const text = message.text ?? '';
    
    switch (message.type) {
      case 'send':
        await this.handleSend(text, message.mode || 'chat');
        break;
      case 'clear':
        this.history = [];
        this.postMessage({ type: 'cleared' });
        break;
      case 'index':
        await this.handleIndex();
        break;
      case 'analyze':
        await this.handleAnalyze(message.filePath);
        break;
      case 'test':
        await this.handleTest(message.filePath, message.options);
        break;
      case 'docs':
        await this.handleDocs(message.filePath, message.options);
        break;
      case 'refactor':
        await this.handleRefactor(message.filePath, message.options);
        break;
      case 'security':
        await this.handleSecurity(message.filePath);
        break;
      case 'explain':
        await this.handleExplain(message.filePath);
        break;
      case 'readme':
        await this.handleReadme();
        break;
      case 'getFile':
        this.sendCurrentFile();
        break;
      case 'stopStream':
        this.isStreaming = false;
        break;
    }
  }

  private async handleSend(text: string, mode: string): Promise<void> {
    this.postMessage({ type: 'user', text });

    try {
      switch (mode) {
        case 'chat':
          this.history.push({ role: 'user', content: text });
          this.isStreaming = true;
          this.postMessage({ type: 'streamStart' });
          
          let fullResponse = '';
          await this.orchestrator.streamChat(text, (chunk) => {
            if (!this.isStreaming) return;
            fullResponse += chunk;
            this.postMessage({ type: 'streamChunk', text: chunk });
          }, this.history);
          
          this.history.push({ role: 'assistant', content: fullResponse });
          this.postMessage({ type: 'streamEnd' });
          this.isStreaming = false;
          break;

        case 'edit':
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            this.postMessage({ type: 'error', text: 'No active file.' });
            return;
          }
          await this.orchestrator.editFile(vscode.workspace.asRelativePath(editor.document.uri), text);
          this.postMessage({ type: 'assistant', text: '✅ Edit applied. Check the diff preview.' });
          break;

        case 'build':
          this.postMessage({ type: 'assistant', text: '🚀 Building project...' });
          await this.orchestrator.buildProject(text);
          this.postMessage({ type: 'assistant', text: '✅ Project build complete!' });
          break;
      }
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
      this.isStreaming = false;
    }
  }

  private async handleIndex(): Promise<void> {
    try {
      this.postMessage({ type: 'assistant', text: '📂 Indexing project...' });
      const summary = await this.orchestrator.indexProject();
      this.postMessage({ type: 'assistant', text: `✅ Index complete!\n\n${summary}` });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleAnalyze(filePath?: string): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `🔍 Analyzing ${path}...` });
      const result = await this.orchestrator.analyzeFile(path);
      this.postMessage({ type: 'assistant', text: result });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleTest(filePath?: string, options?: Record<string, unknown>): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `🧪 Generating tests for ${path}...` });
      const result = await this.orchestrator.generateTests(path, options as any);
      this.postMessage({ type: 'assistant', text: `✅ ${result}` });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleDocs(filePath?: string, options?: Record<string, unknown>): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `📝 Generating docs for ${path}...` });
      const result = await this.orchestrator.generateDocs(path, options as any);
      this.postMessage({ type: 'assistant', text: `✅ ${result}` });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleRefactor(filePath?: string, options?: Record<string, unknown>): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `🔧 Refactoring ${path}...` });
      const result = await this.orchestrator.refactorFile(path, options as any);
      this.postMessage({ type: 'assistant', text: `✅ Refactoring complete!\n\n${result}` });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleSecurity(filePath?: string): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `🔒 Security scan: ${path}...` });
      const result = await this.orchestrator.securityScan(path);
      this.postMessage({ type: 'assistant', text: result });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleExplain(filePath?: string): Promise<void> {
    try {
      const path = filePath || this.getCurrentFilePath();
      if (!path) {
        this.postMessage({ type: 'error', text: 'No file selected.' });
        return;
      }
      this.postMessage({ type: 'assistant', text: `💡 Explaining ${path}...` });
      const result = await this.orchestrator.explainCode(path);
      this.postMessage({ type: 'assistant', text: result });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private async handleReadme(): Promise<void> {
    try {
      this.postMessage({ type: 'assistant', text: '📄 Generating README...' });
      const result = await this.orchestrator.generateReadme();
      this.postMessage({ type: 'assistant', text: `✅ ${result}` });
    } catch (e) {
      this.postMessage({ type: 'error', text: String(e) });
    }
  }

  private getCurrentFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      return vscode.workspace.asRelativePath(editor.document.uri);
    }
    return undefined;
  }

  private sendCurrentFile(): void {
    const path = this.getCurrentFilePath();
    this.postMessage({ type: 'currentFile', filePath: path || null });
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
:root {
  --bg-primary: var(--vscode-sideBar-background);
  --bg-secondary: var(--vscode-editor-background);
  --bg-tertiary: var(--vscode-input-background);
  --text-primary: var(--vscode-foreground);
  --text-secondary: var(--vscode-descriptionForeground);
  --accent: var(--vscode-button-background);
  --accent-hover: var(--vscode-button-hoverBackground);
  --accent-text: var(--vscode-button-foreground);
  --border: var(--vscode-panel-border);
  --error-bg: var(--vscode-inputValidation-errorBackground);
  --error-border: var(--vscode-inputValidation-errorBorder);
  --success: #4caf50;
  --warning: #ff9800;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--vscode-font-family);
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header */
.header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.header-status {
  font-size: 10px;
  color: var(--text-secondary);
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 10px;
}

/* Toolbar */
.toolbar {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tool-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.tool-btn.primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

/* Messages */
#messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg {
  padding: 10px 12px;
  border-radius: 8px;
  max-width: 95%;
  word-wrap: break-word;
  white-space: pre-wrap;
  line-height: 1.5;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg.user {
  background: var(--accent);
  color: var(--accent-text);
  align-self: flex-end;
  border-bottom-right-radius: 2px;
}

.msg.assistant {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  align-self: flex-start;
  border-bottom-left-radius: 2px;
}

.msg.error {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  align-self: flex-start;
}

.msg.progress {
  color: var(--text-secondary);
  font-size: 11px;
  align-self: flex-start;
  font-style: italic;
  padding: 4px 8px;
  background: transparent;
}

.msg.system {
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
  align-self: center;
  background: var(--bg-tertiary);
  border-radius: 12px;
  padding: 4px 12px;
}

/* Streaming indicator */
.streaming-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 50%;
  animation: pulse 1s infinite;
  margin-left: 4px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Mode Tabs */
.mode-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.mode-tab {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.mode-tab:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.mode-tab.active {
  color: var(--accent-text);
  background: var(--accent);
}

.mode-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
}

/* Input Area */
#controls {
  padding: 8px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-wrapper {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

#input {
  flex: 1;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
  min-height: 40px;
  max-height: 120px;
  transition: border-color 0.15s ease;
}

#input:focus {
  outline: none;
  border-color: var(--accent);
}

#input::placeholder {
  color: var(--text-secondary);
}

#send {
  padding: 10px 16px;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

#send:hover {
  background: var(--accent-hover);
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#clear {
  font-size: 11px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

#clear:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.current-file {
  font-size: 10px;
  color: var(--text-secondary);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  text-align: center;
  padding: 20px;
}

.empty-state-icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state-text {
  font-size: 12px;
  line-height: 1.6;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>
</head>
<body>

<div class="header">
  <span class="header-title">🤖 Ben.AI</span>
  <span class="header-status" id="status">Ready</span>
</div>

<div class="toolbar">
  <button class="tool-btn primary" onclick="indexProject()" title="Index project for better context">
    📂 Index
  </button>
  <button class="tool-btn" onclick="analyzeFile()" title="Analyze current file">
    🔍 Analyze
  </button>
  <button class="tool-btn" onclick="generateTests()" title="Generate tests">
    🧪 Test
  </button>
  <button class="tool-btn" onclick="generateDocs()" title="Generate documentation">
    📝 Docs
  </button>
  <button class="tool-btn" onclick="refactorFile()" title="Refactor code">
    🔧 Refactor
  </button>
  <button class="tool-btn" onclick="securityScan()" title="Security scan">
    🔒 Security
  </button>
  <button class="tool-btn" onclick="explainCode()" title="Explain code">
    💡 Explain
  </button>
  <button class="tool-btn" onclick="generateReadme()" title="Generate README">
    📄 README
  </button>
</div>

<div class="mode-tabs">
  <button class="mode-tab active" data-mode="chat">💬 Chat</button>
  <button class="mode-tab" data-mode="edit">✏️ Edit</button>
  <button class="mode-tab" data-mode="build">🚀 Build</button>
</div>

<div id="messages">
  <div class="empty-state" id="emptyState">
    <div class="empty-state-icon">🤖</div>
    <div class="empty-state-text">
      Welcome to Ben.AI!<br/>
      Ask me anything about your code,<br/>
      or use the tools above to get started.
    </div>
  </div>
</div>

<div id="controls">
  <div class="input-wrapper">
    <textarea id="input" rows="2" placeholder="Ask Ben.AI anything..."></textarea>
    <button id="send">Send</button>
  </div>
  <div class="footer-actions">
    <button id="clear">🗑️ Clear</button>
    <span class="current-file" id="currentFile"></span>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let mode = 'chat';
let isStreaming = false;
let streamingDiv = null;

const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const emptyState = document.getElementById('emptyState');
const status = document.getElementById('status');
const currentFileEl = document.getElementById('currentFile');

// Mode tabs
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mode = tab.dataset.mode;
    updatePlaceholder();
  });
});

function updatePlaceholder() {
  const placeholders = {
    chat: 'Ask Ben.AI anything...',
    edit: 'Describe what to change in the active file...',
    build: 'Describe the project to build...'
  };
  input.placeholder = placeholders[mode] || placeholders.chat;
}

// Send
sendBtn.addEventListener('click', send);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

function send() {
  const text = input.value.trim();
  if (!text || isStreaming) return;
  input.value = '';
  hideEmptyState();
  vscode.postMessage({ type: 'send', text, mode });
}

// Clear
document.getElementById('clear').addEventListener('click', () => {
  vscode.postMessage({ type: 'clear' });
});

// Tool buttons
function indexProject() { hideEmptyState(); vscode.postMessage({ type: 'index' }); }
function analyzeFile() { hideEmptyState(); vscode.postMessage({ type: 'analyze' }); }
function generateTests() { hideEmptyState(); vscode.postMessage({ type: 'test' }); }
function generateDocs() { hideEmptyState(); vscode.postMessage({ type: 'docs' }); }
function refactorFile() { hideEmptyState(); vscode.postMessage({ type: 'refactor' }); }
function securityScan() { hideEmptyState(); vscode.postMessage({ type: 'security' }); }
function explainCode() { hideEmptyState(); vscode.postMessage({ type: 'explain' }); }
function generateReadme() { hideEmptyState(); vscode.postMessage({ type: 'readme' }); }

function hideEmptyState() {
  if (emptyState) emptyState.style.display = 'none';
}

function addMsg(cls, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setStatus(text, type = 'normal') {
  status.textContent = text;
  status.style.background = type === 'active' ? 'var(--accent)' : 
                            type === 'error' ? 'var(--error-bg)' : 'var(--bg-tertiary)';
  status.style.color = type === 'active' ? 'var(--accent-text)' : 'var(--text-secondary)';
}

// Message handler
window.addEventListener('message', e => {
  const msg = e.data;
  
  switch(msg.type) {
    case 'user':
      hideEmptyState();
      addMsg('user', msg.text);
      break;
      
    case 'assistant':
      hideEmptyState();
      addMsg('assistant', msg.text);
      setStatus('Ready');
      break;
      
    case 'error':
      addMsg('error', '⚠️ ' + msg.text);
      setStatus('Error', 'error');
      break;
      
    case 'progress':
      addMsg('progress', '⟳ ' + msg.text);
      setStatus('Working...', 'active');
      break;
      
    case 'streamStart':
      isStreaming = true;
      sendBtn.disabled = true;
      setStatus('Streaming...', 'active');
      streamingDiv = document.createElement('div');
      streamingDiv.className = 'msg assistant';
      streamingDiv.innerHTML = '<span class="streaming-indicator"></span>';
      messages.appendChild(streamingDiv);
      messages.scrollTop = messages.scrollHeight;
      break;
      
    case 'streamChunk':
      if (streamingDiv) {
        const indicator = streamingDiv.querySelector('.streaming-indicator');
        if (indicator) indicator.remove();
        streamingDiv.textContent += msg.text;
        messages.scrollTop = messages.scrollHeight;
      }
      break;
      
    case 'streamEnd':
      isStreaming = false;
      sendBtn.disabled = false;
      streamingDiv = null;
      setStatus('Ready');
      break;
      
    case 'cleared':
      messages.innerHTML = '';
      emptyState.style.display = 'flex';
      messages.appendChild(emptyState);
      setStatus('Ready');
      break;
      
    case 'currentFile':
      currentFileEl.textContent = msg.filePath ? '📄 ' + msg.filePath : '';
      break;
  }
});

// Request current file on load
vscode.postMessage({ type: 'getFile' });

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});
</script>
</body>
</html>`;
  }
}

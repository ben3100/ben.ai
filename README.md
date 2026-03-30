# Ben.AI — Multi-Agent Coding Assistant

> 🤖 A powerful VS Code extension that uses AI to help you write, test, document, and refactor code automatically.

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## ✨ Features

### 💬 Intelligent Chat
- Context-aware conversations about your codebase
- Streaming responses for real-time feedback
- Project-wide understanding through automatic indexing

### 🧪 Test Generation
- Generate comprehensive unit tests automatically
- Supports Jest, Vitest, Mocha, Pytest, and more
- Includes edge cases and error handling

### 📝 Documentation Generation
- JSDoc/TSDoc for JavaScript/TypeScript
- Docstrings for Python
- README generation for your entire project

### 🔧 Code Refactoring
- Simplify complex code
- Modernize to latest language features
- Extract functions from selected code
- Full project refactoring

### 🔍 Code Analysis
- Find bugs and potential issues
- Security vulnerability scanning
- Performance suggestions
- Code explanations

### 🚀 Project Building
- Describe a project and let Ben.AI build it
- Automatic error fixing during generation
- Smart task planning and execution

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Ben.AI"
4. Click Install

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/ben-belaouedj/ben-ai.git
cd ben-ai

# Install dependencies
npm install

# Compile
npm run compile

# Package
npx vsce package

# Install the .vsix file in VS Code
```

## ⚙️ Configuration

### AI Providers

Ben.AI supports three AI providers:

1. **Ollama** (Default, Free, Local)
   - Install Ollama: https://ollama.ai
   - Pull a model: `ollama pull codellama`
   - No API key needed!

2. **OpenAI** (Paid)
   - Get API key from https://platform.openai.com
   - Run command: `Ben.AI: Set API Key` → OpenAI

3. **Anthropic Claude** (Paid)
   - Get API key from https://console.anthropic.com
   - Run command: `Ben.AI: Set API Key` → Anthropic

### Settings

```json
{
  "ben-ai.provider": "ollama",           // Default provider
  "ben-ai.ollamaUrl": "http://localhost:11434",
  "ben-ai.ollamaModel": "codellama",
  "ben-ai.openaiModel": "gpt-4o-mini",
  "ben-ai.anthropicModel": "claude-3-haiku-20240307",
  "ben-ai.maxContextTokens": 8000,
  "ben-ai.autoIndex": false,
  "ben-ai.streamResponses": true
}
```

## 🎯 Usage

### Sidebar Panel
Click the Ben.AI icon in the activity bar to open the sidebar panel with:
- Chat interface
- Quick tool buttons
- Mode selection (Chat/Edit/Build)

### Commands (Ctrl+Shift+P)
| Command | Description |
|---------|-------------|
| `Ben.AI: Chat` | Ask anything about your code |
| `Ben.AI: Edit Active File` | Modify current file with AI |
| `Ben.AI: Build Project` | Create a new project from description |
| `Ben.AI: Generate Tests` | Create tests for current file |
| `Ben.AI: Generate Documentation` | Add docs to current file |
| `Ben.AI: Generate README` | Create project README |
| `Ben.AI: Refactor Code` | Improve current file |
| `Ben.AI: Extract Function` | Extract selected code to function |
| `Ben.AI: Analyze File` | Find issues in current file |
| `Ben.AI: Security Scan` | Find security vulnerabilities |
| `Ben.AI: Explain Code` | Get explanation of current file |
| `Ben.AI: Index Project` | Index project for better context |
| `Ben.AI: Set API Key` | Configure API keys |

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Open chat |
| `Ctrl+Shift+E` | Edit current file |

### Context Menu
Right-click in the editor to access Ben.AI actions directly.

## 🏗️ Architecture

```
src/
├── agent/           # Orchestration logic
│   ├── orchestrator.ts    # Main coordinator
│   └── index.ts
├── context/         # Project indexing
│   ├── projectIndexer.ts  # File & symbol indexing
│   ├── contextManager.ts  # Context building
│   └── types.ts
├── generators/      # Code generation
│   ├── testGenerator.ts   # Test creation
│   ├── docGenerator.ts    # Documentation
│   ├── refactorEngine.ts  # Code refactoring
│   └── codeAnalyzer.ts    # Code analysis
├── providers/       # AI providers
│   ├── ollama.ts
│   ├── openai.ts
│   ├── anthropic.ts
│   └── router.ts
├── tools/           # File system tools
├── ui/              # Sidebar UI
├── storage/         # Secure storage & logging
├── commands/        # VS Code commands
└── extension.ts     # Entry point
```

## 🔒 Security

- API keys are stored securely using VS Code's SecretStorage
- Terminal commands are whitelisted for safety
- File deletions require confirmation by default
- All AI operations are transparent and logged

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with ❤️ by [Ben Belaouedj](https://github.com/ben-belaouedj)
- Powered by OpenAI, Anthropic, and Ollama
- Thanks to the VS Code team for the amazing extension API

---

**⭐ Star this repo if you find it useful!**

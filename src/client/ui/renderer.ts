/**
 * UI Renderer using blessed library
 * Creates a Claude Code-like terminal interface
 */

import blessed from 'blessed';
import chalk from 'chalk';

export class UIRenderer {
  private screen!: blessed.Widgets.Screen;
  private conversationBox!: blessed.Widgets.BoxElement;
  private inputBox!: blessed.Widgets.TextareaElement;
  private statusBar!: blessed.Widgets.BoxElement;
  private participantList!: blessed.Widgets.BoxElement;

  private thinkingSpinner: NodeJS.Timeout | null = null;
  private thinkingFrame = 0;
  private readonly THINKING_CHARS = ['·', '✢', '✳', '✶', '✻', '✽'];
  private readonly THINKING_TEXTS = [
    'Contemplating', 'Pondering', 'Clauding', 'Cogitating',
    'Ruminating', 'Mulling', 'Noodling'
  ];

  private assistantBuffer: string = ''; // Buffer for streaming assistant responses

  render(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Shared Claude Session',
      fullUnicode: true
    });

    // Conversation history (top 80% of left side)
    this.conversationBox = blessed.box({
      top: 0,
      left: 0,
      width: '80%',
      height: '77%',
      label: ' Conversation ',
      border: {
        type: 'line'
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      wrap: true,  // Enable word wrapping
      tags: true,  // Support color tags
      scrollbar: {
        ch: '█',
        style: {
          fg: 'blue'
        }
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });

    // Participants list (right 20%)
    this.participantList = blessed.box({
      top: 0,
      right: 0,
      width: '20%',
      height: '77%',
      label: ' Participants ',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'magenta'
        }
      }
    });

    // Status bar
    this.statusBar = blessed.box({
      top: '77%',
      left: 0,
      width: '100%',
      height: 3,
      content: 'Status: Connecting...',
      style: {
        fg: 'yellow'
      }
    });

    // Input box (bottom)
    this.inputBox = blessed.textarea({
      bottom: 0,
      left: 0,
      width: '100%',
      height: '20%',
      label: ' Your Message (Press Ctrl+S to send) ',
      border: {
        type: 'line'
      },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      wrap: true,  // Enable word wrapping in input
      style: {
        border: {
          fg: 'green'
        },
        focus: {
          border: {
            fg: 'brightgreen'
          }
        }
      }
    });

    this.screen.append(this.conversationBox);
    this.screen.append(this.participantList);
    this.screen.append(this.statusBar);
    this.screen.append(this.inputBox);

    // Key bindings - Ctrl+C or 'q' to quit
    this.screen.key(['C-c', 'q'], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.render();
  }

  /**
   * Register handler for message submission
   */
  onSubmit(handler: (input: string) => void): void {
    // Ctrl+S to send message
    this.inputBox.key(['C-s'], () => {
      const text = this.inputBox.getValue();
      if (text.trim()) {
        handler(text.trim());
        this.inputBox.clearValue();
        this.screen.render();
      }
    });
  }

  /**
   * Register handler for commands
   */
  onCommand(handler: (cmd: string) => void): void {
    this.inputBox.on('submit', () => {
      const text = this.inputBox.getValue();
      if (text.startsWith('/')) {
        handler(text);
        this.inputBox.clearValue();
        this.screen.render();
      }
    });
  }

  /**
   * Render full conversation history
   */
  renderConversation(messages: any[]): void {
    this.conversationBox.setContent('');

    messages.forEach(msg => {
      if (msg.role === 'user') {
        const username = msg.author_username || 'User';
        this.appendUserMessage(username, this.extractContent(msg.content));
      } else if (msg.role === 'assistant') {
        this.appendAssistantMessage(this.extractContent(msg.content));
      }
    });

    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Extract text content from message content
   */
  private extractContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map(block => {
          if (block.type === 'text') {
            return block.text;
          } else if (block.type === 'tool_use') {
            return chalk.gray(`[Tool: ${block.name}]`);
          } else if (block.type === 'tool_result') {
            return chalk.gray(`[Tool result]`);
          }
          return '';
        })
        .filter(text => text.length > 0)
        .join('\n');
    }

    return JSON.stringify(content);
  }

  /**
   * Append user message
   */
  appendUserMessage(username: string, content: string): void {
    const formatted = chalk.blue('●') + ' ' + chalk.bold.cyan(username) + ': ' + content;
    this.conversationBox.pushLine(formatted);
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Start streaming assistant response
   */
  startAssistantResponse(): void {
    this.assistantBuffer = '';
    this.conversationBox.pushLine(chalk.green('●') + ' ' + chalk.bold.white('Claude') + ': ');
  }

  /**
   * Append delta to assistant response
   */
  appendAssistantDelta(delta: string): void {
    this.assistantBuffer += delta;

    // Remove the last line and add updated line
    const lines = this.conversationBox.getLines();
    if (lines.length > 0) {
      // Delete last line
      this.conversationBox.deleteLine(lines.length - 1);

      // Add updated line with full buffer
      const prefix = chalk.green('●') + ' ' + chalk.bold.white('Claude') + ': ';
      this.conversationBox.pushLine(prefix + this.assistantBuffer);
    }

    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Append complete assistant message
   */
  appendAssistantMessage(content: any): void {
    const text = this.extractContent(content);
    const formatted = chalk.green('●') + ' ' + chalk.bold.white('Claude') + ': ' + text;
    this.conversationBox.pushLine(formatted);
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Finalize assistant message
   */
  finalizeAssistantMessage(message: any): void {
    // Clear buffer
    this.assistantBuffer = '';

    // Add separator
    this.conversationBox.pushLine(chalk.gray('─'.repeat(60)));
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Show thinking indicator with animated spinner
   */
  showThinking(): void {
    this.thinkingFrame = 0;

    this.thinkingSpinner = setInterval(() => {
      const spinner = this.THINKING_CHARS[this.thinkingFrame % this.THINKING_CHARS.length];
      const text = this.THINKING_TEXTS[Math.floor(this.thinkingFrame / this.THINKING_CHARS.length) % this.THINKING_TEXTS.length];

      this.statusBar.setContent(chalk.italic.gray(`${spinner} ${text}...`));
      this.screen.render();
      this.thinkingFrame++;
    }, 200);
  }

  /**
   * Hide thinking indicator
   */
  hideThinking(): void {
    if (this.thinkingSpinner) {
      clearInterval(this.thinkingSpinner);
      this.thinkingSpinner = null;
    }
  }

  /**
   * Show tool execution
   */
  showToolExecution(toolName: string, input: any): void {
    const formatted = chalk.yellow(`\\n🔧 Executing tool: ${toolName}\\nInput: ${JSON.stringify(input, null, 2)}\\n`);
    this.conversationBox.pushLine(formatted);
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Set lock state (update input box style)
   */
  setLockState(hasLock: boolean): void {
    if (hasLock) {
      this.inputBox.style.border.fg = 'brightgreen';
      this.inputBox.setLabel(' Your Message - YOU HAVE THE LOCK ');
    } else {
      this.inputBox.style.border.fg = 'red';
      this.inputBox.setLabel(' Waiting for lock... ');
    }
    this.screen.render();
  }

  /**
   * Update lock status in status bar
   */
  updateLockStatus(clientId: string | null, username: string | null): void {
    if (clientId && username) {
      this.statusBar.setContent(`Status: ${username} is typing... 🔒`);
      this.statusBar.style.fg = 'yellow';
    } else {
      this.statusBar.setContent('Status: Lock available 🟢');
      this.statusBar.style.fg = 'green';
    }
    this.screen.render();
  }

  /**
   * Update participants list
   */
  updateParticipants(participants: Array<{ username: string; clientId: string }>): void {
    const lines = participants.map(p => `  • ${p.username}`);
    this.participantList.setContent(lines.join('\\n'));
    this.screen.render();
  }

  /**
   * Show status message
   */
  showStatus(message: string): void {
    this.statusBar.setContent(`Status: ${message}`);
    this.statusBar.style.fg = 'white';
    this.screen.render();
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    const formatted = chalk.red(`\\n❌ ${message}\\n`);
    this.conversationBox.pushLine(formatted);
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Focus input box
   */
  focus(): void {
    this.inputBox.focus();
  }

  /**
   * Destroy the UI
   */
  destroy(): void {
    this.hideThinking();
    this.screen.destroy();
  }
}

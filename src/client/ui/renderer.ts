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

    // Conversation history (main area)
    this.conversationBox = blessed.box({
      top: 0,
      left: 0,
      width: '80%',
      height: '100%-8',
      label: ' Conversation ',
      border: {
        type: 'line'
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      wrap: true,
      tags: true,
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

    // Participants list (right side)
    this.participantList = blessed.box({
      top: 0,
      right: 0,
      width: '20%',
      height: '100%-8',
      label: ' Participants ',
      border: {
        type: 'line'
      },
      tags: true,
      style: {
        border: {
          fg: 'magenta'
        }
      }
    });

    // Status bar (above input)
    this.statusBar = blessed.box({
      bottom: 5,
      left: 0,
      width: '100%',
      height: 3,
      content: ' Status: Connecting...',
      style: {
        fg: 'gray'
      }
    });

    // Input box (bottom)
    this.inputBox = blessed.textarea({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 5,
      label: ' Message (Enter to send) ',
      border: {
        type: 'line'
      },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      wrap: true,
      style: {
        border: {
          fg: 'cyan'
        },
        focus: {
          border: {
            fg: 'brightcyan'
          }
        }
      }
    });

    this.screen.append(this.conversationBox);
    this.screen.append(this.participantList);
    this.screen.append(this.statusBar);
    this.screen.append(this.inputBox);

    this.screen.render();
  }

  private quitHandler: (() => Promise<void>) | null = null;

  /**
   * Register handler for quit action
   */
  onQuit(handler: () => Promise<void>): void {
    this.quitHandler = handler;

    // Key bindings for quit - Ctrl+C, Escape, or Ctrl+Q
    this.screen.key(['C-c', 'escape', 'C-q'], async () => {
      if (this.quitHandler) {
        await this.quitHandler();
      }
      this.destroy();
      process.exit(0);
    });
  }

  /**
   * Register handler for message submission
   */
  onSubmit(handler: (input: string) => void): void {
    const submitHandler = () => {
      const text = this.inputBox.getValue();
      if (text.trim()) {
        handler(text.trim());
        this.inputBox.clearValue();
        this.screen.render();
      }
    };

    // Enter to send message
    this.inputBox.key(['enter'], submitHandler);
    // Ctrl+S as alternative (for multiline in future)
    this.inputBox.key(['C-s'], submitHandler);
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
    // Properly clear all content and lines
    this.clearConversation();

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
   * Clear conversation display - properly clears both content and lines
   */
  clearConversation(): void {
    // Delete all lines first (pushLine adds to internal line array)
    const lines = this.conversationBox.getLines();
    for (let i = lines.length - 1; i >= 0; i--) {
      this.conversationBox.deleteLine(i);
    }
    // Also clear content
    this.conversationBox.setContent('');
    this.assistantBuffer = '';
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
    const prefix = chalk.blue('●') + ' ' + chalk.bold.cyan(username) + ': ';
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (i === 0) {
        this.conversationBox.pushLine(prefix + line);
      } else {
        this.conversationBox.pushLine('  ' + line);
      }
    });
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
    const prefix = chalk.green('●') + ' ' + chalk.bold.white('Claude') + ': ';
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i === 0) {
        this.conversationBox.pushLine(prefix + line);
      } else {
        this.conversationBox.pushLine('  ' + line);
      }
    });
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

      this.statusBar.setContent(chalk.italic.gray(` ${spinner} ${text}...`));
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
    this.conversationBox.pushLine('');
    this.conversationBox.pushLine(chalk.yellow(`🔧 Executing tool: ${toolName}`));
    this.conversationBox.pushLine(chalk.gray(`Input: ${JSON.stringify(input, null, 2)}`));
    this.conversationBox.pushLine('');
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Set lock state (update input box style)
   */
  setLockState(hasLock: boolean): void {
    if (hasLock) {
      this.inputBox.style.border.fg = 'green';
      this.inputBox.setLabel(' Message (Enter to send) - Active ');
    } else {
      this.inputBox.style.border.fg = 'cyan';
      this.inputBox.setLabel(' Message (Enter to send) ');
    }
    this.screen.render();
  }

  /**
   * Update lock status in status bar
   */
  updateLockStatus(clientId: string | null, username: string | null): void {
    if (clientId && username) {
      this.statusBar.setContent(` ${username} is typing...`);
      this.statusBar.style.fg = 'yellow';
    } else {
      this.statusBar.setContent(' Ready');
      this.statusBar.style.fg = 'green';
    }
    this.screen.render();
  }

  /**
   * Update participants list
   */
  updateParticipants(participants: Array<{ username: string; clientId: string }>): void {
    const lines = participants.map(p => `  • ${p.username}`);
    this.participantList.setContent(lines.join('\n'));
    this.screen.render();
  }

  /**
   * Show status message
   */
  showStatus(message: string): void {
    this.statusBar.setContent(` ${message}`);
    this.statusBar.style.fg = 'white';
    this.screen.render();
  }

  /**
   * Append system/info message to conversation
   */
  appendSystemMessage(message: string): void {
    this.conversationBox.pushLine(chalk.gray(`  ${message}`));
    this.conversationBox.setScrollPerc(100);
    this.screen.render();
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    this.conversationBox.pushLine('');
    this.conversationBox.pushLine(chalk.red(`❌ ${message}`));
    this.conversationBox.pushLine('');
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

#!/usr/bin/env node
/**
 * Main TUI client for SDK-based collaborative Claude sessions
 * Each developer runs this to join a shared session
 */

import Anthropic from '@anthropic-ai/sdk';
import { WebSocketClient } from './api/websocket-client';
import { UIRenderer } from './ui/renderer';
import { ToolExecutor } from './tools/executor';
import { FILE_TOOLS } from './tools/file-ops';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import * as readline from 'readline';

interface ClientConfig {
  apiKey: string;
  serverUrl: string;
  username: string;
  sessionId: string;
}

class TUIClient {
  private anthropic: Anthropic;
  private wsClient: WebSocketClient;
  private ui: UIRenderer;
  private tools: ToolExecutor;

  private clientId: string;
  private username: string;
  private sessionId: string;
  private hasLock: boolean = false;

  // Conversation state (synced with relay)
  private conversation: Anthropic.Messages.MessageParam[] = [];
  private initialSyncDone: boolean = false;

  constructor(config: ClientConfig) {
    this.clientId = uuidv4();
    this.username = config.username;
    this.sessionId = config.sessionId;

    this.anthropic = new Anthropic({ apiKey: config.apiKey });
    this.wsClient = new WebSocketClient(config.serverUrl);
    this.ui = new UIRenderer();
    this.tools = new ToolExecutor();
  }

  async start(): Promise<void> {
    // Initialize UI
    this.ui.render();
    this.ui.showStatus('Connecting to session...');
    this.setupUIHandlers();

    // Connect to relay
    try {
      await this.wsClient.connect(this.sessionId, this.clientId, this.username);
      this.setupWSHandlers();

      // Request conversation sync
      await this.syncConversation();

      this.ui.showStatus('Connected! Type your message...');
      this.ui.focus();
    } catch (error: any) {
      this.ui.showError(`Connection failed: ${error.message}`);
      setTimeout(() => process.exit(1), 2000);
    }
  }

  private setupUIHandlers(): void {
    // Handle message submission
    this.ui.onSubmit(async (input: string) => {
      if (input.startsWith('/')) {
        await this.handleCommand(input);
        return;
      }

      if (!this.hasLock) {
        await this.requestLock();
        // Store input for when lock is granted
        this.pendingInput = input;
        return;
      }

      await this.handleUserMessage(input);
    });
  }

  private pendingInput: string | null = null;

  private async handleCommand(cmd: string): Promise<void> {
    const command = cmd.toLowerCase().trim();

    switch (command) {
      case '/lock':
        await this.requestLock();
        break;
      case '/release':
        await this.releaseLock();
        break;
      case '/clear':
        this.conversation = [];
        this.ui.clearConversation();
        this.ui.showStatus('Conversation cleared');
        break;
      case '/quit':
      case '/exit':
        await this.cleanup();
        process.exit(0);
        break;
      case '/help':
        this.ui.showStatus('Commands: /clear, /lock, /release, /quit, /help');
        break;
      default:
        this.ui.showError(`Unknown command: ${command}`);
    }
  }

  private setupWSHandlers(): void {
    // Full state sync
    this.wsClient.on('sync.state', (data: any) => {
      // Only replace conversation on initial sync
      if (!this.initialSyncDone) {
        this.conversation = this.convertToAnthropicFormat(data.messages);
        this.ui.renderConversation(data.messages);
        this.initialSyncDone = true;
      } else {
        // After initial sync, only update UI with latest from database
        // but keep our conversation array intact (it's updated via broadcasts)
        this.ui.renderConversation(data.messages);
      }

      this.ui.updateParticipants(data.participants);
      this.ui.updateLockStatus(data.lockHolder, data.lockUsername);
    });

    // Lock granted
    this.wsClient.on('lock.granted', (data: any) => {
      if (data.clientId === this.clientId) {
        this.hasLock = true;
        this.ui.setLockState(true);
        this.ui.showStatus('You have the lock - type your message');

        // If we have pending input, send it now
        if (this.pendingInput) {
          const input = this.pendingInput;
          this.pendingInput = null;
          this.handleUserMessage(input);
        }
      } else {
        this.ui.updateLockStatus(data.clientId, data.username);
      }
    });

    // Lock released
    this.wsClient.on('lock.released', (data: any) => {
      this.hasLock = false;
      this.ui.setLockState(false);
      this.ui.updateLockStatus(null, null);
    });

    // Lock denied
    this.wsClient.on('lock.denied', (data: any) => {
      this.ui.showError(`Lock denied. ${data.holder} is currently typing.`);
    });

    // User message broadcast
    this.wsClient.on('user.message.broadcast', (data: any) => {
      this.ui.appendUserMessage(data.username, data.content);

      // Add to conversation
      this.conversation.push({
        role: 'user',
        content: data.content
      });
    });

    // Assistant streaming
    this.wsClient.on('assistant.streaming', (data: any) => {
      this.ui.appendAssistantDelta(data.delta);
    });

    // Assistant complete
    this.wsClient.on('assistant.complete.broadcast', (data: any) => {
      // Add to conversation
      this.conversation.push({
        role: 'assistant',
        content: data.message.content
      });

      this.ui.finalizeAssistantMessage(data.message);
    });

    // Tool execution
    this.wsClient.on('tool.executing', (data: any) => {
      this.ui.showToolExecution(data.toolName, data.input);
    });

    // Participant events
    this.wsClient.on('participant.joined', (data: any) => {
      this.ui.showStatus(`${data.username} joined the session`);
      // Re-sync to get updated participant list
      this.syncConversation();
    });

    this.wsClient.on('participant.left', (data: any) => {
      this.ui.showStatus(`${data.username} left the session`);
      // Re-sync to get updated participant list
      this.syncConversation();
    });

    // Connection events
    this.wsClient.on('reconnecting', (data: any) => {
      this.ui.showStatus(`Reconnecting (attempt ${data.attempt})...`);
    });

    this.wsClient.on('reconnected', () => {
      this.ui.showStatus('Reconnected!');
      this.syncConversation();
    });

    this.wsClient.on('reconnect_failed', () => {
      this.ui.showError('Could not reconnect. Please restart the client.');
    });
  }

  private async handleUserMessage(input: string): Promise<void> {
    try {
      // 1. Broadcast user message
      await this.wsClient.send({
        type: 'user.message',
        sessionId: this.sessionId,
        clientId: this.clientId,
        username: this.username,
        content: input
      });

      // 2. Update local conversation (will also be broadcasted back)
      this.conversation.push({
        role: 'user',
        content: input
      });

      // 3. Show in UI
      this.ui.appendUserMessage(this.username, input);

      // 4. Start thinking indicator
      this.ui.showThinking();

      // 5. Make API call to Anthropic
      await this.callAnthropicAPI();

      // 6. Lock will be released automatically after response

    } catch (error: any) {
      this.ui.showError(`Error: ${error.message}`);
      await this.releaseLock();
    }
  }

  private async callAnthropicAPI(): Promise<void> {
    try {
      this.ui.startAssistantResponse();

      const stream = this.anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: this.conversation,
        tools: FILE_TOOLS
      });

      // Stream text deltas
      stream.on('text', async (delta: string) => {
        // Update local UI
        this.ui.appendAssistantDelta(delta);

        // Broadcast to others
        await this.wsClient.trySend({
          type: 'assistant.chunk',
          sessionId: this.sessionId,
          clientId: this.clientId,
          delta
        });
      });

      // Handle content blocks
      stream.on('contentBlock', async (block: any) => {
        if (block.type === 'tool_use') {
          this.ui.hideThinking();
          await this.executeToolLocally(block);
        }
      });

      // Get final message
      const finalMessage = await stream.finalMessage();

      this.ui.hideThinking();

      // Save to conversation
      this.conversation.push({
        role: 'assistant',
        content: finalMessage.content
      });

      // Broadcast completion
      await this.wsClient.send({
        type: 'assistant.complete',
        sessionId: this.sessionId,
        clientId: this.clientId,
        message: finalMessage
      });

      this.ui.finalizeAssistantMessage(finalMessage);

      // Release lock
      await this.releaseLock();

    } catch (error: any) {
      this.ui.hideThinking();

      // Build user-friendly error message
      let errorMsg = 'API Error';
      if (error.status) {
        errorMsg += ` (${error.status})`;
      }

      if (error.status === 429) {
        errorMsg = 'Rate limited - please wait before trying again';
      } else if (error.status === 400) {
        errorMsg = 'Invalid request - conversation may be corrupted. Try /clear';
      } else if (error.status === 401) {
        errorMsg = 'Invalid API key';
      } else if (error.status === 500) {
        errorMsg = 'Anthropic server error - try again';
      }

      this.ui.showError(errorMsg);
      await this.releaseLock();
    }
  }

  private async executeToolLocally(toolUse: any): Promise<void> {
    const { id, name, input } = toolUse;

    this.ui.showToolExecution(name, input);

    try {
      // Execute tool on local filesystem
      const resultString = await this.tools.execute(name, input);
      const result = JSON.parse(resultString);

      // Broadcast tool execution
      await this.wsClient.send({
        type: 'tool.execute',
        sessionId: this.sessionId,
        clientId: this.clientId,
        toolUseId: id,
        toolName: name,
        input
      });

      // Broadcast result
      await this.wsClient.send({
        type: 'tool.result',
        sessionId: this.sessionId,
        clientId: this.clientId,
        toolUseId: id,
        content: result,
        isError: !result.success
      });

      // Add tool result to conversation for next API call
      this.conversation.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: resultString
          }
        ]
      });

      // Continue the conversation (Claude may respond to tool result)
      this.ui.showThinking();
      await this.callAnthropicAPI();

    } catch (error: any) {
      this.ui.showError(`Tool error: ${error.message}`);

      // Broadcast error
      await this.wsClient.send({
        type: 'tool.result',
        sessionId: this.sessionId,
        clientId: this.clientId,
        toolUseId: id,
        content: { success: false, error: error.message },
        isError: true
      });

      await this.releaseLock();
    }
  }

  private convertToAnthropicFormat(messages: any[]): Anthropic.Messages.MessageParam[] {
    const converted = messages.map(msg => {
      // Handle content properly
      let content;
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Content blocks (tool use, tool results, etc.)
        content = msg.content;
      } else if (msg.content && typeof msg.content === 'object') {
        // If it's a single content block object, wrap it in an array
        content = [msg.content];
      } else {
        // Fallback to empty string
        content = '';
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content
      };
    }).filter(msg => {
      // Filter out empty messages that could cause API errors
      if (typeof msg.content === 'string') {
        return msg.content.length > 0;
      }
      return msg.content && (Array.isArray(msg.content) ? msg.content.length > 0 : true);
    });

    // Validate and fix tool_result / tool_use pairing
    return this.validateToolMessages(converted);
  }

  /**
   * Validate that all tool_result blocks have matching tool_use blocks
   * Remove orphaned tool_results to prevent API errors
   */
  private validateToolMessages(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
    const result: Anthropic.Messages.MessageParam[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Check if this is a user message with tool_result content
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const toolResults = msg.content.filter((block: any) => block.type === 'tool_result');

        if (toolResults.length > 0) {
          // Find the previous assistant message
          const prevMsg = result.length > 0 ? result[result.length - 1] : null;

          if (!prevMsg || prevMsg.role !== 'assistant') {
            // No previous assistant message - skip this tool_result message
            console.warn('Skipping orphaned tool_result (no previous assistant message)');
            continue;
          }

          // Get tool_use IDs from the previous assistant message
          const assistantContent = Array.isArray(prevMsg.content) ? prevMsg.content : [];
          const toolUseIds = new Set(
            assistantContent
              .filter((block: any) => block.type === 'tool_use')
              .map((block: any) => block.id)
          );

          // Filter to only tool_results that have matching tool_use
          const validToolResults = toolResults.filter((block: any) =>
            toolUseIds.has(block.tool_use_id)
          );

          if (validToolResults.length === 0) {
            // All tool_results are orphaned - skip this message
            console.warn('Skipping message with all orphaned tool_results');
            continue;
          }

          // Keep only valid content blocks
          const otherContent = msg.content.filter((block: any) => block.type !== 'tool_result');
          const validContent = [...otherContent, ...validToolResults];

          if (validContent.length > 0) {
            result.push({ role: 'user', content: validContent });
          }
          continue;
        }
      }

      result.push(msg);
    }

    return result;
  }

  private async requestLock(): Promise<void> {
    await this.wsClient.send({
      type: 'lock.request',
      sessionId: this.sessionId,
      clientId: this.clientId,
      username: this.username
    });
    this.ui.showStatus('Requesting lock...');
  }

  private async releaseLock(): Promise<void> {
    if (this.hasLock) {
      await this.wsClient.send({
        type: 'lock.release',
        sessionId: this.sessionId,
        clientId: this.clientId
      });
      this.hasLock = false;
      this.ui.setLockState(false);
    }
  }

  private async syncConversation(): Promise<void> {
    await this.wsClient.send({
      type: 'sync.request',
      sessionId: this.sessionId,
      clientId: this.clientId
    });
  }

  private async cleanup(): Promise<void> {
    await this.releaseLock();
    this.wsClient.disconnect();
    this.ui.destroy();
  }
}

// Interactive prompts
async function prompt(question: string, hideInput: boolean = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (hideInput) {
      // Hide input for API key
      const stdin = process.stdin;
      (stdin as any).setRawMode(true);

      process.stdout.write(question);
      let input = '';

      const dataHandler = (char: Buffer) => {
        const c = char.toString();

        if (c === '\r' || c === '\n') {
          (stdin as any).setRawMode(false);
          stdin.removeListener('data', dataHandler);
          stdin.pause();
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(0);
        } else if (c === '\u007f' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += c;
          process.stdout.write('*');
        }
      };

      stdin.on('data', dataHandler);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

// Entry point
async function main() {
  console.log(chalk.cyan('\n╔═══════════════════════════════════════╗'));
  console.log(chalk.cyan('║   Shared Claude Session - Client     ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════╝\n'));

  // Parse command line arguments (optional)
  const args = process.argv.slice(2);
  let username = args[0];
  let sessionId = args[1];

  // Prompt for server URL
  let serverUrl = process.env.SERVER_URL;
  if (!serverUrl) {
    console.log(chalk.gray('No SERVER_URL environment variable found'));
    const urlInput = await prompt(chalk.blue('WebSocket URL (press Enter for localhost): '));
    serverUrl = urlInput.trim() || 'ws://localhost:3000';
  } else {
    console.log(chalk.gray(`Using server from environment: ${serverUrl}`));
  }

  // Validate URL format
  if (!serverUrl.startsWith('ws://') && !serverUrl.startsWith('wss://')) {
    console.log(chalk.red('WebSocket URL must start with ws:// or wss://'));
    process.exit(1);
  }

  // Prompt for missing values
  if (!username) {
    username = await prompt(chalk.blue('Your name: '));
    if (!username) {
      console.log(chalk.red('Username is required'));
      process.exit(1);
    }
  }

  if (!sessionId) {
    sessionId = await prompt(chalk.blue('Session ID: '));
    if (!sessionId) {
      console.log(chalk.red('Session ID is required'));
      process.exit(1);
    }
  }

  // Check for API key
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(chalk.gray('API key not found in environment'));
    apiKey = await prompt(chalk.blue('Anthropic API Key: '), true);
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      console.log(chalk.red('\nInvalid API key format (should start with sk-ant-)'));
      process.exit(1);
    }
  } else {
    console.log(chalk.gray(`Using API key from environment (${apiKey.substring(0, 12)}...)`));
  }

  console.log(chalk.gray(`\nConnecting to: ${serverUrl}\n`));

  // Small delay to let prompts finish
  await new Promise(resolve => setTimeout(resolve, 100));

  // Clear terminal and reset state before starting UI
  console.clear();

  // Remove all listeners from stdin
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');

  // Resume stdin and ensure it's in normal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.resume();

  const client = new TUIClient({
    apiKey,
    serverUrl,
    username,
    sessionId
  });

  await client.start();
}

main().catch((error) => {
  console.error(chalk.red('✗ Failed to start client:'), error);
  process.exit(1);
});

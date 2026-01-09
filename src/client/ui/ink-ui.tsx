/**
 * Ink UI Manager - wraps the React/Ink app for use by the client
 */

import React from 'react';
import { render, Instance } from 'ink';
import { App } from './App.js';

interface Participant {
  clientId: string;
  username: string;
}

interface InkUIConfig {
  sessionId: string;
  username: string;
  onSubmit: (message: string) => void;
  onQuit: () => Promise<void>;
}

export class InkUI {
  private instance: Instance | null = null;
  private config: InkUIConfig;

  constructor(config: InkUIConfig) {
    this.config = config;
  }

  render(): void {
    this.instance = render(
      <App
        sessionId={this.config.sessionId}
        username={this.config.username}
        onSubmit={this.config.onSubmit}
        onQuit={this.config.onQuit}
      />
    );
  }

  // Proxy methods to the global UI object set by App component
  private getUI(): any {
    return (global as any).__inkUI || {};
  }

  addUserMessage(username: string, content: string): void {
    this.getUI().addUserMessage?.(username, content);
  }

  addAssistantMessage(content: string): void {
    this.getUI().addAssistantMessage?.(content);
  }

  addSystemMessage(content: string): void {
    this.getUI().addSystemMessage?.(content);
  }

  showError(message: string): void {
    this.getUI().addErrorMessage?.(message);
  }

  startStreaming(): void {
    this.getUI().startStreaming?.();
  }

  appendStreamDelta(delta: string): void {
    this.getUI().appendStreamDelta?.(delta);
  }

  finishStreaming(): void {
    this.getUI().finishStreaming?.();
  }

  clearConversation(): void {
    this.getUI().clearMessages?.();
  }

  showStatus(message: string): void {
    this.getUI().updateStatus?.(message, 'white');
  }

  updateParticipants(participants: Participant[]): void {
    this.getUI().updateParticipants?.(participants);
  }

  updateLockStatus(clientId: string | null, username: string | null): void {
    if (clientId && username) {
      this.getUI().updateStatus?.(`${username} is typing...`, 'yellow');
    } else {
      this.getUI().updateStatus?.('Ready', 'green');
    }
  }

  showThinking(): void {
    const texts = ['Thinking...', 'Pondering...', 'Contemplating...'];
    const text = texts[Math.floor(Math.random() * texts.length)];
    this.getUI().showThinking?.(text);
  }

  hideThinking(): void {
    this.getUI().hideThinking?.();
  }

  setLockState(hasLock: boolean): void {
    if (hasLock) {
      this.getUI().updateStatus?.('You have the lock - type your message', 'green');
    }
  }

  renderConversation(messages: any[]): void {
    this.getUI().renderConversation?.(messages);
  }

  // Compatibility methods
  appendUserMessage(username: string, content: string): void {
    this.addUserMessage(username, content);
  }

  appendSystemMessage(message: string): void {
    this.addSystemMessage(message);
  }

  startAssistantResponse(): void {
    this.startStreaming();
  }

  appendAssistantDelta(delta: string): void {
    this.appendStreamDelta(delta);
  }

  finalizeAssistantMessage(_message: any): void {
    this.finishStreaming();
  }

  showToolExecution(toolName: string, input: any): void {
    this.addSystemMessage(`🔧 Executing: ${toolName}`);
  }

  focus(): void {
    // No-op for Ink, input is always focused
  }

  destroy(): void {
    if (this.instance) {
      this.instance.unmount();
      this.instance = null;
    }
  }
}

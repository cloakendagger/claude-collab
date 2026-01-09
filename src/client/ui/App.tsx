/**
 * Ink-based UI for collaborative Claude sessions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, Static, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';

// Message types
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  username?: string;
  content: string;
  timestamp: number;
}

interface Participant {
  clientId: string;
  username: string;
}

interface AppProps {
  sessionId: string;
  username: string;
  onSubmit: (message: string) => void;
  onQuit: () => Promise<void>;
}

// Message component
const Message: React.FC<{ message: ChatMessage }> = ({ message }) => {
  switch (message.type) {
    case 'user':
      return (
        <Box flexDirection="column">
          <Text>
            <Text color="blue">● </Text>
            <Text bold color="cyan">{message.username}</Text>
            <Text>: {message.content}</Text>
          </Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box flexDirection="column">
          <Text>
            <Text color="green">● </Text>
            <Text bold color="white">Claude</Text>
            <Text>: {message.content}</Text>
          </Text>
        </Box>
      );
    case 'system':
      return (
        <Text color="gray">  {message.content}</Text>
      );
    case 'error':
      return (
        <Text color="red">  ✗ {message.content}</Text>
      );
    default:
      return null;
  }
};

// Main App component
export const App: React.FC<AppProps> = ({ sessionId, username, onSubmit, onQuit }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const [statusColor, setStatusColor] = useState<string>('yellow');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [thinkingText, setThinkingText] = useState('');

  // Calculate dimensions
  const terminalWidth = stdout?.columns || 80;
  const sidebarWidth = Math.min(20, Math.floor(terminalWidth * 0.2));
  const mainWidth = terminalWidth - sidebarWidth - 3;

  // Handle quit
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c') || (key.ctrl && input === 'q')) {
      onQuit().then(() => exit());
    }
  });

  // Exposed methods for the client to call
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const addUserMessage = useCallback((msgUsername: string, content: string) => {
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'user',
      username: msgUsername,
      content,
      timestamp: Date.now()
    });
  }, [addMessage]);

  const addAssistantMessage = useCallback((content: string) => {
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'assistant',
      content,
      timestamp: Date.now()
    });
  }, [addMessage]);

  const addSystemMessage = useCallback((content: string) => {
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'system',
      content,
      timestamp: Date.now()
    });
  }, [addMessage]);

  const addErrorMessage = useCallback((content: string) => {
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'error',
      content,
      timestamp: Date.now()
    });
  }, [addMessage]);

  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setStreamingContent('');
  }, []);

  const appendStreamDelta = useCallback((delta: string) => {
    setStreamingContent(prev => prev + delta);
  }, []);

  const finishStreaming = useCallback(() => {
    if (streamingContent) {
      addAssistantMessage(streamingContent);
    }
    setStreamingContent('');
    setIsStreaming(false);
  }, [streamingContent, addAssistantMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
  }, []);

  const updateStatus = useCallback((text: string, color: string = 'white') => {
    setStatus(text);
    setStatusColor(color);
  }, []);

  const updateParticipants = useCallback((newParticipants: Participant[]) => {
    setParticipants(newParticipants);
  }, []);

  const showThinking = useCallback((text: string) => {
    setThinkingText(text);
  }, []);

  const hideThinking = useCallback(() => {
    setThinkingText('');
  }, []);

  // Expose methods via ref or global (we'll use a simpler approach via props callback)
  useEffect(() => {
    // Store methods in a global for the client to access
    (global as any).__inkUI = {
      addUserMessage,
      addAssistantMessage,
      addSystemMessage,
      addErrorMessage,
      startStreaming,
      appendStreamDelta,
      finishStreaming,
      clearMessages,
      updateStatus,
      updateParticipants,
      showThinking,
      hideThinking,
      renderConversation: (msgs: any[]) => {
        const converted: ChatMessage[] = msgs.map((msg, i) => ({
          id: `hist-${i}`,
          type: msg.role === 'user' ? 'user' : 'assistant',
          username: msg.author_username || 'User',
          content: typeof msg.content === 'string' ? msg.content :
            Array.isArray(msg.content) ? msg.content.map((b: any) => b.text || '').join('') : '',
          timestamp: msg.timestamp || Date.now()
        }));
        setMessages(converted);
      }
    };
  }, [addUserMessage, addAssistantMessage, addSystemMessage, addErrorMessage,
      startStreaming, appendStreamDelta, finishStreaming, clearMessages,
      updateStatus, updateParticipants, showThinking, hideThinking]);

  // Handle input submission
  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSubmit(value.trim());
      setInput('');
    }
  };

  return (
    <Box flexDirection="column" height={stdout?.rows || 24}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan">Shared Claude Session</Text>
        <Text color="gray"> - {sessionId}</Text>
      </Box>

      {/* Main content area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Chat area */}
        <Box flexDirection="column" width={mainWidth} borderStyle="single" borderColor="gray">
          {/* Message history - Static prevents re-renders */}
          <Box flexDirection="column" flexGrow={1} overflowY="hidden">
            <Static items={messages}>
              {(message) => (
                <Box key={message.id}>
                  <Message message={message} />
                </Box>
              )}
            </Static>

            {/* Currently streaming message */}
            {isStreaming && streamingContent && (
              <Box>
                <Text>
                  <Text color="green">● </Text>
                  <Text bold color="white">Claude</Text>
                  <Text>: {streamingContent}</Text>
                </Text>
              </Box>
            )}

            {/* Thinking indicator */}
            {thinkingText && (
              <Text color="gray" italic>  {thinkingText}</Text>
            )}
          </Box>
        </Box>

        {/* Sidebar */}
        <Box flexDirection="column" width={sidebarWidth} borderStyle="single" borderColor="magenta">
          <Text color="magenta" bold> Participants</Text>
          {participants.map(p => (
            <Text key={p.clientId} color="white">  • {p.username}</Text>
          ))}
        </Box>
      </Box>

      {/* Status bar */}
      <Box paddingX={1}>
        <Text color={statusColor as any}>{status}</Text>
      </Box>

      {/* Input area */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="gray">❯ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message... (Enter to send, Esc to quit)"
        />
      </Box>
    </Box>
  );
};

export default App;

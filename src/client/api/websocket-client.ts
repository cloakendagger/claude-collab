/**
 * WebSocket client wrapper for connecting to relay server
 * Handles connection, reconnection, and message routing
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private sessionId: string = '';
  private clientId: string = '';
  private username: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000; // Start with 2 seconds

  constructor(serverUrl: string) {
    super();
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to the relay server
   */
  async connect(sessionId: string, clientId: string, username: string): Promise<void> {
    this.sessionId = sessionId;
    this.clientId = clientId;
    this.username = username;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
          console.log('Connected to relay server');
          this.reconnectAttempts = 0;

          // Send connection message
          this.send({
            type: 'client.connect',
            sessionId: this.sessionId,
            clientId: this.clientId,
            username: this.username
          });
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());

            // Emit the message type as an event
            this.emit(message.type, message);

            // Also emit generic 'message' event
            this.emit('message', message);

            // Resolve on connection confirmation
            if (message.type === 'connected') {
              resolve();
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          this.emit('disconnected');

          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          } else {
            this.emit('reconnect_failed');
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect(this.sessionId, this.clientId, this.username);
      this.emit('reconnected');
    } catch (error) {
      console.error('Reconnection failed:', error);
      // Will try again on next 'close' event
    }
  }

  /**
   * Send a message to the relay server
   */
  async send(message: any): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send a message safely (returns false if not connected)
   */
  trySend(message: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.ws) {
      // Set attempts to max to prevent reconnection
      this.reconnectAttempts = this.maxReconnectAttempts;

      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): { sessionId: string; clientId: string; username: string } {
    return {
      sessionId: this.sessionId,
      clientId: this.clientId,
      username: this.username
    };
  }
}

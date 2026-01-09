/**
 * Database layer for conversation persistence
 * Uses SQLite to store sessions, messages, and tool results
 */

import Database from 'better-sqlite3';

export interface StoredMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string; // JSON stringified
  author_username: string | null;
  timestamp: number;
}

export class SessionDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        author_username TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, timestamp);

      CREATE TABLE IF NOT EXISTS tool_results (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_use_id TEXT NOT NULL,
        content TEXT NOT NULL,
        client_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tool_results_session
        ON tool_results(session_id, timestamp);
    `);
  }

  /**
   * Create a new session
   */
  createSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, created_at, last_activity)
      VALUES (?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(sessionId, now, now);
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_activity = ? WHERE id = ?
    `);

    stmt.run(Date.now(), sessionId);
  }

  /**
   * Save a message to the database
   */
  saveMessage(sessionId: string, message: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, author_username, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const messageId = message.id || this.generateMessageId();
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);

    stmt.run(
      messageId,
      sessionId,
      message.role,
      content,
      message.author_username || null,
      Date.now()
    );

    // Update session activity
    this.updateSessionActivity(sessionId);
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(sessionId) as StoredMessage[];

    return rows.map(row => {
      let content;
      try {
        content = JSON.parse(row.content);
      } catch {
        content = row.content; // Keep as string if not JSON
      }

      return {
        id: row.id,
        role: row.role,
        content,
        author_username: row.author_username,
        timestamp: row.timestamp
      };
    });
  }

  /**
   * Save a tool result
   */
  saveToolResult(sessionId: string, toolUseId: string, content: any, clientId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO tool_results (id, session_id, tool_use_id, content, client_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      this.generateId(),
      sessionId,
      toolUseId,
      JSON.stringify(content),
      clientId,
      Date.now()
    );
  }

  /**
   * Get tool results for a session
   */
  getToolResults(sessionId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tool_results
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(sessionId).map((row: any) => ({
      id: row.id,
      tool_use_id: row.tool_use_id,
      content: JSON.parse(row.content),
      client_id: row.client_id,
      timestamp: row.timestamp
    }));
  }

  /**
   * Delete old sessions (cleanup)
   */
  deleteOldSessions(olderThanDays: number = 30): void {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    // Delete messages first (foreign key constraint)
    this.db.prepare(`
      DELETE FROM messages
      WHERE session_id IN (
        SELECT id FROM sessions WHERE last_activity < ?
      )
    `).run(cutoff);

    // Delete tool results
    this.db.prepare(`
      DELETE FROM tool_results
      WHERE session_id IN (
        SELECT id FROM sessions WHERE last_activity < ?
      )
    `).run(cutoff);

    // Delete sessions
    this.db.prepare(`
      DELETE FROM sessions WHERE last_activity < ?
    `).run(cutoff);
  }

  /**
   * Check if session exists
   */
  sessionExists(sessionId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM sessions WHERE id = ?
    `);

    const result = stmt.get(sessionId) as { count: number };
    return result.count > 0;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

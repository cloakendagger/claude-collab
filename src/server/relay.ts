/**
 * WebSocket relay server for SDK-based collaborative Claude sessions
 * Each client makes their own Anthropic API calls
 * Server coordinates turn-taking and syncs conversation state
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { SessionDatabase } from './database.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/sessions.db');

// Initialize database
const db = new SessionDatabase(DB_PATH);
console.log(`📦 Database initialized at ${DB_PATH}`);

interface ClientInfo {
  clientId: string;
  username: string;
  ws: WebSocket;
  connectedAt: number;
}

interface Session {
  id: string;
  clients: Map<string, ClientInfo>; // clientId -> ClientInfo
  lockHolder: string | null; // clientId
  lockUsername: string | null;
  lockGrantedAt: number | null;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Lock timeout (30 seconds of inactivity)
const LOCK_TIMEOUT_MS = 30000;

// Create HTTP server for both WebSocket and health checks
import * as http from 'http';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      sessions: sessions.size,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ server });

server.listen(Number(PORT), () => {
  console.log(`🚀 SDK-Based Relay Server running on port ${PORT}`);
  console.log(`💚 Health check endpoint: http://localhost:${PORT}/health`);
});

// Helper function to broadcast messages
function broadcast(session: Session, message: any, excludeClientId?: string) {
  const data = JSON.stringify(message);
  session.clients.forEach((client) => {
    if (client.clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

// Periodic lock timeout check
setInterval(() => {
  const now = Date.now();
  sessions.forEach((session) => {
    if (session.lockHolder && session.lockGrantedAt) {
      if (now - session.lockGrantedAt > LOCK_TIMEOUT_MS) {
        console.log(`⏰ Lock timeout for session ${session.id.substring(0, 8)}`);
        session.lockHolder = null;
        session.lockUsername = null;
        session.lockGrantedAt = null;

        broadcast(session, {
          type: 'lock.released',
          reason: 'timeout'
        });
      }
    }
  });
}, 5000); // Check every 5 seconds

wss.on('connection', (ws: WebSocket) => {
  let sessionId: string | null = null;
  let clientId: string | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`📨 [${msg.sessionId?.substring(0, 8)}] ${msg.type}`);

      switch (msg.type) {
        case 'client.connect':
          handleClientConnect(ws, msg);
          break;

        case 'sync.request':
          handleSyncRequest(ws, msg);
          break;

        case 'lock.request':
          handleLockRequest(msg);
          break;

        case 'lock.release':
          handleLockRelease(msg);
          break;

        case 'user.message':
          handleUserMessage(msg);
          break;

        case 'assistant.chunk':
          handleAssistantChunk(msg);
          break;

        case 'assistant.complete':
          handleAssistantComplete(msg);
          break;

        case 'tool.execute':
          handleToolExecute(msg);
          break;

        case 'tool.result':
          handleToolResult(msg);
          break;

        default:
          console.warn(`Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Internal server error'
      }));
    }
  });

  ws.on('close', () => {
    if (sessionId && clientId) {
      handleClientDisconnect(sessionId, clientId);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  function handleClientConnect(ws: WebSocket, msg: any) {
    if (!msg.sessionId || !msg.clientId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing sessionId or clientId' }));
      return;
    }

    sessionId = msg.sessionId;
    clientId = msg.clientId;
    const username = msg.username || 'Anonymous';

    // At this point sessionId and clientId are guaranteed to be non-null
    const sid = sessionId as string;
    const cid = clientId as string;

    // Get or create session
    let session = sessions.get(sid);
    if (!session) {
      session = {
        id: sid,
        clients: new Map(),
        lockHolder: null,
        lockUsername: null,
        lockGrantedAt: null,
        lastActivity: Date.now()
      };
      sessions.set(sid, session);

      // Create session in database
      db.createSession(sid);
      console.log(`✨ Created session: ${sid.substring(0, 8)}`);
    }

    // Add client to session
    session.clients.set(cid, {
      clientId: cid,
      username,
      ws,
      connectedAt: Date.now()
    });

    session.lastActivity = Date.now();

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: cid,
      sessionId: sid
    }));

    // Notify others
    broadcast(session, {
      type: 'participant.joined',
      username,
      clientId: cid
    }, cid);

    console.log(`👤 ${username} (${cid.substring(0, 8)}) joined session ${sid.substring(0, 8)}`);
  }

  function handleSyncRequest(ws: WebSocket, msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Session not found'
      }));
      return;
    }

    // Load conversation history from database
    const messages = db.getMessages(msg.sessionId);

    // Build participant list
    const participants = Array.from(session.clients.values()).map(c => ({
      clientId: c.clientId,
      username: c.username
    }));

    // Send full state
    ws.send(JSON.stringify({
      type: 'sync.state',
      sessionId: msg.sessionId,
      messages,
      participants,
      lockHolder: session.lockHolder,
      lockUsername: session.lockUsername
    }));

    console.log(`🔄 Synced ${messages.length} messages to ${msg.clientId?.substring(0, 8)}`);
  }

  function handleLockRequest(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Check if lock is available
    if (session.lockHolder === null || session.lockHolder === msg.clientId) {
      session.lockHolder = msg.clientId;
      session.lockUsername = msg.username;
      session.lockGrantedAt = Date.now();
      session.lastActivity = Date.now();

      // Broadcast lock granted
      broadcast(session, {
        type: 'lock.granted',
        clientId: msg.clientId,
        username: msg.username
      });

      console.log(`🔒 Lock granted to ${msg.username}`);
    } else {
      // Lock denied
      const client = session.clients.get(msg.clientId);
      if (client) {
        client.ws.send(JSON.stringify({
          type: 'lock.denied',
          holder: session.lockUsername,
          reason: 'lock_held'
        }));
      }
    }
  }

  function handleLockRelease(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    if (session.lockHolder === msg.clientId) {
      const username = session.lockUsername;
      session.lockHolder = null;
      session.lockUsername = null;
      session.lockGrantedAt = null;

      broadcast(session, {
        type: 'lock.released'
      });

      console.log(`🔓 Lock released by ${username}`);
    }
  }

  function handleUserMessage(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Verify lock holder
    if (session.lockHolder !== msg.clientId) {
      console.warn(`⚠️  User message from non-lock-holder`);
      return;
    }

    session.lastActivity = Date.now();

    // Save to database
    db.saveMessage(msg.sessionId, {
      role: 'user',
      content: msg.content,
      author_username: msg.username
    });

    // Broadcast to all OTHER clients (exclude sender since they already have it)
    broadcast(session, {
      type: 'user.message.broadcast',
      username: msg.username,
      content: msg.content,
      timestamp: Date.now()
    }, msg.clientId);

    console.log(`💬 User message from ${msg.username}: "${msg.content.substring(0, 50)}..."`);
  }

  function handleAssistantChunk(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Verify lock holder
    if (session.lockHolder !== msg.clientId) {
      console.warn(`⚠️  Assistant chunk from non-lock-holder`);
      return;
    }

    session.lastActivity = Date.now();

    // Broadcast to all other clients
    broadcast(session, {
      type: 'assistant.streaming',
      delta: msg.delta,
      sourceClientId: msg.clientId
    }, msg.clientId);
  }

  function handleAssistantComplete(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Verify lock holder
    if (session.lockHolder !== msg.clientId) {
      console.warn(`⚠️  Assistant complete from non-lock-holder`);
      return;
    }

    session.lastActivity = Date.now();

    // Save to database
    db.saveMessage(msg.sessionId, {
      role: 'assistant',
      content: msg.message.content,
      author_username: null
    });

    // Broadcast to all OTHER clients (exclude sender since they already have it)
    broadcast(session, {
      type: 'assistant.complete.broadcast',
      message: msg.message
    }, msg.clientId);

    console.log(`✅ Assistant response complete`);
  }

  function handleToolExecute(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Broadcast tool execution to all clients
    broadcast(session, {
      type: 'tool.executing',
      toolUseId: msg.toolUseId,
      toolName: msg.toolName,
      input: msg.input,
      executingClientId: msg.clientId
    });

    console.log(`🔧 Tool execution: ${msg.toolName}`);
  }

  function handleToolResult(msg: any) {
    const session = sessions.get(msg.sessionId);
    if (!session) return;

    // Save tool result to database
    db.saveToolResult(msg.sessionId, msg.toolUseId, msg.content, msg.clientId);

    // Broadcast result to all clients
    broadcast(session, {
      type: 'tool.result.broadcast',
      toolUseId: msg.toolUseId,
      content: msg.content,
      isError: msg.isError
    });

    console.log(`🔧 Tool result: ${msg.isError ? 'ERROR' : 'SUCCESS'}`);
  }

  function handleClientDisconnect(sessionId: string, clientId: string) {
    const session = sessions.get(sessionId);
    if (!session) return;

    const clientInfo = session.clients.get(clientId);
    if (!clientInfo) return;

    const username = clientInfo.username;
    session.clients.delete(clientId);

    // Release lock if held
    if (session.lockHolder === clientId) {
      session.lockHolder = null;
      session.lockUsername = null;
      session.lockGrantedAt = null;

      broadcast(session, {
        type: 'lock.released',
        reason: 'holder_disconnected'
      });
    }

    // Notify others
    broadcast(session, {
      type: 'participant.left',
      username,
      clientId
    });

    console.log(`👋 ${username} left session ${sessionId.substring(0, 8)}`);

    // Clean up empty sessions
    if (session.clients.size === 0) {
      sessions.delete(sessionId);
      console.log(`🧹 Session ${sessionId.substring(0, 8)} cleaned up`);
    }
  }
});

// Cleanup old sessions daily
setInterval(() => {
  db.deleteOldSessions(30); // Delete sessions older than 30 days
  console.log('🧹 Cleaned up old sessions');
}, 24 * 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏸️  Shutting down...');
  db.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

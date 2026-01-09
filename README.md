# Shared Claude Session

A real-time collaborative terminal interface for Claude AI, enabling multiple developers to share the same Claude conversation session with turn-taking, file tool support, and seamless synchronization.

## Overview

This system allows development teams to collaborate on code with Claude in real-time. Each developer runs their own terminal client with the full Claude Code-like interface, while all participants see the same conversation and responses. Perfect for pair programming, mob programming, code reviews, and collaborative problem-solving.

### Key Features

- **Real-time Collaboration**: Multiple developers share the same Claude conversation
- **Turn-taking System**: Distributed lock mechanism prevents conflicting instructions
- **Native Claude Experience**: Each developer gets the full TUI with thinking indicators, streaming responses, and syntax highlighting
- **File Tool Support**: Claude can read, write, and search files on each developer's local filesystem
- **Conversation Persistence**: Full session history stored in SQLite database
- **Automatic Reconnection**: Clients automatically reconnect if network is interrupted
- **Cloud Deployment**: Ready to deploy on Google Cloud Run for remote teams

## Architecture

```
Developer A's Terminal    Developer B's Terminal    Developer C's Terminal
       │                         │                         │
       ├─ TUI Client             ├─ TUI Client             ├─ TUI Client
       ├─ Anthropic SDK          ├─ Anthropic SDK          ├─ Anthropic SDK
       │  (own API key)          │  (own API key)          │  (own API key)
       │                         │                         │
       └──────────WebSocket Relay (Local or Cloud Run)─────┘
                  │
                  └─ SQLite Database (conversation history)
```

### How It Works

1. Each developer runs their own TUI client locally
2. Clients connect to a shared relay server via WebSocket
3. Turn-taking is managed by a lock system
4. The lock holder makes Anthropic API calls and streams responses
5. Responses are broadcast to all clients in real-time
6. File tools execute on each developer's local filesystem
7. All conversation history is stored in the relay database

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** 9+
- **Anthropic API Key** (each developer needs their own)
- **Git** (for syncing project files across team)
- **Google Cloud CLI** (optional, for cloud deployment)

## Quick Start

### 1. Installation

```bash
git clone <repository-url>
cd shared-claude-session
npm install
npm run build
```

### 2. Start the Relay Server (Local)

```bash
npm run dev:server
```

You should see:
```
🚀 SDK-Based Relay Server running on port 3000
📦 Database initialized at .../data/sessions.db
💚 Health check endpoint: http://localhost:3000/health
```

### 3. Join the Session (Multiple Developers)

Each developer opens a terminal and runs:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
npm run dev:client -- <YourName> <SESSION-ID>
```

Example:
```bash
# Developer A
ANTHROPIC_API_KEY=sk-ant-... npm run dev:client -- Alice TEAM-SESSION

# Developer B (same session ID)
ANTHROPIC_API_KEY=sk-ant-... npm run dev:client -- Bob TEAM-SESSION
```

### 4. Start Collaborating!

- Type your message and press **Ctrl+Enter** to send
- The lock is automatically acquired and released
- All participants see Claude's responses in real-time
- File tools work on each person's local project files

## Commands

**Keyboard Shortcuts:**
- **Enter** - Send message (automatically requests lock)
- **Escape** / **Ctrl+C** / **Ctrl+Q** - Exit client

**Slash Commands:**
- **/clear** - Clear conversation history
- **/config** - Show saved configuration
- **/lock** - Manually request lock
- **/release** - Release lock manually
- **/quit** or **/exit** - Leave the session
- **/help** - Show available commands

## UI Features

The client uses a modern React-based terminal UI (powered by [Ink](https://github.com/vadimdemedes/ink)):
- Real-time streaming of Claude's responses
- Participant sidebar showing who's connected
- Status bar with lock state and activity indicators
- Clean, flicker-free rendering

## Cloud Deployment (Google Cloud Run)

### Prerequisites

1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Authenticate: `gcloud auth login`
3. Create/select project: `gcloud projects create your-project-id` or use existing

### Deploy

```bash
# Option 1: Pass project ID as argument
./deploy-to-cloud-run.sh your-project-id

# Option 2: Set environment variable
export GCP_PROJECT_ID=your-project-id
./deploy-to-cloud-run.sh

# Option 3: Use gcloud default project
gcloud config set project your-project-id
./deploy-to-cloud-run.sh
```

The script will:
- Build a Docker container
- Push to Google Container Registry
- Deploy to Cloud Run
- Output the WebSocket URL

### Connect to Cloud Deployment

```bash
export SERVER_URL=wss://your-service-xxxxx.run.app
npm run client -- Alice SESSION123
```

The client will save the SERVER_URL for future runs.

## File Tool Support

Claude has access to these file operations on your local machine:

- **read_file** - Read file contents
- **write_file** - Write/create files
- **list_directory** - List directory contents
- **search_files** - Search with glob patterns (e.g., `**/*.ts`)

**Security**: All file paths are validated to be within the project root directory.

**Sync Requirement**: All team members should have the same project structure (synced via git).

## Project Structure

```
shared-claude-session/
├── src/
│   ├── server/
│   │   ├── relay.ts         # WebSocket relay server
│   │   └── database.ts      # SQLite persistence layer
│   ├── client/
│   │   ├── tui-client.ts    # Main TUI client
│   │   ├── api/
│   │   │   └── websocket-client.ts  # WebSocket wrapper
│   │   ├── ui/
│   │   │   └── renderer.ts   # Blessed TUI renderer
│   │   └── tools/
│   │       ├── file-ops.ts   # Tool definitions
│   │       └── executor.ts   # Tool execution
│   └── types.ts             # Shared type definitions
├── data/                    # SQLite database (created at runtime)
├── Dockerfile              # Cloud Run deployment
├── deploy-to-cloud-run.sh  # Deployment script
└── package.json
```

## Configuration

### Persistent Settings

The client automatically saves your settings to `~/.claude-collab/config.json`:
- Server URL
- Username
- Session ID
- API Key

On subsequent runs, you won't need to re-enter these values. Use `/config` to view saved settings.

**Priority order:** Command line args > Environment variables > Saved config > Prompt

### Environment Variables

**Server:**
- `PORT` - Server port (default: 3000, Cloud Run sets this automatically)
- `DB_PATH` - SQLite database path (default: `./data/sessions.db`)
- `NODE_ENV` - Environment (production/development)

**Client:**
- `ANTHROPIC_API_KEY` - Your Anthropic API key (overrides saved config)
- `SERVER_URL` - WebSocket server URL (overrides saved config)

## Troubleshooting

### Connection Issues

**Problem**: Client can't connect to server
```bash
# Check if server is running
curl http://localhost:3000/health

# Check WebSocket connection
wscat -c ws://localhost:3000
```

### API Key Issues

**Problem**: "Invalid API key" error
```bash
# Verify your API key is set
echo $ANTHROPIC_API_KEY

# Test with Anthropic CLI
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

### File Not Found Errors

**Problem**: Claude can't find files
- Ensure all team members have synced the latest code via git
- Check that you're in the project root directory
- Verify file paths are relative to project root

### Lock Issues

**Problem**: Lock stuck or not releasing
- The lock automatically times out after 30 seconds of inactivity
- Use `/release` to manually release the lock
- Disconnect and reconnect to force release

## Development

### Local Development

```bash
# Terminal 1: Server with hot reload
npm run dev:server

# Terminal 2: Client with hot reload
ANTHROPIC_API_KEY=sk-... npm run dev:client -- Alice TEST

# Terminal 3: Another client
ANTHROPIC_API_KEY=sk-... npm run dev:client -- Bob TEST
```

### Building

```bash
npm run build
```

### Docker Build (Local Test)

```bash
docker build -t claude-relay .
docker run -p 8080:8080 -e PORT=8080 claude-relay
```

## Security Considerations

1. **API Keys**: Each developer uses their own Anthropic API key
2. **File Access**: Tools are restricted to project root directory
3. **Session Codes**: Use strong, unique session IDs for privacy
4. **Network**: Cloud Run deployment uses HTTPS/WSS
5. **Authentication**: Consider adding authentication for production use

## Cost & Scaling

### API Costs
- Each developer's usage is billed to their own Anthropic account
- Costs are distributed across the team
- Typical session: $0.10 - $1.00 depending on conversation length

### Cloud Run Costs
- **Free tier**: 2M requests, 360K GB-seconds per month
- **Typical cost**: $5-10/month for small teams
- **Scaling**: Auto-scales from 0 to 10 instances

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test your changes locally
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

Built with:
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Ink](https://github.com/vadimdemedes/ink) - React for CLI apps
- [ws](https://github.com/websockets/ws) - WebSocket library
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database

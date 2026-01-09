# Quick Start Guide

Get up and running with Shared Claude Session in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- An Anthropic API key ([get one here](https://console.anthropic.com/))
- Basic terminal knowledge

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd shared-claude-session

# Install dependencies
npm install

# Build the project
npm run build
```

## Your First Session (Local)

### Step 1: Start the Server

Open a terminal and run:

```bash
npm run dev:server
```

Expected output:
```
🚀 SDK-Based Relay Server running on port 3000
📦 Database initialized at .../data/sessions.db
💚 Health check endpoint: http://localhost:3000/health
```

✅ Server is ready when you see the green checkmark!

### Step 2: Start First Client (Alice)

Open a **new terminal** and run:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
npm run dev:client -- Alice DEMO-SESSION
```

Replace `sk-ant-your-key-here` with your actual Anthropic API key.

You should see:
```
╭─────────────────────────────────────────────────╮
│           Shared Claude Session                 │
│                                                 │
│  Conversation                                   │
│                                                 │
│                                                 │
│─────────────────────────────────────────────────│
│  Status: Connected! Type your message...        │
│─────────────────────────────────────────────────│
│  Your Message (Ctrl+Enter to send)              │
│                                                 │
╰─────────────────────────────────────────────────╯
```

### Step 3: Start Second Client (Bob)

Open a **third terminal** and run:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
npm run dev:client -- Bob DEMO-SESSION
```

⚡ **Important**: Use the **same session ID** (`DEMO-SESSION`)!

### Step 4: Collaborate!

In Alice's terminal:
1. Type: `Hello, can you help us with a coding problem?`
2. Press **Ctrl+Enter**

Both Alice and Bob will see:
- The message being sent
- Claude thinking (with animated spinner)
- Claude's response streaming in real-time

Try Bob sending a follow-up message!

## Common Commands

| Command | Action |
|---------|--------|
| **Ctrl+Enter** | Send message (auto-requests lock) |
| **/lock** | Manually request lock |
| **/release** | Release lock |
| **/quit** | Exit session |
| **/help** | Show help |
| **Ctrl+C** | Force exit |

## Using File Tools

Claude can work with your local files! Try this:

```
Alice: Can you read the package.json file and tell me what dependencies we have?
```

Claude will execute the `read_file` tool on both Alice's and Bob's machines (assuming they have the same project structure).

**Available file tools**:
- `read_file` - Read any file in your project
- `write_file` - Create or modify files
- `list_directory` - List directory contents
- `search_files` - Find files with glob patterns (e.g., `**/*.ts`)

## Cloud Deployment (5 minutes)

Want to collaborate with remote teammates? Deploy to Google Cloud Run:

### Prerequisites

1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Login: `gcloud auth login`
3. Set project: `gcloud config set project YOUR-PROJECT-ID`

### Deploy

```bash
chmod +x deploy-to-cloud-run.sh
./deploy-to-cloud-run.sh
```

The script will output something like:
```
✅ Deployment complete!

🌐 Service URL: https://claude-relay-xxxxx-uc.a.run.app
🔌 WebSocket URL: wss://claude-relay-xxxxx-uc.a.run.app

To use with your clients, set:
export SERVER_URL=wss://claude-relay-xxxxx-uc.a.run.app
```

### Connect to Cloud Deployment

```bash
export SERVER_URL=wss://claude-relay-xxxxx-uc.a.run.app
export ANTHROPIC_API_KEY=sk-ant-your-key
npm run client -- YourName MY-SESSION
```

Share the `SERVER_URL` and session ID with your team!

## Troubleshooting

### "Connection failed"

**Problem**: Can't connect to server

**Solution**:
```bash
# Check if server is running
curl http://localhost:3000/health

# Should return: {"status":"healthy","sessions":0,"uptime":123}
```

If server isn't running, start it with `npm run dev:server`

### "Invalid API key"

**Problem**: API key not working

**Solution**:
```bash
# Check if key is set
echo $ANTHROPIC_API_KEY

# Should print: sk-ant-...

# If not, export it:
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### "File not found"

**Problem**: Claude can't find files

**Solution**:
- Make sure you're in the project root directory
- All team members should have the same project structure (use `git pull`)
- File paths should be relative (e.g., `src/index.ts`, not `/home/user/project/src/index.ts`)

### Lock is stuck

**Problem**: Can't get the lock

**Solution**:
- Wait 30 seconds (lock auto-timeout)
- Or use `/release` command
- Or disconnect and reconnect

## Production Tips

### For Long Sessions

Create a shell alias for convenience:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias claude-join='ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npm run client --'

# Then use:
claude-join Alice MY-SESSION
```

### For Remote Teams

1. Deploy server to Cloud Run (see above)
2. Share the WebSocket URL with team
3. Each person uses their own API key
4. Pick a shared session ID (e.g., `TEAM-SPRINT-2024`)

### For Security

1. **Use strong session IDs**: `PROJECT-$(openssl rand -hex 8)`
2. **Rotate session IDs**: Create new IDs for each day/sprint
3. **Don't commit API keys**: Keep them in environment variables
4. **Sync via git**: Ensure all files are version controlled

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check the [architecture diagram](README.md#architecture) to understand the system
- Explore [file tool capabilities](README.md#file-tool-support)
- Learn about [cloud deployment options](README.md#cloud-deployment-google-cloud-run)

## Getting Help

- **Issues**: Open a GitHub issue
- **Questions**: Check the [troubleshooting section](README.md#troubleshooting)
- **Examples**: See the README for more use cases

---

**Ready to collaborate?** Start the server and invite your teammates! 🚀

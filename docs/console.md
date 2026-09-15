# Console (Web Terminal)

An interactive web terminal into a running agent's Docker container. Spawns a real PTY on the host running `docker exec -it` into the agent's container, streaming input/output and handling terminal resize — giving users a full bash/sh shell inside the agent.

## TL;DR

- WebSocket gateway (Socket.IO namespace `/console`), not HTTP.
- Client connects with `?agentId=<id>` query param.
- Spawns `node-pty` running `docker exec -it` into the container.
- Bidirectional stream: xterm.js ↔ Socket.IO ↔ node-pty ↔ docker exec.
- One PTY per WebSocket connection; no multiplexing or session resume.

## How it works

```
Browser (xterm.js)          Host (NestJS)               Docker container
      │                         │                              │
      │ ws://api/console?agentId=...                          │
      ├────────────────────────►│                              │
      │                         │ resolve containerId from DB  │
      │                         │ pty.spawn('docker exec -it') │
      │                         ├─────────────────────────────►│
      │                         │                              │
      │  'input' (keystrokes)   │                              │
      ├────────────────────────►│  write to PTY                │
      │                         ├─────────────────────────────►│
      │                         │                              │
      │  'output' (terminal)    │  PTY onData                  │
      │◄────────────────────────┤◄─────────────────────────────┤
      │                         │                              │
      │  'resize' {cols,rows}   │  ptyProcess.resize()         │
      ├────────────────────────►├─────────────────────────────►│
```

- **On connection**: reads `agentId` from the handshake query, resolves the agent's current `containerId` from the DB (important because restart creates a new container with a different ID), gets the exec context (user uid + home path).
- Spawns: `pty.spawn('docker', ['exec','-it','-e','HOME=...','-e','TERM=xterm-256color','--user',<uid>,<containerId>,'/bin/sh','-c','command -v bash && exec bash || exec sh'])`.
- `node-pty` + `docker exec -it` is used deliberately to avoid dockerode's hijack-mode raw TCP socket issues and get clean terminal I/O with correct escape sequences.
- Default terminal size: 80×24.
- **Resize**: buffered in `pendingResize` if it arrives before PTY spawn completes; applied once PTY is ready.
- **On exit**: if no output was ever produced, emits an error ("Container may not be running"), then `disconnect_reason: 'process_exited'` and disconnects.

## Messages & events

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| Client → Server | `input` | string | Keystrokes into the PTY |
| Client → Server | `resize` | `{cols, rows}` | Resize the PTY |
| Server → Client | `output` | string | Terminal data from PTY |
| Server → Client | `error` | string | Error message |
| Server → Client | `disconnect_reason` | `'process_exited'` | PTY exited |

## Standalone console

The console is also available full-screen outside the app shell at route `/console/:agentName` (`StandaloneConsole` component), for deep-linking and embedded use.

## Current limitations

- **One PTY per connection** — no multiplexing or session sharing; disconnecting kills the shell.
- **No reconnection/session resume** — a dropped socket terminates the terminal.
- Auto-launches `bash` if available, else `sh` (no user-selectable shell).
- **Admin auth required** — the WS handshake verifies the `codepods_token` HttpOnly cookie via `AuthService.validateToken()`. Unauthenticated connections are rejected before the `agentId` check.

## Key files

| File | Role |
|---|---|
| `apps/api/src/console/console.gateway.ts` | WebSocket gateway, PTY management |
| `apps/api/src/console/console.module.ts` | Module wiring |
| `apps/web/src/components/agents/AgentConsole.tsx` | xterm.js frontend component |
| `apps/web/src/components/agents/StandaloneConsole.tsx` | Full-screen console route |
# Network Security & Egress Filtering

CodePods runs agent containers on an **internal Docker network** with no direct internet access, routing all traffic through a host-side **egress proxy**. The proxy serves two independent functions: **API gateway** (always on, injects agent identity for authentication) and **internet filter** (configurable domain whitelist). This document covers the architecture, the agent identity mechanism, and the **host firewall requirements**.

## TL;DR

- Agents always run on a `--internal` Docker network (`codepods-agents`) with no internet route.
- The egress proxy **always starts** and serves as the **API gateway**: it forwards container→host API requests, injecting `X-Agent-Id` + `X-Agent-Sig` (HMAC) based on the container's source IP (see [Agent Gateway](./agent-gateway.md)).
- **Internet filtering** is controlled by `networkSecurity.filterInternetEgress` (default `true`): when ON, outbound internet traffic is checked against the egress whitelist; when OFF, internet traffic is forwarded without filtering.
- Disabling `filterInternetEgress` does **not** disable the API gateway — agents always need the proxy to authenticate with the host API.
- The proxy handles `CONNECT` (HTTPS tunneling, raw TCP — no MITM) and plain HTTP forwarding.
- Temporary egress exceptions can be granted per-host via the human-in-the-loop approval system.
- CAP_NET_RAW is dropped by default (`networkSecurity.dropNetRaw`) to prevent IP spoofing from inside containers.
- Host firewall (ufw) rules must explicitly allow the container subnet to reach port 8888 (proxy).

## Architecture overview

```
Agent container (<codepods-agents subnet>)
  │  --internal network "codepods-agents" (no external route)
  │  HTTP_PROXY / HTTPS_PROXY / NO_PROXY → http://host.docker.internal:<proxyPort>
  │  (lowercase variants http_proxy/https_proxy/no_proxy also set)
  │  host.docker.internal → <gateway IP of the internal network>
  │
  ▼
Egress proxy :0.0.0.0:<proxyPort>  (default 8888)
  ├─ API gateway (always ON): host.docker.internal:<apiPort> → 127.0.0.1:<apiPort>
  │    injects X-Agent-Id (from source IP) + X-Agent-Sig (HMAC-SHA256)
  └─ Internet filter (filterInternetEgress): whitelist check → forward or deny
  │
  ▼
Host (NestJS API process)
  └─ API :0.0.0.0:<apiPort>  (default 3000) — accepts proxy requests from 127.0.0.1
```

- **Network**: `codepods-agents` — a Docker bridge network created with `--internal` (no internet route). Agents always attach to it.
- **Gateway bind**: On `--internal` networks, the `host-gateway` extra-hosts token does not reliably resolve. CodePods queries the network's `IPAM.Config[].Gateway` at container create/recreate time and binds `host.docker.internal` to that explicit IP. This is queried fresh each time — it is not hardcoded.
- **Proxy**: `EgressProxyService` is a Node `http.Server` inside the API process. It always starts on module init. It handles two traffic types:
  - **API requests** (`host.docker.internal:<apiPort>`) — forwarded to `127.0.0.1:<apiPort>` with agent identity headers. No whitelist check. Always active. See [Agent Gateway](./agent-gateway.md).
  - **Internet traffic** (all other hosts) — when `filterInternetEgress` is ON, checked against the whitelist; when OFF, forwarded without filtering.
  - `CONNECT` (HTTPS tunneling, whitelist-checked by host, raw TCP relay — no MITM) and plain HTTP forwarding are both supported.
- **NO_PROXY**: set to `localhost,127.0.0.1` — `host.docker.internal` is intentionally excluded so all container→host traffic goes through the proxy.

## Host firewall requirements

When the host runs a firewall with a default **deny incoming** policy (e.g. `ufw`), container → host traffic is dropped unless explicitly allowed. Agent containers need to reach one host port:

| Port (default) | Service           | Required for                          |
|----------------|-------------------|---------------------------------------|
| `8888`         | Egress proxy      | API gateway + outbound internet       |

The API port (`3000`) does **not** need to be opened to the container subnet — the proxy forwards API requests to `127.0.0.1:3000` from within the host process. Direct container→API access is rejected by the auth guard (requests not from `127.0.0.1` are denied). See [Agent Gateway](./agent-gateway.md).

### ufw rules

First, find the subnet of the `codepods-agents` network:

```bash
docker network inspect codepods-agents --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Then allow that subnet to reach the proxy port (example with `172.20.0.0/16`):

```bash
sudo ufw allow from 172.20.0.0/16 to any port 8888 proto tcp comment 'Codepods agents -> egress proxy'
```

> **Subnet is dynamic**: Docker assigns the subnet when the network is created. If the `codepods-agents` network is deleted and recreated, the subnet may change — re-run the `inspect` + `allow` commands with the new subnet. The subnet is stable as long as the network persists.

### Verifying

```bash
# Confirm the rules are active
sudo ufw status numbered

# From inside an agent container, test reachability
docker exec <container> curl -sS --max-time 5 -x http://host.docker.internal:8888 http://127.0.0.1:3000/api/health 2>&1 || echo "Proxy unreachable"
docker exec <container> curl -sS --max-time 5 -x http://host.docker.internal:8888 http://api.github.com 2>&1 || echo "Internet unreachable"
```

## Configuration reference

| Config key                                  | Default | Description                                            |
|---------------------------------------------|---------|--------------------------------------------------------|
| `networkSecurity.filterInternetEgress`      | `true`  | When ON, internet traffic is checked against the whitelist. When OFF, internet traffic is forwarded without filtering. The API gateway function is always active regardless of this setting. |
| `networkSecurity.proxyPort`                 | `8888`  | Port the egress proxy listens on.                     |
| `networkSecurity.egressWhitelist`           | (from `default-egress-whitelist.txt`) | List of allowed hostnames/domains for outbound internet traffic. Supports wildcard suffixes (`*.npmjs.org`). |
| `networkSecurity.dropNetRaw`                | `true`  | When ON, drops `CAP_NET_RAW` from agent containers to prevent IP spoofing. Has no effect when `docker.capDropAll` is `true` (NET_RAW already covered). |

> The agent network name (`codepods-agents`) is a hardcoded constant in `DockerService`, not a config key.
>
> **Migration**: configs using the old key `filterEgress` are automatically migrated to `filterInternetEgress` on startup.

## Troubleshooting

- **`Network is unreachable (os error 101)`** — `host.docker.internal` didn't resolve to the gateway IP. Check `docker inspect <container> --format '{{json .HostConfig.ExtraHosts}}'` shows `host.docker.internal:<gateway-ip>`.
- **`operation timed out`** — the route exists but packets are dropped. This is almost always the **host firewall**. Check ufw rules cover the container's actual subnet (not an old/different subnet).
- **Subnet mismatch** — the most common cause of timeouts after enabling egress. The ufw rule was written for one subnet (e.g. `192.168.220.0/24` for docker0) but the agent is now on the `codepods-agents` subnet (e.g. `172.17.0.0/16`). Re-inspect and add the correct rule.
- **`I have no name!`** in the container console — cosmetic; the agent runs as a numeric uid not present in `/etc/passwd` and the container FS is read-only. Not a network issue.

## Temporary egress exceptions

In addition to the static whitelist, CodePods supports temporary per-host exceptions, approved via the human-in-the-loop request system:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/egress/temp-exceptions` | List active temporary exceptions |
| POST | `/api/egress/temp-exception` | Add a temporary exception (host + duration in minutes) |
| DELETE | `/api/egress/temp-exception/:host` | Remove a temporary exception |

When an agent requests egress access (via the MCP `request_access` tool) and the user approves it, the approved host is added as a temporary exception for the specified duration. See [Agents](./agents.md) for the request/approval system.

## Current limitations

- **No per-agent whitelists** — the egress whitelist is global; all agents on the internal network share the same allowed domains.
- **No HTTPS interception** — the proxy tunnels `CONNECT` requests as raw TCP; it cannot inspect or filter HTTPS request paths/bodies (only the destination host is checked).
- **Subnet is not pinned** — Docker assigns the subnet at network creation; firewall rules must be updated manually if the network is recreated.
- **No DNS filtering** — the proxy checks the `Host` header / `CONNECT` target; DNS resolution inside the container is not filtered.
- **API gateway always on** — the proxy cannot be fully disabled; the API gateway function is always active so agents can authenticate with the host API. Only internet filtering is toggleable via `filterInternetEgress`.

## Key files

| File | Role |
|---|---|
| `apps/api/src/egress-proxy/egress-proxy.service.ts` | `EgressProxyService` — API gateway (identity injection) + internet filter (CONNECT tunnel, HTTP forward, whitelist, temp exceptions) |
| `apps/api/src/egress-proxy/egress-proxy.controller.ts` | Temp exception management endpoints (add/remove/list) |
| `apps/api/src/docker/docker.service.ts` | Creates `codepods-agents` `--internal` network, binds `host.docker.internal` to gateway IP, maintains IP→agentId map |
| `apps/api/src/auth/auth.guard.ts` | Validates `X-Agent-Id` + `X-Agent-Sig` from proxy (127.0.0.1), rejects direct container access |
| `apps/api/src/config/` | `networkSecurity.*` config keys (filterInternetEgress, proxyPort, egressWhitelist, dropNetRaw) |
# Codepods agent image - type: codex
FROM ubuntu:24.04

LABEL com.codepods.managed=true

RUN apt-get update && apt-get install -y \
    curl nodejs npm nano git sudo ca-certificates gnupg gettext-base tmux \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex

# ttyd — terminal web (binario estático)
RUN curl -fsSL "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64" \
    -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd

# Agent instructions (build-files)
COPY build-files/AGENTS.md /root/.agent/

WORKDIR /workspace

COPY start.sh /usr/local/bin/codex-start
COPY entrypoint.sh /usr/local/bin/codex-entrypoint
RUN chmod +x /usr/local/bin/codex-start /usr/local/bin/codex-entrypoint

ENTRYPOINT ["/usr/local/bin/codex-entrypoint"]

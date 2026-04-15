# Codepods agent image - type: copilot (scaffold)
FROM ubuntu:24.04

LABEL com.codepods.managed=true

RUN apt-get update && apt-get install -y \
    curl nodejs npm nano git sudo ca-certificates gnupg gettext-base tmux \
    && npm install -g @github/copilot \
    && rm -rf /var/lib/apt/lists/*

# ttyd — terminal web (binario estático)
RUN curl -fsSL "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64" \
    -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd

# Agent instructions (build-files)
COPY build-files/AGENTS.md /root/.agent/

WORKDIR /workspace

COPY start.sh /usr/local/bin/copilot-start
COPY entrypoint.sh /usr/local/bin/copilot-entrypoint
RUN chmod +x /usr/local/bin/copilot-start /usr/local/bin/copilot-entrypoint

ENTRYPOINT ["/usr/local/bin/copilot-entrypoint"]

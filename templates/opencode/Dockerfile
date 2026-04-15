# Codepods agent image - type: opencode
FROM ubuntu:24.04

LABEL com.codepods.managed=true

RUN apt-get update && apt-get install -y \
    curl nodejs npm nano git sudo ca-certificates gnupg gettext-base tmux \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g opencode-ai

# ttyd — terminal web (binario estático)
RUN curl -fsSL "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64" \
    -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd

# Agent instructions (build-files)
COPY build-files/AGENTS.md /root/.agent/

WORKDIR /workspace

COPY start.sh /usr/local/bin/opencode-start
COPY entrypoint.sh /usr/local/bin/opencode-entrypoint
RUN chmod +x /usr/local/bin/opencode-start /usr/local/bin/opencode-entrypoint

ENTRYPOINT ["/usr/local/bin/opencode-entrypoint"]

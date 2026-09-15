import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, type Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

interface AgentConsoleProps {
  agentId: string;
  active: boolean;
}

export function AgentConsole({ agentId, active }: AgentConsoleProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current || !active) return;

    const term = new XTerm({
      theme: {
        background: '#141414',
        foreground: '#e4e4e7',
        cursor: '#0ea5e9',
        selectionBackground: '#0ea5e933',
        black: '#1a1a1a',
        brightBlack: '#3f3f46',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      convertEol: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fit several times after mount — the layout may still be settling
    // (secondary panel collapsing, workspace drawer opening), so a single
    // requestAnimationFrame fit can measure the wrong size. Retry with
    // increasing delays until the terminal has a stable non-trivial size.
    const fitRetries = [0, 30, 80, 180, 400];
    let cancelled = false;
    const scheduleFits = () => {
      for (const delay of fitRetries) {
        setTimeout(() => {
          if (cancelled) return;
          try {
            fitAddon.fit();
          } catch {
            // container may be hidden (inactive) — try later
          }
        }, delay);
      }
    };
    scheduleFits();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const socket = io('/console', {
      query: { agentId },
      transports: ['websocket'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Send initial terminal size after connection
      fitAddon.fit();
      socket.emit('resize', { cols: term.cols, rows: term.rows });
    });

    socket.on('output', (data: string) => {
      term.write(data);
    });

    socket.on('error', (msg: string) => {
      term.writeln(`--- error: ${msg} ---`);
    });

    socket.on('disconnect', () => {
      term.writeln('--- disconnected ---');
    });

    term.onData((data) => socket.emit('input', data));

    // Forward terminal resize to backend
    term.onResize(({ cols, rows }) => socket.emit('resize', { cols, rows }));

    // Observe container size changes and refit (debounced)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        socket.emit('resize', { cols: term.cols, rows: term.rows });
      }, 50);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      socket.disconnect();
      term.dispose();
      termRef.current = null;
      socketRef.current = null;
      fitAddonRef.current = null;
    };
  }, [agentId, active]);

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm bg-background rounded">
        {t('agents.stopped')}
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded bg-background p-2">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}

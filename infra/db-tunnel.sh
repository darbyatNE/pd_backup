#!/usr/bin/env bash
#
# db-tunnel.sh — one self-healing command for the local SSH tunnel to RDS.
#
# Locally the backend reaches RDS through an SSH tunnel: the `powerdime-ec2`
# host in ~/.ssh/config forwards 127.0.0.1:5432 -> RDS:5432, and .env sets
# DB_HOST=127.0.0.1. This script replaces the manual "keep an ssh window open"
# step with an idempotent, auto-reconnecting background tunnel.
#
# Commands:
#   up      (default) ensure the tunnel is running; reconnects itself if dropped
#   status  show whether the tunnel is listening + how it's managed
#   stop    stop a tunnel started by this script
#
# `up` is idempotent and always exits 0, so it is safe to chain before dev
# (e.g. an npm "predev" hook) without ever blocking frontend-only work.
#
# Uses autossh if installed (native auto-reconnect); otherwise runs ssh in a
# background watchdog loop that re-establishes the tunnel when it drops.

set -uo pipefail

HOST="${TUNNEL_SSH_HOST:-powerdime-ec2}"
PORT="${TUNNEL_LOCAL_PORT:-5432}"
PIDFILE="${POWERDIME_TUNNEL_PIDFILE:-/tmp/powerdime-db-tunnel.pid}"
LOG="${POWERDIME_TUNNEL_LOG:-/tmp/powerdime-db-tunnel.log}"
SSH_OPTS=(-o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=10)

cmd="${1:-up}"

port_up()  { ss -tln 2>/dev/null | grep -q "127.0.0.1:${PORT} " || lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; }
listener() { ss -tlnp 2>/dev/null | grep "127.0.0.1:${PORT} " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }
watchdog_running() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; }

case "$cmd" in
  up)
    if port_up; then
      echo "✅ tunnel already up on 127.0.0.1:${PORT} (listener pid: $(listener || echo '?'))"
      watchdog_running && echo "   managed by this script (watchdog pid $(cat "$PIDFILE"))" \
                       || echo "   note: started outside this script — run 'stop' won't manage it"
      exit 0
    fi

    if command -v autossh >/dev/null 2>&1; then
      echo "Starting self-healing tunnel via autossh -> $HOST ..."
      AUTOSSH_GATETIME=0 autossh -M 0 -f -N "${SSH_OPTS[@]}" "$HOST"
    else
      echo "Starting self-healing tunnel via ssh watchdog -> $HOST ..."
      # Background loop: reconnect whenever ssh exits. -N = no command, foreground
      # inside the loop so its exit drives the retry. Detached via setsid/nohup.
      nohup bash -c '
        while true; do
          ssh -N '"${SSH_OPTS[*]}"' '"$HOST"'
          echo "$(date "+%F %T") tunnel dropped; reconnecting in 3s" >> "'"$LOG"'"
          sleep 3
        done
      ' >>"$LOG" 2>&1 &
      echo $! > "$PIDFILE"
      disown 2>/dev/null || true
    fi

    # Wait up to ~12s for the forward to come up.
    for _ in $(seq 1 24); do port_up && break; sleep 0.5; done
    if port_up; then
      echo "✅ tunnel up on 127.0.0.1:${PORT} (log: $LOG)"
    else
      echo "⚠️  tunnel did not come up within timeout. Check: ssh $HOST   (log: $LOG)"
      echo "   (continuing anyway so dev can still run for frontend-only work)"
    fi
    exit 0
    ;;

  status)
    if port_up; then
      echo "✅ listening on 127.0.0.1:${PORT} (pid: $(listener || echo '?'))"
    else
      echo "❌ not listening on 127.0.0.1:${PORT}"
    fi
    watchdog_running && echo "watchdog: running (pid $(cat "$PIDFILE"))" || echo "watchdog: not running"
    [[ -f "$LOG" ]] && { echo "--- last log lines ---"; tail -n 5 "$LOG"; }
    ;;

  stop)
    stopped=0
    if watchdog_running; then
      pid="$(cat "$PIDFILE")"
      # kill the watchdog and its ssh child(ren)
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      rm -f "$PIDFILE"
      echo "stopped watchdog (pid $pid)"; stopped=1
    fi
    if command -v autossh >/dev/null 2>&1 && pgrep -f "autossh.*$HOST" >/dev/null 2>&1; then
      pkill -f "autossh.*$HOST" 2>/dev/null || true
      echo "stopped autossh for $HOST"; stopped=1
    fi
    [[ $stopped -eq 0 ]] && echo "no tunnel managed by this script (a manual 'ssh $HOST' won't be touched)"
    ;;

  *)
    echo "usage: $0 [up|status|stop]"; exit 2 ;;
esac

---
name: debug-telegram-polling-conflict
description: Diagnose and resolve Telegram polling conflicts when Hermes gateway fails to connect due to another bot instance using the same token.
version: 1.0.0
author: Hermes Agent
tags: [hermes, telegram, debugging, gateway]
---

# Debug: Telegram Polling Conflict

## Symptom
```
WARNING gateway.platforms.telegram: [Telegram] Telegram polling conflict (1/3)
Error: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```
Gateway appears running but Telegram never connects, conflicts repeat indefinitely.

## Root Cause
Another process (e.g., openclaw-gateway, another bot) is using the same Telegram bot token via long-polling, preventing Hermes from establishing its own connection.

## Diagnosis Steps

1. **Check active processes using Telegram**
   ```bash
   ss -tnp | grep "149.154"
   ```
   All IPs in the `149.154.x.x` range are Telegram backend servers.

2. **Identify which PID owns each Telegram connection**
   ```bash
   ss -tnp | grep "149.154"
   # Example output:
   # ESTAB 0 0 172.28.168.38:50476 149.154.166.110:443 users:(("openclaw-gatewa",pid=4439,fd=31))
   # ESTAB 0 0 172.28.168.38:50480 149.154.166.110:443 users:(("python",pid=4454,fd=13))
   ```

3. **Check what each process is**
   ```bash
   cat /proc/<PID>/cmdline | tr '\0' ' '
   ps aux | grep <PID>
   ```

## Resolution

1. **Kill the conflicting process**
   ```bash
   kill -9 <PID>
   # or
   pkill -9 openclaw
   ```

2. **If the conflicting process is a systemd service, disable it**
   ```bash
   systemctl --user stop <service-name>
   systemctl --user disable <service-name>
   ```

3. **Restart Hermes gateway**
   ```bash
   hermes gateway restart
   ```

4. **Verify**
   ```bash
   hermes gateway status
   journalctl --user -u hermes-gateway -n 20 --no-pager
   ss -tnp | grep "149.154"  # should show only Hermes PIDs
   ```

## Pitfalls
- The conflicting process may auto-restart via systemd. If so, `systemctl --user disable` is required.
- Old Telegram polling sessions can persist for ~60s after killing the other process. Wait and restart Hermes if needed.
- `hermes gateway restart` sometimes leaves the old process running. Use `kill -9 <OLD_PID>` explicitly before restarting.

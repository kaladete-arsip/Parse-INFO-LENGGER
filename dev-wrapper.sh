#!/bin/bash
# Self-restarting wrapper: if next dev dies, restart it.
cd /home/z/my-project
while true; do
  echo "[$(date +%H:%M:%S)] starting next dev..." >> dev.log
  bun run dev >> dev.log 2>&1
  echo "[$(date +%H:%M:%S)] next dev exited (code $?), restarting in 3s..." >> dev.log
  sleep 3
done

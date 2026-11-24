#!/bin/sh
# Starts the local game server and opens the game. Needs Python 3.
cd "$(dirname "$0")"
( sleep 1; (open http://localhost:8000/index.html || xdg-open http://localhost:8000/index.html) >/dev/null 2>&1 ) &
python3 server.py

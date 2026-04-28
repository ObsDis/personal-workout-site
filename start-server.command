#!/bin/bash
cd "$(dirname "$0")"
echo "Serving workout app at http://localhost:8765"
echo "Leave this window open. Close it (or Ctrl-C) to stop the server."
python3 -m http.server 8765

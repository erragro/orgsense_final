"""
worker_health.py — Cloud Run HTTP health wrapper for worker containers.

Cloud Run requires a container to bind an HTTP server on $PORT.
Workers (Celery, poll-loop) don't serve HTTP, so this script:
  1. Starts a tiny HTTP health server on $PORT in a background thread.
  2. Runs the actual worker command (passed as argv[1:]) in the foreground.

Usage (in Cloud Run --command / --args):
  python worker_health.py celery -A app.l4_agents.tasks worker --loglevel=info
  python worker_health.py -m app.l4_agents.worker
"""
import os
import sys
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass  # silence per-request access logs


def _serve(port: int) -> None:
    HTTPServer(("", port), HealthHandler).serve_forever()


port = int(os.environ.get("PORT", 8080))
threading.Thread(target=_serve, args=(port,), daemon=True).start()
print(f"[worker_health] HTTP health server listening on :{port}", flush=True)

if len(sys.argv) < 2:
    print("[worker_health] ERROR: no worker command given as argv[1:]", file=sys.stderr)
    sys.exit(1)

result = subprocess.run(sys.argv[1:])
sys.exit(result.returncode)

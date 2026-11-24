#!/usr/bin/env python3
"""Local server for Road To Pro with a built-in updater.

Run it with START-WINDOWS.bat or start-mac-linux.sh (needs Python 3). It serves the game on
http://localhost:8000 and, when you press "Updates" in the game, downloads the latest version of the
`main` branch from GitHub and replaces the game files in this folder. It only listens on this computer.
"""
import http.server
import io
import json
import os
import posixpath
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = "voken3959/rl-career-mode"
BRANCH = "main"
PORT = 8000
# Never overwritten by an update (the running server and launchers), and not shipped to players.
KEEP = {"server.py", "START-WINDOWS.bat", "start-mac-linux.sh", "HOW-TO-RUN.txt"}
SKIP_DIRS = ("tools/",)
VERSION_FILE = os.path.join(ROOT, ".version")
MANIFEST_FILE = os.path.join(ROOT, ".files.json")
HEADERS = {"User-Agent": "road-to-pro-local-updater"}


def read(path, default=""):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return default


def fetch(url, accept=None):
    headers = dict(HEADERS)
    if accept:
        headers["Accept"] = accept
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
        return response.read()


def remote_version():
    return fetch(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}", "application/vnd.github.sha").decode().strip()


def safe_target(relative):
    target = os.path.normpath(os.path.join(ROOT, relative))
    if not target.startswith(ROOT + os.sep):
        raise ValueError("unsafe path in update: " + relative)
    return target


def update():
    sha = remote_version()
    archive = zipfile.ZipFile(io.BytesIO(fetch(f"https://codeload.github.com/{REPO}/zip/refs/heads/{BRANCH}")))
    written = []
    for info in archive.infolist():
        if info.is_dir():
            continue
        relative = info.filename.split("/", 1)[1] if "/" in info.filename else info.filename
        if not relative or relative in KEEP or relative.startswith(SKIP_DIRS):
            continue
        target = safe_target(relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        temporary = target + ".part"
        with open(temporary, "wb") as f:
            f.write(archive.read(info))
        os.replace(temporary, target)
        written.append(relative)
    # Remove files that the new version no longer has.
    try:
        previous = json.loads(read(MANIFEST_FILE, "[]"))
    except ValueError:
        previous = []
    for relative in previous:
        if relative not in written and relative not in KEEP:
            try:
                os.remove(safe_target(relative))
            except (OSError, ValueError):
                pass
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(written, f)
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(sha)
    return sha, len(written)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if posixpath.normpath(self.path.split("?")[0]) == "/__update-check":
            local = read(VERSION_FILE, "unknown")
            try:
                remote = remote_version()
                self.reply(200, {"local": local, "remote": remote, "available": remote != local})
            except Exception as error:  # network down, rate limit, repo private
                self.reply(200, {"local": local, "error": str(error)})
            return
        super().do_GET()

    def do_POST(self):
        # The custom header cannot be sent by another website without a CORS preflight, which we never allow.
        if self.path == "/__update" and self.headers.get("X-Road-To-Pro") == "update":
            try:
                sha, count = update()
                self.reply(200, {"ok": True, "version": sha, "files": count})
            except Exception as error:
                self.reply(500, {"ok": False, "error": str(error)})
            return
        self.reply(404, {"ok": False})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Road To Pro is running at http://localhost:{PORT}/index.html  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

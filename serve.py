#!/usr/bin/env python3
"""
Serves the mirror at http://localhost:8000 and does the fetching the browser
is not allowed to do itself (CORS), so everything looks same-origin to the page.
All keys and tokens live in ONE file next to this script: secrets.txt
(see secrets.txt.example). They are added to requests here, never sent to the browser.

Run:  python3 serve.py        (needs only Python 3, no installs)

  /proxy?url=...   forwards a few allowed public feeds (news)
  /calendar.ics    fetches the CALENDAR_URL address(es) from secrets.txt
  /todoist/...     read-only Todoist API calls, with TODOIST_TOKEN
  /hsl             HSL (Digitransit) GraphQL queries, with HSL_API_KEY
"""
import os, time, urllib.error, urllib.parse, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
BASE = os.path.dirname(os.path.abspath(__file__))
ALLOWED_HOSTS = {"yle.fi", "feeds.yle.fi", "opendata.fmi.fi"}  # add more if needed
CACHE_SECONDS = 300
SECRETS_FILE = "secrets.txt"
OLD_FILES = {"calendar_url.txt": "CALENDAR_URL", "todoist_token.txt": "TODOIST_TOKEN"}  # older layout, still read
PRIVATE_PATHS = {"/" + n for n in [SECRETS_FILE, *OLD_FILES]}   # never served as static files
TODOIST_BASE = "https://api.todoist.com/api/v1/"
TODOIST_ALLOWED = {"tasks", "tasks/filter", "projects"}      # read-only endpoints only
TODOIST_CACHE_SECONDS = 60
HSL_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1"
MAX_POST_BYTES = 20000
cache = {}  # url -> (time, content_type, body)
warned = set()


def load_secrets():
    """KEY=value lines from secrets.txt -> {KEY: [values]}. A key may repeat (several calendars).
    Files from the older layout (calendar_url.txt, todoist_token.txt) are still read as a fallback."""
    found = {}
    path = os.path.join(BASE, SECRETS_FILE)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip().strip('"').strip("'")
                if value:
                    found.setdefault(key.strip().upper(), []).append(value)
    for name, key in OLD_FILES.items():
        old = os.path.join(BASE, name)
        if key in found or not os.path.exists(old):
            continue
        with open(old, encoding="utf-8") as f:
            values = [l.strip() for l in f if l.strip() and not l.strip().startswith("#")]
        if values:
            found[key] = values if key == "CALENDAR_URL" else values[:1]
            if name not in warned:
                warned.add(name)
                print(f"Note: reading {name}. Move it into {SECRETS_FILE} as {key}=... to keep all keys in one place.")
    return found


def secret(key):
    values = load_secrets().get(key, [])
    return values[0] if values else ""


def fetch_cached(url, headers=None, ttl=CACHE_SECONDS):
    hit = cache.get(url)
    if hit and time.time() - hit[0] < ttl:
        return hit[1], hit[2]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "personal-mirror", **(headers or {})})
        with urllib.request.urlopen(req, timeout=15) as r:
            ctype = r.headers.get("Content-Type", "application/xml")
            body = r.read()
        cache[url] = (time.time(), ctype, body)
        return ctype, body
    except urllib.error.HTTPError as e:
        if e.code >= 500 and hit:  # server trouble: serve a stale copy; client errors (bad token) pass through
            return hit[1], hit[2]
        raise
    except Exception:
        if hit:  # network trouble: serve a stale copy rather than failing
            return hit[1], hit[2]
        raise


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path in PRIVATE_PATHS:
            return self.reply(404, "text/plain", b"Not found")
        if path == "/proxy":
            return self.proxy(urllib.parse.parse_qs(parsed.query).get("url", [""])[0])
        if path == "/calendar.ics":
            return self.calendar()
        if path.startswith("/todoist/"):
            return self.todoist(path[len("/todoist/"):], parsed.query)
        return super().do_GET()

    def do_POST(self):
        if urllib.parse.unquote(urllib.parse.urlparse(self.path).path) == "/hsl":
            return self.hsl()
        self.reply(404, "text/plain", b"Not found")

    def proxy(self, target):
        if urllib.parse.urlparse(target).hostname not in ALLOWED_HOSTS:
            return self.reply(403, "text/plain", b"Host not allowed")
        try:
            ctype, body = fetch_cached(target)
            self.reply(200, ctype, body)
        except Exception as e:
            self.reply(502, "text/plain", f"Upstream error: {e}".encode())

    def hsl(self):
        key = secret("HSL_API_KEY")
        if not key:
            return self.reply(401, "application/json", b'{"error":"no_key"}')
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_POST_BYTES:
            return self.reply(413, "application/json", b'{"error":"bad_size"}')
        body = self.rfile.read(length)
        req = urllib.request.Request(HSL_ENDPOINT, data=body, method="POST", headers={
            "Content-Type": "application/json", "digitransit-subscription-key": key, "User-Agent": "personal-mirror"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                self.reply(200, "application/json", r.read())
        except urllib.error.HTTPError as e:      # e.g. 401 for a wrong key
            self.reply(e.code, "application/json", b'{"error":"hsl_http_%d"}' % e.code)
        except Exception:
            self.reply(502, "application/json", b'{"error":"unreachable"}')

    def todoist(self, sub, query):
        if sub not in TODOIST_ALLOWED:
            return self.reply(403, "application/json", b'{"error":"not_allowed"}')
        token = secret("TODOIST_TOKEN")
        if not token:
            return self.reply(401, "application/json", b'{"error":"no_token"}')
        url = TODOIST_BASE + sub + ("?" + query if query else "")
        try:
            ctype, body = fetch_cached(url, {"Authorization": "Bearer " + token}, TODOIST_CACHE_SECONDS)
            self.reply(200, ctype, body)
        except urllib.error.HTTPError as e:      # e.g. 401 for a wrong token
            self.reply(e.code, "application/json", b'{"error":"todoist_http_%d"}' % e.code)
        except Exception:
            self.reply(502, "application/json", b'{"error":"unreachable"}')   # never echo the request

    def calendar(self):
        urls = [u for u in load_secrets().get("CALENDAR_URL", []) if u.startswith("https://")]
        if not urls:
            return self.reply(404, "text/plain", b"No CALENDAR_URL in secrets.txt")
        try:
            bodies = [fetch_cached(u)[1] for u in urls]
        except Exception:
            return self.reply(502, "text/plain", b"Could not fetch calendar")  # no URL in the message
        self.reply(200, "text/calendar; charset=utf-8", b"\n".join(bodies))

    def reply(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    os.chdir(BASE)  # serve this folder, wherever it is started from
    load_secrets()  # prints a note if the older secret files are still in use
    print(f"Mirror running at http://localhost:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

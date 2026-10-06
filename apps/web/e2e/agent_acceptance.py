"""Production-browser acceptance with disposable evidence and a local SMTP inbox.

No external messages, connected provider accounts, live quotes or payment calls.
Run: python apps/web/e2e/agent_acceptance.py [--no-build]
"""
import argparse
import base64
from email.parser import BytesParser
import json
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import socket
import socketserver
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--no-build", action="store_true")
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
OUT = ROOT / ".railor" / "agent-acceptance"
OUT.mkdir(parents=True, exist_ok=True)
inbox = queue.Queue()

class Mailbox(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b"220 localhost test inbox\r\n")
        while True:
            line = self.rfile.readline()
            if not line:
                break
            command = line.decode(errors="replace").strip().upper()
            if command.startswith(("EHLO", "HELO")):
                self.wfile.write(b"250 localhost\r\n")
            elif command == "DATA":
                self.wfile.write(b"354 Send message\r\n")
                data = []
                while True:
                    part = self.rfile.readline()
                    if not part or part == b".\r\n":
                        break
                    data.append(part[1:] if part.startswith(b"..") else part)
                inbox.put(b"".join(data))
                self.wfile.write(b"250 Saved locally\r\n")
            elif command == "QUIT":
                self.wfile.write(b"221 Bye\r\n")
                break
            else:
                self.wfile.write(b"250 OK\r\n")

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
backend_origin = f"http://127.0.0.1:{port}"

class TLSProxy(BaseHTTPRequestHandler):
    def proxy(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        headers = dict(self.headers)
        headers["X-Forwarded-Proto"] = "https"
        headers["X-Forwarded-Host"] = self.headers["Host"]
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
        connection.request(self.command, self.path, body or None, headers)
        response = connection.getresponse()
        payload = response.read()
        self.send_response(response.status)
        for key, value in response.getheaders():
            if key.lower() not in ["transfer-encoding", "connection", "content-length"]:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (ssl.SSLEOFError, BrokenPipeError, ConnectionResetError):
            pass  # Browser navigation can cancel a prefetched response.
        connection.close()
    do_GET = do_POST = do_HEAD = proxy
    def log_message(self, *_):
        pass

https = ThreadingHTTPServer(("127.0.0.1", 0), TLSProxy)
origin = f"https://127.0.0.1:{https.server_address[1]}"
smtp = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Mailbox)
threading.Thread(target=smtp.serve_forever, daemon=True).start()
report = {"checks": [], "errors": [], "screenshots": [], "overflow": []}
with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
    openssl = shutil.which("openssl") or "C:/Program Files/Git/usr/bin/openssl.exe"
    cert, key = str(Path(temp) / "cert.pem"), str(Path(temp) / "key.pem")
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], check=True, capture_output=True)
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    https.socket = tls.wrap_socket(https.socket, server_side=True)
    threading.Thread(target=https.serve_forever, daemon=True).start()
    env = {key: value for key, value in os.environ.items() if not key.endswith(("API_KEY", "CLIENT_SECRET"))}
    env.update(DATABASE_URL="", PGLITE_DATA_DIR=str(Path(temp) / "db"), APP_ORIGIN=origin, NEXT_PUBLIC_APP_URL=origin,
        RAILOR_NEXT_DIST_DIR=".next-polish", NEXT_TELEMETRY_DISABLED="1", RAILOR_ALLOW_EMBEDDED_DB="true",
        RAILOR_REMOTE_LOGOS="off", RAILOR_LIVE_PAYMENTS="false", RAILOR_READ_CACHE_MS="0", AUTH_EMAIL_TRANSPORT="smtp",
        SMTP_URL=f"smtp://127.0.0.1:{smtp.server_address[1]}", CREDENTIALS_ENCRYPTION_KEY=base64.b64encode(secrets.token_bytes(32)).decode())
    # Explicit empty values prevent repo dotenv from injecting real platform keys.
    for name in ["AIRWALLEX_PLATFORM_ENVIRONMENT", "AIRWALLEX_PLATFORM_CLIENT_ID", "AIRWALLEX_PLATFORM_API_KEY", "AIRWALLEX_SANDBOX_CLIENT_ID", "AIRWALLEX_SANDBOX_API_KEY", "airwallex_sandbox_client_id", "airwallex_sandbox_scoped_api"]:
        env[name] = ""
    env["RAILOR_SHOW_SANDBOX_QUOTES"] = "false"
    if not args.no_build:
        subprocess.run([PNPM, "--filter", "@railor/web", "build"], cwd=ROOT, env=env, check=True, timeout=900)
    subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/agent-seed.mts"], cwd=ROOT, env=env, check=True, timeout=240)
    log = (OUT / "server.log").open("w", encoding="utf-8")
    server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", str(port)], cwd=WEB, env=env,
        stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(backend_origin + "/api/health/live", timeout=2).close()
                break
            except Exception:
                if server.poll() is not None:
                    raise RuntimeError("Private acceptance server exited")
                time.sleep(1)
        else:
            raise RuntimeError("Private acceptance server not ready")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce", ignore_https_errors=True)
            context.route("**/api/prices?*", lambda route: route.fulfill(status=200, json={"quotes": []}))
            page = context.new_page()
            page.set_default_timeout(20000)
            page.on("pageerror", lambda error: report["errors"].append(str(error)))

            def capture(name):
                for width in [1440, 768, 390]:
                    page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
                    page.evaluate("window.scrollTo(0, 0)")
                    page.screenshot(path=str(OUT / f"{name}-{width}.png"), full_page=not page.get_by_role("dialog").count())
                    report["screenshots"].append(f"{name}-{width}.png")
                    if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                        report["overflow"].append(f"{name}-{width}")
                page.set_viewport_size({"width": 1440, "height": 1000})

            def ask(text):
                page.get_by_label("Ask Railor", exact=True).fill(text)
                page.get_by_role("button", name="Send request", exact=True).click()

            # A genuinely new account, including magic-link issuance and verification.
            page.goto(origin + "/login", wait_until="networkidle")
            page.get_by_label("Work email", exact=True).fill("founder@fresh-acceptance.test")
            page.get_by_role("button", name="Continue with email", exact=True).click()
            expect(page.get_by_text("Check your inbox", exact=True)).to_be_visible()
            message = BytesParser().parsebytes(inbox.get(timeout=10))
            body = " ".join(part.get_payload(decode=True).decode() for part in message.walk() if part.get_content_type() == "text/plain")
            link = re.search(re.escape(origin) + r"/auth/verify\?token=[\w-]+", body).group(0)
            page.goto(link, wait_until="networkidle")
            expect(page.get_by_role("heading", name="What are you building?", exact=True)).to_be_visible()
            page.get_by_role("radio", name=re.compile("Treasury")).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Where is your company based?", exact=True)).to_be_visible()
            page.get_by_role("combobox", name="Company country search", exact=True).fill("Singapore")
            page.get_by_role("option", name=re.compile("Singapore")).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Where does money need to go?", exact=True)).to_be_visible()
            page.get_by_role("combobox", name="Target markets search", exact=True).fill("Mexico")
            page.get_by_role("option", name=re.compile("Mexico")).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Which currencies do you use?", exact=True)).to_be_visible()
            page.get_by_role("combobox", name="Settlement currencies search", exact=True).fill("MXN")
            page.get_by_role("option", name=re.compile("MXN")).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="What would you like to explore?", exact=True)).to_be_visible()
            page.get_by_role("checkbox", name=re.compile("Bank payouts")).click()
            page.get_by_role("button", name="Open my workspace", exact=True).click()
            expect(page).to_have_url(origin + "/app")
            expect(page.get_by_role("heading", name=re.compile("Welcome back,"))).to_be_visible()
            report["checks"].append("New signup -> locally delivered magic link -> organization -> onboarding")

            page.goto(origin + "/app/search", wait_until="networkidle")
            expect(page.get_by_text("Your company policy comes first.", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Search infrastructure", exact=True)).to_be_disabled()
            capture("search-no-policy")
            page.get_by_role("link", name="Set up a policy", exact=False).click()
            page.get_by_label("Policy name", exact=True).fill("First production policy")
            page.get_by_role("button", name="Save draft", exact=True).click()
            expect(page).to_have_url(re.compile(r"/app/policies/[\w-]+$"))
            page.get_by_role("button", name="Activate this version", exact=True).click()
            expect(page.get_by_role("heading", name="Version 1 · active", exact=True)).to_be_visible()
            report["checks"].append("No-policy guidance -> review and activate company policy")

            page.goto(origin + "/app/agent", wait_until="networkidle")
            capture("agent-empty")
            ask("I need to send $100k USDC on Base from our Singapore company to a Mexican supplier receiving MXN through SPEI. Reliability matters more than price.")
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            expect(page.get_by_text("No supported winner for most reliable yet.", exact=True)).to_be_visible()
            expect(page.locator(".comparison-card")).to_have_count(2)
            expect(page.locator(".agent-request-summary")).to_contain_text("100,000 USDC")
            expect(page.locator(".agent-request-summary")).to_contain_text("SG → MX · SPEI")
            ask("Which is most reliable?")
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            ask("Why is there no recommendation?")
            expect(page.get_by_text("Reliability ranking needs observed provider health data. Strong route evidence alone is not proof of reliability.", exact=True)).to_be_visible()
            page.get_by_role("button", name="Why Atlas Test Rail?", exact=True).click()
            expect(page.get_by_role("heading", name="Atlas Test Rail: the evidence behind the result", exact=True)).to_be_visible()
            capture("agent-comparison")
            # Connection and execution requests store access interest only.
            connect = page.get_by_role("button", name="Connect Atlas Test Rail", exact=True)
            connect.click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_contain_text("connection is coming soon")
            for _ in range(5):
                page.keyboard.press("Tab")
                expect(dialog.locator(":focus")).to_have_count(1)
            page.keyboard.press("Shift+Tab")
            expect(dialog.locator(":focus")).to_have_count(1)
            page.keyboard.press("Escape")
            expect(dialog).not_to_be_visible()
            expect(connect).to_be_focused()
            connect.click()
            dialog.get_by_role("button", name="Request connection access", exact=True).click()
            expect(dialog.get_by_text("You’re on the list.", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            card = page.get_by_role("article", name="Atlas Test Rail comparison", exact=True)
            card.get_by_role("button", name="Execution beta", exact=True).click()
            expect(dialog).to_contain_text("Direct execution is in private beta")
            dialog.get_by_label("Work email", exact=True).fill("test@gmail.com")
            dialog.get_by_role("button", name="Request execution access", exact=True).click()
            expect(dialog.get_by_role("alert")).to_contain_text("Use your company email")
            dialog.get_by_label("Work email", exact=True).fill("founder@fresh-acceptance.test")
            capture("execution-access")
            dialog.get_by_role("button", name="Request execution access", exact=True).click()
            expect(dialog).to_contain_text("Access requested · no transfer initiated")
            page.keyboard.press("Escape")
            report["checks"].append("Connection/execution modal: Escape, focus restoration, work-email validation and honest success")
            card.get_by_role("button", name="Record decision", exact=True).click()
            expect(page).to_have_url(re.compile(r"/app/decisions/[\w-]+$"))
            expect(page.get_by_role("heading", name=re.compile("Execution: NOT INITIATED"))).to_be_visible()
            capture("recorded-decision")
            report["checks"].append("Explicit provider choice -> persisted decision; execution remains NOT INITIATED")

            # Existing owner policy blocks Harbor. No-policy/unknown states are real engine results.
            context.clear_cookies()
            context.add_cookies([{"name": "railor_session", "value": "agent-test-owner", "url": origin}])
            page.goto(origin + "/app/agent", wait_until="networkidle")
            ask("Send 1000 USDC on Base from Singapore to Mexico receiving MXN through SPEI. Best overall.")
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            page.get_by_role("button", name="Why Harbor Test Rail?", exact=True).click()
            expect(page.locator(".agent-reason-codes")).to_contain_text("provider_denied")
            expect(page.get_by_role("article", name="Harbor Test Rail comparison", exact=True).get_by_role("button", name="Record decision", exact=True)).to_have_count(0)
            capture("agent-policy-blocked")
            report["checks"].append("Why not provider -> deterministic denied reason; blocked provider cannot be selected")
            page.get_by_role("button", name="New conversation", exact=True).click()
            ask("Send USDC from Singapore to Mexico receiving MXN")
            expect(page.get_by_role("button", name="Confirm fields & search", exact=False)).to_be_disabled()
            expect(page.locator(".agent-request-fields")).to_contain_text("Still needed")
            ask("1000 on Base")
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            report["checks"].append("Incomplete intent asks for amount/network; conversational completion fills only stated fields")

            page.goto(origin + "/app/search", wait_until="networkidle")
            page.get_by_role("button", name="Search infrastructure", exact=True).click()
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            capture("search-comparison")
            page.get_by_role("combobox", name="Destination country search", exact=True).fill("Japan")
            page.get_by_role("option", name=re.compile("Japan")).click()
            page.get_by_role("combobox", name="Source currency search", exact=True).fill("JPY")
            page.get_by_role("option", name=re.compile("JPY")).click()
            page.get_by_role("button", name="Search infrastructure", exact=True).click()
            expect(page.get_by_role("heading", name="No verified end-to-end path yet.", exact=True)).to_be_visible()
            capture("search-unknown")
            page.emulate_media(reduced_motion="no-preference")
            assert page.locator(".infrastructure-results").evaluate("node => getComputedStyle(node).animationIterationCount") == "1"
            page.emulate_media(reduced_motion="reduce")
            assert float(page.locator(".infrastructure-results").evaluate("node => parseFloat(getComputedStyle(node).animationDuration)")) < .01
            report["checks"].append("Search comparison and unknown states; one-shot motion respects reduced-motion")

            context.clear_cookies()
            context.add_cookies([{"name": "railor_session", "value": "agent-test-viewer", "url": origin}])
            page.goto(origin + "/app/agent", wait_until="networkidle")
            ask("Send 1000 USDC on Base from Singapore to Mexico receiving MXN through SPEI")
            expect(page.get_by_role("heading", name="Your available paths.", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Record decision", exact=True)).to_have_count(0)
            report["checks"].append("Viewer can search and explain but cannot record decisions")
            browser.close()
        assert not report["errors"], report["errors"]
        assert not report["overflow"], report["overflow"]
    finally:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(server.pid), "/T", "/F"], capture_output=True)
        else:
            server.terminate()
        server.wait(timeout=15)
        log.close()
        (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        smtp.shutdown()
        smtp.server_close()
        https.shutdown()
        https.server_close()
    subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/agent-assert.mts"], cwd=ROOT, env=env, check=True, timeout=120)
    print(json.dumps({"checks": len(report["checks"]), "browserErrors": len(report["errors"]), "overflow": report["overflow"], "output": str(OUT)}))

"""Production-build acceptance for routing, access restrictions and mobile layout.

Uses only a disposable database and seeded local sessions. Never submits a
payment or connects a provider account. Run after a build with --no-build and
RAILOR_E2E_DIST_DIR, or omit --no-build to create an isolated production build.
"""
import base64
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web"
OUT = ROOT / ".railor/production-release"
OUT.mkdir(parents=True, exist_ok=True)
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
expect.set_options(timeout=20000)
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
origin = f"http://127.0.0.1:{port}"
report = {"checks": [], "errors": [], "overflow": []}
with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
    # Empty every repository env key first, so dotenv cannot inject real secrets.
    keys = re.findall(r"^([A-Za-z_][A-Za-z0-9_]*)=", (ROOT / ".env.example").read_text(), re.M)
    if (ROOT / ".env").exists():
        keys += re.findall(r"^([A-Za-z_][A-Za-z0-9_]*)=", (ROOT / ".env").read_text(), re.M)
    env = {**os.environ, **{key: "" for key in keys}}
    env.update(DATABASE_URL="", PGLITE_DATA_DIR=str(Path(temp) / "db"), APP_ORIGIN=f"https://127.0.0.1:{port}",
               NEXT_PUBLIC_APP_URL=origin, RAILOR_ALLOW_EMBEDDED_DB="true", RAILOR_READ_CACHE_MS="0",
               RAILOR_NEXT_DIST_DIR=os.getenv("RAILOR_E2E_DIST_DIR", ".next-product-workflows"),
               NEXT_TELEMETRY_DISABLED="1", RAILOR_REMOTE_LOGOS="off", AUTH_EMAIL_TRANSPORT="console",
               CREDENTIALS_ENCRYPTION_KEY=base64.b64encode(secrets.token_bytes(32)).decode())
    if "--no-build" not in sys.argv:
        subprocess.run([PNPM, "build"], cwd=ROOT, env=env, check=True, timeout=900)
    subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/seed.mts"], cwd=ROOT, env=env, check=True, timeout=180)
    log = (OUT / "server.log").open("w", encoding="utf-8")
    server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", str(port)],
                              cwd=WEB, env=env, stdout=log, stderr=subprocess.STDOUT,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(origin + "/api/health/live", timeout=2).close()
                break
            except Exception:
                if server.poll() is not None:
                    raise RuntimeError("Private production server stopped")
                time.sleep(1)
        else:
            raise RuntimeError("Private production server did not become ready")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1360, "height": 900}, reduced_motion="reduce")
            context.add_cookies([{"name": "railor_session", "value": "browser-test-owner", "url": origin}])
            page = context.new_page()
            page.set_default_navigation_timeout(90000)
            page.on("pageerror", lambda error: report["errors"].append(str(error)))
            page.goto(origin + "/app/routing", wait_until="networkidle")
            expect(page.get_by_role("heading", name="What matters most?", exact=True)).to_be_visible()
            page.get_by_role("radio", name=re.compile("^Cheapest")).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Which providers can take part?", exact=True)).to_be_visible()
            blocked = page.get_by_text("Never route through", exact=True).locator("..")
            blocked.get_by_role("button", name="Circle", exact=True).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            fallback = page.get_by_label("Fall back to the next provider", exact=True)
            fallback.uncheck()
            page.get_by_label("Maximum providers to try", exact=True).fill("3")
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Review your routing profile", exact=True)).to_be_visible()
            expect(page.get_by_text("Disabled — first provider only", exact=True)).to_be_visible()
            page.get_by_role("button", name="Save routing", exact=True).click()
            expect(page.get_by_text("Routing profile saved.", exact=True)).to_be_visible()
            page.reload(wait_until="networkidle")
            expect(page.get_by_role("radio", name=re.compile("^Cheapest"))).to_have_attribute("aria-checked", "true")
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_text("Never route through", exact=True).locator("..")).to_contain_text("Circle")
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_label("Fall back to the next provider", exact=True)).not_to_be_checked()
            expect(page.get_by_label("Maximum providers to try", exact=True)).to_have_value("3")
            report["checks"].append("Routing: guided steps, provider exclusion, priority and fallback persist after reload")
            for path in ["/app/beneficiaries", "/app/payments/new"]:
                page.goto(origin + path, wait_until="networkidle")
                expect(page.get_by_role("heading", name="Recipient accounts are paused.", exact=True)).to_be_visible()
                expect(page.get_by_role("button", name="Save beneficiary", exact=True)).to_have_count(0)
                expect(page.locator('nav a[href="/app/beneficiaries"]')).to_have_count(0)
            report["checks"].append("Beneficiaries and new payments remain unavailable, including direct URLs")
            page.goto(origin + "/app/agent", wait_until="networkidle")
            expect(page.get_by_role("heading", name="Ask anything.", exact=True)).to_be_visible()
            expect(page.get_by_label("Ask Railor", exact=True)).to_be_visible()
            expect(page.get_by_text("We keep only your last 7 chats.", exact=True)).to_be_visible()
            page.screenshot(path=str(OUT / "agent-desktop.png"), full_page=True)
            report["checks"].append("Agent: welcome, composer and seven-chat retention notice")
            page.set_viewport_size({"width": 390, "height": 844})
            for path in ["/app/agent", "/app/routing", "/app/beneficiaries", "/app/payments/new", "/app/policies", "/app/settings/connections"]:
                page.goto(origin + path, wait_until="networkidle")
                if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
                    report["overflow"].append(path)
                if path == "/app/agent":
                    page.get_by_role("button", name="Open chat history", exact=True).click()
                    expect(page.get_by_role("dialog", name="Chat history")).to_be_visible()
                    page.keyboard.press("Escape")
                    expect(page.get_by_role("dialog", name="Chat history")).to_have_count(0)
                page.screenshot(path=str(OUT / (path.strip("/").replace("/", "-") + "-mobile.png")), full_page=True)
            report["checks"].append("Mobile: six key surfaces fit the viewport and chat history opens/closes")
            context.clear_cookies()
            context.add_cookies([{"name": "railor_session", "value": "browser-test-viewer", "url": origin}])
            page.set_viewport_size({"width": 1360, "height": 900})
            page.goto(origin + "/app/routing", wait_until="networkidle")
            expect(page.get_by_role("radio", name=re.compile("^Cheapest"))).to_be_disabled()
            for _ in range(3):
                page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("button", name="Save routing", exact=True)).to_be_disabled()
            report["checks"].append("Viewer can inspect routing but cannot edit or save settings")
            browser.close()
        assert not report["errors"], report["errors"]
        assert not report["overflow"], report["overflow"]
        print(json.dumps(report))
    finally:
        (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(server.pid), "/T", "/F"], capture_output=True)
        else:
            server.terminate()
        server.wait(timeout=15)
        log.close()

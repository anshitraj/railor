"""Verify progressive workspace setup with a disposable DB and private server.

Run with py apps/web/e2e/workspace_onboarding.py. Screenshots and the report
are saved under .railor/workspace-onboarding. No shared demo is modified.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=30000)

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
OUT = ROOT / ".railor" / "workspace-onboarding"
OUT.mkdir(parents=True, exist_ok=True)
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
origin = f"http://127.0.0.1:{port}"
checks, errors, console_errors = [], [], []

with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
    env = {key: value for key, value in os.environ.items() if not key.endswith(("API_KEY", "CLIENT_SECRET"))}
    env.update(DATABASE_URL="", PGLITE_DATA_DIR=str(Path(temp) / "db"), APP_ORIGIN=origin,
               NEXT_PUBLIC_APP_URL=origin, RAILOR_NEXT_DIST_DIR=".next-workspace-test",
               NEXT_TELEMETRY_DISABLED="1", RAILOR_ALLOW_EMBEDDED_DB="true",
               RAILOR_REMOTE_LOGOS="off", RAILOR_LIVE_PAYMENTS="false", RAILOR_READ_CACHE_MS="0",
               AUTH_EMAIL_TRANSPORT="console")
    subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/workspace-seed.mts"],
                   cwd=ROOT, env=env, check=True, timeout=240)
    log = (OUT / "server.log").open("w", encoding="utf-8")
    server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "dev",
                               "--hostname", "127.0.0.1", "--port", str(port)], cwd=WEB, env=env,
                              stdout=log, stderr=subprocess.STDOUT,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(origin + "/api/health/live", timeout=2).close()
                break
            except Exception:
                if server.poll() is not None:
                    raise RuntimeError("Private test server exited")
                time.sleep(1)
        else:
            raise RuntimeError("Private test server did not start")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
            context.set_default_navigation_timeout(90000)
            context.set_default_timeout(20000)
            context.add_cookies([{"name": "railor_session", "value": "fresh-owner", "url": origin}])
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            response = page.goto(origin + "/app", wait_until="networkidle")
            assert response.status == 200
            expect(page.get_by_role("heading", name="Make Railor yours")).to_be_visible()
            nav = page.get_by_role("navigation", name="Workspace", exact=True)
            assert nav.locator("a:visible").count() == 6
            expect(nav.get_by_role("link", name="Price check", exact=True)).to_be_visible()
            expect(nav.get_by_role("link", name="Policies", exact=True)).not_to_be_visible()
            nav.get_by_role("button", name="Controls", exact=True).click()
            expect(nav.get_by_role("link", name="Policies", exact=True)).to_be_visible()
            nav.get_by_role("button", name="Controls", exact=True).click()
            page.get_by_role("button", name="Do this later", exact=True).click()
            page.reload(wait_until="networkidle")
            expect(page.get_by_role("button", name="Resume setup")).to_be_visible()
            page.get_by_role("button", name="Resume setup").click()
            expect(page.get_by_role("link", name="Set up workspace", exact=True)).to_be_visible()
            checks.append("Six primary links; expandable controls; setup dismissal survives reload")
            for width in [1440, 768, 390]:
                page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                page.screenshot(path=str(OUT / f"overview-{width}.png"), full_page=True)
            page.get_by_role("button", name="Open menu", exact=True).click()
            expect(nav).to_be_visible()
            expect(nav.get_by_role("link", name="Price check", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("button", name="Open menu", exact=True)).to_be_focused()
            checks.append("Overview fits desktop, tablet and mobile; mobile drawer closes with Escape")
            page.set_viewport_size({"width": 1440, "height": 1000})
            page.get_by_role("link", name="Set up workspace", exact=True).click()
            expect(page.get_by_role("heading", name="What are you building?")).to_be_visible()
            page.get_by_role("radio", name="Payments Move money for customers", exact=True).click()
            page.route("**/welcome", lambda route: route.abort() if route.request.method == "POST" else route.continue_())
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.locator('p[role="alert"]')).to_contain_text("couldn’t save your answers")
            expect(page.get_by_role("radio", name="Payments Move money for customers", exact=True)).to_have_attribute("aria-checked", "true")
            page.unroute("**/welcome")
            checks.append("Failed saves keep the answer and show a retry message")
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Where is your company based?")).to_be_visible()
            page.reload(wait_until="networkidle")
            expect(page.get_by_role("heading", name="Where is your company based?")).to_be_visible()
            page.get_by_role("combobox", name="Company country search").fill("India")
            page.get_by_role("listbox").get_by_role("button", name="India IN", exact=True).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Where does money need to go?")).to_be_visible()
            page.get_by_role("combobox", name="Target markets search").fill("United Arab Emirates")
            page.get_by_role("listbox").get_by_role("button", name="United Arab Emirates AE", exact=True).click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="Which currencies do you use?")).to_be_visible()
            page.get_by_role("combobox", name="Settlement currencies search").fill("AED")
            page.get_by_role("listbox").get_by_role("button").first.click()
            page.get_by_role("button", name="Continue", exact=True).click()
            expect(page.get_by_role("heading", name="What would you like to explore?")).to_be_visible()
            page.get_by_role("checkbox", name="Bank payouts", exact=True).click()
            page.screenshot(path=str(OUT / "onboarding-final.png"), full_page=True)
            page.get_by_role("button", name="Open my workspace", exact=True).click()
            page.wait_for_url(origin + "/app")
            expect(page.get_by_role("heading", name="Set your company policy", exact=True)).to_be_visible()
            expect(page.locator(".overview-route")).to_have_count(1)
            page.screenshot(path=str(OUT / "overview-configured.png"), full_page=True)
            checks.append("Five onboarding questions save and resume; finish creates a route and advances setup")
            page.get_by_role("link", name="Create a policy", exact=True).click()
            page.wait_for_url(origin + "/app/policies#create-policy")
            expect(page.locator("#create-policy")).to_be_visible()
            expect(page.get_by_role("heading", name="Create policy", exact=True)).to_be_visible()
            checks.append("Create policy action opens the actual policy editor")
            page.goto(origin + "/app/approvals", wait_until="networkidle")
            expect(nav.get_by_role("button", name="Controls", exact=True)).to_have_attribute("aria-expanded", "true")
            expect(nav.get_by_role("link", name="Approvals", exact=True)).to_have_attribute("aria-current", "page")
            page.goto(origin + "/app", wait_until="networkidle")
            page.get_by_text("View setup steps", exact=True).click()
            page.get_by_role("link", name="Describe your money movement").click()
            page.wait_for_url(origin + "/app/agent")
            checks.append("Deep routes open their nav group; describe movement opens the Agent")
            context.close()
            viewer = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
            viewer.set_default_navigation_timeout(90000)
            viewer.add_cookies([{"name": "railor_session", "value": "fresh-viewer", "url": origin}])
            vp = viewer.new_page()
            vp.goto(origin + "/app", wait_until="networkidle")
            vp.get_by_text("View setup steps", exact=True).click()
            expect(vp.get_by_role("link", name="Set your company policy")).to_have_attribute("href", "/app/policies")
            expect(vp.get_by_role("link", name="Describe your money movement")).to_have_attribute("href", "/app/search")
            checks.append("Viewer setup links respect role permissions")
            vp.goto(origin + "/welcome", wait_until="networkidle")
            for question in ["What are you building?", "Where is your company based?", "Where does money need to go?", "Which currencies do you use?", "What would you like to explore?"]:
                expect(vp.get_by_role("heading", name=question, exact=True)).to_be_visible()
                assert not vp.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
                if question == "What would you like to explore?":
                    vp.get_by_text("Review skipped answers (4)", exact=True).click()
                    expect(vp.get_by_text("Company country not specified", exact=False)).to_be_visible()
                vp.get_by_role("button", name="Decide later", exact=True).click()
            vp.wait_for_url(origin + "/app")
            expect(vp.get_by_role("link", name="View policies", exact=True)).to_be_visible()
            checks.append("Mobile onboarding can skip each question, records assumptions and finishes")
            viewer.close()
            browser.close()
        assert not errors, errors
        assert not [message for message in console_errors if "net::ERR_FAILED" not in message], console_errors
        print(json.dumps({"checks": checks, "browserErrors": errors, "consoleErrors": console_errors, "screenshots": str(OUT)}))
    finally:
        (OUT / "report.json").write_text(json.dumps({"checks": checks, "errors": errors, "consoleErrors": console_errors}, indent=2), encoding="utf-8")
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(server.pid), "/T", "/F"], capture_output=True)
        else:
            server.terminate()
        server.wait(timeout=15)
        log.close()

"""Run with Python + Playwright installed. Owns only its temporary DB and server.
No demo reset, real provider request, real credentials or network database.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import sys
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[3]
sys.stdout.reconfigure(encoding="utf-8")
WEB = ROOT / "apps" / "web"
pnpm = "pnpm.cmd" if os.name == "nt" else "pnpm"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
origin = f"http://127.0.0.1:{port}"
with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
    env = {**os.environ, "DATABASE_URL": "", "PGLITE_DATA_DIR": str(Path(temp) / "db"), "APP_ORIGIN": origin,
           "NEXT_PUBLIC_APP_URL": origin, "RAILOR_NEXT_DIST_DIR": ".next-e2e", "NEXT_TELEMETRY_DISABLED": "1",
           "GEMINI_API_KEY": "", "TAVILY_API_KEY": "", "PARALLEL_API_KEY": "", "RAILOR_REMOTE_LOGOS": "off"}
    subprocess.run([pnpm, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/seed.mts"], cwd=ROOT, env=env, check=True, timeout=60)
    log_path = Path(temp) / "server.log"
    log = log_path.open("w", encoding="utf-8")
    server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", str(port)], cwd=WEB, env=env, stdout=log, stderr=subprocess.STDOUT,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        for _ in range(90):
            if server.poll() is not None:
                raise RuntimeError(log_path.read_text(encoding="utf-8"))
            try:
                with urllib.request.urlopen(origin + "/api/health/live", timeout=2) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError("Isolated server readiness timed out")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1360, "height": 900})
            context.add_cookies([{"name": "railor_session", "value": "browser-test-owner", "url": origin}])
            page = context.new_page()
            page.set_default_timeout(30000)
            errors = []
            page.on("pageerror", lambda error: errors.append({"kind": "pageerror", "message": str(error), "stack": error.stack}))
            page.on("console", lambda message: errors.append({"kind": "console", "message": message.text, "location": message.location}) if message.type == "error" else None)
            page.on("requestfailed", lambda request: errors.append({"kind": "requestfailed", "url": request.url, "error": request.failure}))
            page.goto(origin + "/app/policies", wait_until="networkidle", timeout=90000)
            expect(page.get_by_role("heading", name="Policies", exact=True)).to_be_visible()
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(ROOT / ".railor" / "ui-policies.png"), full_page=True, caret="initial")
            page.get_by_label("Policy name", exact=True).fill("Browser approval policy")
            page.get_by_label("Require confirmed entity eligibility", exact=True).uncheck()
            page.get_by_label("Approval above amount (intent currency)", exact=True).fill("500")
            page.get_by_role("button", name="Save draft", exact=True).click()
            page.wait_for_url("**/app/policies/*")
            page.get_by_role("button", name="Activate this version", exact=True).click()
            expect(page.get_by_role("heading", name="Version 1 · active", exact=True)).to_be_visible()
            page.goto(origin + "/app/decisions", wait_until="networkidle")
            page.screenshot(path=str(ROOT / ".railor" / "ui-after.png"), full_page=True, caret="initial")
            page.get_by_role("radio", name="Stablecoin", exact=True).click()
            page.get_by_role("button", name="Evaluate payment", exact=True).click()
            page.wait_for_url("**/app/decisions/*")
            decision_url = page.url
            expect(page.get_by_role("heading", name="APPROVAL REQUIRED", exact=True)).to_be_visible()
            page.get_by_label("Review comment", exact=True).fill("Attempt by original requester")
            page.get_by_role("button", name="approve", exact=True).click()
            expect(page.get_by_text("self approval forbidden", exact=True)).to_be_visible()
            context.add_cookies([{"name": "railor_session", "value": "browser-test-reviewer", "url": origin}])
            page.goto(decision_url, wait_until="networkidle")
            page.get_by_label("Review comment", exact=True).fill("Independent browser review")
            page.get_by_role("button", name="approve", exact=True).click()
            expect(page.get_by_role("heading", name="Approval · approved", exact=True)).to_be_visible()
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(ROOT / ".railor" / "ui-decision.png"), full_page=True, caret="initial")
            page.goto(origin + "/app/agent", wait_until="networkidle")
            page.get_by_label("Your instructions", exact=True).fill("INR to AED")
            page.get_by_role("button", name="Generate reviewable output").click()
            expect(page.get_by_role("heading", name="Review and edit draft", exact=True)).to_be_visible()
            expect(page.get_by_text("MISSING INFORMATION", exact=True)).to_be_visible()
            expect(page.get_by_text("amount", exact=True)).to_be_visible()
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(ROOT / ".railor" / "ui-agent.png"), full_page=True, caret="initial")
            # Law 2: an empty workspace gets a suggested corridor it can keep in one click.
            page.goto(origin + "/app", wait_until="networkidle")
            expect(page.get_by_text("Suggested — edit this").first).to_be_visible()
            page.get_by_role("button", name="Save & monitor").click()
            # Saved corridors lose the "Suggested" badge; the monitor must exist too (this once deadlocked PGlite).
            expect(page.get_by_text("Suggested — edit this")).to_have_count(0, timeout=45000)
            page.goto(origin + "/app/monitoring", wait_until="networkidle")
            expect(page.locator("main").get_by_text("USDC", exact=False).first).to_be_visible(timeout=45000)
            expect(page.get_by_text("You're not monitoring anything yet")).to_have_count(0)
            # Team invites: owner invites by email, the link is shown when mail isn't configured.
            page.goto(origin + "/app/settings", wait_until="networkidle")
            page.get_by_placeholder("name@company.com").fill("invitee@browser.test")
            page.get_by_role("button", name="Send invite").click()
            expect(page.get_by_text("Invite created for invitee@browser.test", exact=False)).to_be_visible(timeout=45000)
            expect(page.get_by_text("PENDING INVITATIONS", exact=False).or_(page.get_by_text("Pending invitations"))).to_be_visible()
            # Coming-soon surfaces carry a real notify-me action.
            page.goto(origin + "/company/roadmap", wait_until="networkidle")
            page.get_by_role("button", name="Notify me").first.click()
            expect(page.get_by_text("We'll email you when it ships").first).to_be_visible(timeout=45000)
            # Public status, legal pages and a branded 404.
            page.goto(origin + "/status", wait_until="networkidle")
            expect(page.get_by_role("heading", name="All systems operational")).to_be_visible(timeout=45000)
            for legal in ["/legal/terms", "/legal/privacy"]:
                page.goto(origin + legal, wait_until="networkidle")
                expect(page.locator("h1")).to_be_visible()
            missing = page.goto(origin + "/definitely-not-a-page", wait_until="networkidle")
            assert missing is not None and missing.status == 404
            expect(page.get_by_text("This rail doesn't go anywhere.")).to_be_visible()
            for path, heading in [("discovery", "Discovery review"), ("connectors", "Railor Connector"), ("monitoring", "Monitoring"), ("approvals", "Approvals")]:
                page.goto(origin + "/app/" + path, wait_until="networkidle")
                expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
            # Money movement (test mode, Railor's simulator): the 1,000 USDC payment trips the policy's
            # 500 approval threshold, an independent reviewer approves it, the owner sends it, and the
            # page's own poller carries it to completed. No provider API is called.
            context.add_cookies([{"name": "railor_session", "value": "browser-test-owner", "url": origin}])
            page.goto(origin + "/app/payments/new", wait_until="networkidle")
            page.get_by_role("button", name="Continue").click()
            page.get_by_label("Registered business name").fill("Dubai Supplier LLC")
            page.get_by_label("IBAN", exact=True).fill("AE07 0331 2345 6789 0123 456")
            page.get_by_role("button", name="Save beneficiary").click()
            expect(page.get_by_role("radio", name="Dubai Supplier LLC")).to_be_visible(timeout=45000)
            page.get_by_role("button", name="Review route").click()
            expect(page.get_by_text("Policy requires an independent approval before sending.")).to_be_visible(timeout=45000)
            page.get_by_role("button", name="Create payment").click()
            page.wait_for_url("**/app/payments/*-*-*", timeout=45000)
            payment_url = page.url
            approval_href = page.get_by_role("link", name="Open the approval →").get_attribute("href")
            context.add_cookies([{"name": "railor_session", "value": "browser-test-reviewer", "url": origin}])
            page.goto(origin + approval_href, wait_until="networkidle")
            page.get_by_label("Review comment", exact=True).fill("Supplier invoice checked")
            page.get_by_role("button", name="approve", exact=True).click()
            expect(page.get_by_role("heading", name="Approval · approved", exact=True)).to_be_visible()
            context.add_cookies([{"name": "railor_session", "value": "browser-test-owner", "url": origin}])
            page.goto(payment_url, wait_until="networkidle")
            page.get_by_role("button", name="Send 1,000 USDC").click()
            page.get_by_role("button", name="Confirm and send").click()
            expect(page.get_by_text("attempt.accepted")).to_be_visible(timeout=45000)
            expect(page.get_by_text("status.completed")).to_be_visible(timeout=90000)
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(ROOT / ".railor" / "ui-payment.png"), full_page=True, caret="initial")
            page.goto(origin + "/app/settings/connections", wait_until="networkidle")
            expect(page.get_by_text("Bridge", exact=True).first).to_be_visible()
            expect(page.get_by_text("Wise", exact=True).first).to_be_visible()
            expect(page.get_by_text("Airwallex", exact=True).first).to_be_visible()
            # Without a logo the tile falls back to a monogram, never a broken image.
            assert page.evaluate("[...document.images].every(i => !i.complete || i.naturalWidth > 0)"), "broken image on connections"
            for path, heading in [("payments", "Payments"), ("beneficiaries", "Beneficiaries"), ("routing", "Routing")]:
                page.goto(origin + "/app/" + path, wait_until="networkidle")
                expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
            # Operations: only a Railor operator reaches /admin, and sees the payment and the gates.
            context.add_cookies([{"name": "railor_session", "value": "browser-test-operator", "url": origin}])
            for path, heading in [("", "Overview"), ("/payments", "Payments ops"), ("/organizations", "Organizations"), ("/providers", "Providers"), ("/audit", "Audit log")]:
                page.goto(origin + "/admin" + path, wait_until="networkidle")
                expect(page.get_by_role("heading", name=heading, exact=True)).to_be_visible()
            page.goto(origin + "/admin/payments", wait_until="networkidle")
            expect(page.get_by_text("Browser Test Workspace").first).to_be_visible()
            page.goto(origin + "/admin/providers", wait_until="networkidle")
            expect(page.get_by_role("heading", name="Bridge", exact=True)).to_be_visible()
            context.add_cookies([{"name": "railor_session", "value": "browser-test-owner", "url": origin}])
            page.set_viewport_size({"width": 390, "height": 844})
            for path in ["", "decisions", "policies", "approvals", "agent", "connectors", "discovery", "settings", "developers", "payments", "payments/new", "beneficiaries", "routing", "settings/connections"]:
                page.goto(origin + "/app/" + path, wait_until="networkidle")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Mobile horizontal overflow: {path}"
            # Navigation can cancel an in-flight RSC prefetch; that is not a page failure.
            # The deliberate 404 check above logs a resource error for that document only.
            unexpected = [error for error in errors if not (error["kind"] == "requestfailed" and error["error"] == "net::ERR_ABORTED")
                          and not (error["kind"] == "console" and "status of 404" in error["message"])]
            assert not unexpected, unexpected
            browser.close()
            print(json.dumps({"passed": True, "checks": ["policy draft/activation", "stablecoin enforce decision", "self-approval blocked", "independent approval", "Agent draft", "suggested corridor saved and monitored", "team invite", "notify me", "status/legal/404", "workflow pages", "test payment: approval, send, settle", "provider connections", "operator dashboard", "mobile layout", "no browser runtime errors"]}))
    except Exception:
        log.flush()
        print(log_path.read_text(encoding="utf-8")[-12000:])
        raise
    finally:
        # Only terminate the process tree created by this harness.
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(server.pid), "/T", "/F"], capture_output=True)
        else:
            server.terminate()
        server.wait(timeout=15)
        log.close()

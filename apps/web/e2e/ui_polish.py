"""Capture Railor's page families in an isolated seeded workspace.

Uses a disposable database and a private production server. Does not submit
payments, reset the shared demo, or call live quote APIs. --baseline captures
the main page families; the default covers public, workspace and ops routes.
"""
import json
import os
import re
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
BASELINE = "--baseline" in sys.argv
FOCUS = next((arg.split("=", 1)[1].split(",") for arg in sys.argv if arg.startswith("--paths=")), None)
DIAGNOSTIC = "--dev" in sys.argv
REPEAT = next((int(arg.split("=", 1)[1]) for arg in sys.argv if arg.startswith("--repeat=")), 6 if DIAGNOSTIC else 1)
sys.stdout.reconfigure(encoding="utf-8")

PUBLIC = ["/", "/providers", "/providers/atlas-pay", "/coverage", "/changes", "/prices", "/docs", "/docs/api", "/docs/payments", "/docs/mcp", "/docs/sdks", "/docs/cli", "/docs/guides", "/docs/changelog", "/company", "/company/trust", "/company/roadmap", "/status", "/legal/terms", "/legal/privacy", "/login"]
WORKSPACE = ["/app", "/app/corridors", "/app/map", "/app/providers", "/app/compare", "/app/prices", "/app/payments", "/app/payments/new", "/app/beneficiaries", "/app/routing", "/app/decisions", "/app/approvals", "/app/policies", "/app/agent", "/app/monitoring", "/app/changes", "/app/evidence", "/app/discovery", "/app/readiness", "/app/connectors", "/app/developers", "/app/settings", "/app/settings/connections", "/app/upgrade", "/welcome"]
OPERATIONS = ["/admin", "/admin/payments", "/admin/providers", "/admin/organizations", "/admin/review", "/admin/discovery", "/admin/research", "/admin/usage", "/admin/audit", "/admin/access"]
PUBLIC.append("/providers/browser-fixture")
WORKSPACE.append("/app/providers/browser-fixture")

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
origin = f"http://127.0.0.1:{port}"
out = ROOT / ".railor" / ("polish-diagnostic" if DIAGNOSTIC else "polish-before" if BASELINE else "polish-interactions" if FOCUS == ["__interactions__"] else "polish-final" if FOCUS else "polish-after")
out.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
    env = {key: value for key, value in os.environ.items() if not key.endswith(("API_KEY", "CLIENT_SECRET"))}
    env.update(DATABASE_URL="", PGLITE_DATA_DIR=str(Path(temp) / "db"), APP_ORIGIN=origin, NEXT_PUBLIC_APP_URL=origin,
               RAILOR_NEXT_DIST_DIR=".next-polish-dev" if DIAGNOSTIC else ".next-polish", NEXT_TELEMETRY_DISABLED="1", RAILOR_ALLOW_EMBEDDED_DB="true",
               RAILOR_REMOTE_LOGOS="off", RAILOR_LIVE_PAYMENTS="false", RAILOR_READ_CACHE_MS="0", AUTH_EMAIL_TRANSPORT="console")
    import base64
    env["CREDENTIALS_ENCRYPTION_KEY"] = base64.b64encode(secrets.token_bytes(32)).decode()
    if "--no-build" not in sys.argv and not DIAGNOSTIC:
        subprocess.run([PNPM, "--filter", "@railor/web", "build"], cwd=ROOT, env=env, check=True, timeout=900)
    subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/audit-seed.mts"], cwd=ROOT, env=env, check=True, timeout=240)
    log = (out / "server.log").open("w", encoding="utf-8")
    server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "dev" if DIAGNOSTIC else "start", "--hostname", "127.0.0.1", "--port", str(port)], cwd=WEB, env=env, stdout=log, stderr=subprocess.STDOUT,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    report = {"pages": [], "errors": [], "checks": [], "console": []}
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(origin + "/api/health/live", timeout=2).close()
                break
            except Exception:
                if server.poll() is not None:
                    raise RuntimeError("Private visual server exited")
                time.sleep(1)
        else:
            raise RuntimeError("Private visual server did not become ready")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            for role, token, paths in [("visitor", None, PUBLIC), ("owner", "browser-test-owner", WORKSPACE), ("operator", "browser-test-operator", OPERATIONS)]:
                if BASELINE:
                    paths = [path for path in paths if path in ["/", "/providers", "/docs", "/login", "/app", "/app/corridors", "/app/payments", "/app/settings", "/admin"]]
                elif FOCUS:
                    paths = [path for path in paths if path in FOCUS]
                if REPEAT > 1:
                    paths = paths * REPEAT
                context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
                if token:
                    context.add_cookies([{"name": "railor_session", "value": token, "url": origin}])
                # Public pricing is tested with an empty fixture response, never a provider request.
                context.route("**/api/prices?*", lambda route: route.fulfill(status=200, json={"error": "No price source configured in the visual test"}))
                context.route("**/api/fx*", lambda route: route.fulfill(status=200, json={"rates": []}))
                page = context.new_page()
                phase = "capture"
                page.on("pageerror", lambda error: report["errors"].append({"path": page.url.replace(origin, ""), "phase": phase, "message": str(error)}))
                page.on("console", lambda message: report["console"].append({"path": page.url.replace(origin, ""), "message": message.text}) if message.type == "error" else None)
                for path in paths:
                    response = page.goto(origin + path, wait_until="networkidle", timeout=60000)
                    if response and response.status == 404 and "/providers/" in path:
                        continue  # fixture catalog slugs can differ
                    expect(page.locator("main")).to_be_visible()
                    marks = page.locator('img[src^="/brand/technology/"]')
                    if marks.count():
                        broken = marks.evaluate_all("images => images.filter(img => !img.complete || img.naturalWidth < 2).map(img => img.getAttribute('src'))")
                        assert not broken, f"Technology logos did not load on {path}: {broken}"
                        report["checks"].append(f"Local technology logos loaded on {path}")
                    route_marks = page.locator('img[src^="/brand/networks/"], img[src^="/brand/currencies/"]')
                    if route_marks.count():
                        broken = route_marks.evaluate_all("images => images.filter(img => !img.complete || img.naturalWidth < 2).map(img => img.getAttribute('src'))")
                        assert not broken, f"Route logos did not load on {path}: {broken}"
                        report["checks"].append(f"Base and currency artwork loaded on {path}")
                    if not DIAGNOSTIC and path in ["/docs/sdks", "/app/developers"]:
                        python_tab = page.get_by_role("button", name="Python", exact=True).first
                        python_tab.click()
                        expect(python_tab).to_have_attribute("aria-pressed", "true")
                        expect(page.locator("pre").first).to_contain_text("pip install" if path == "/docs/sdks" else "import httpx")
                        report["checks"].append(f"Python logo tab switches example on {path}")
                        page.get_by_role("button", name="TypeScript", exact=True).first.click()
                    page.evaluate("window.scrollTo(0, 0)")
                    name = role + "-" + (path.strip("/").replace("/", "-") or "home")
                    if not DIAGNOSTIC:
                        page.screenshot(path=str(out / (name + ".png")), full_page=True, caret="initial")
                    for width in [1440, 768, 390]:
                        page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
                        overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
                        report["pages"].append({"role": role, "path": path, "width": width, "status": response.status if response else None, "overflow": overflow})
                        if width == 390 and not DIAGNOSTIC:
                            page.screenshot(path=str(out / (name + "-mobile.png")), full_page=True, caret="initial")
                        if path == "/" and not DIAGNOSTIC:
                            dossier = page.locator(".corridor-dossier")
                            dossier.screenshot(path=str(out / f"corridor-dossier-{width}.png"), caret="initial")
                            fit = dossier.evaluate("figure => { const box = figure.getBoundingClientRect(); return [...figure.querySelectorAll('.corridor-node')].every(node => { const rect = node.getBoundingClientRect(); return rect.left >= box.left && rect.right <= box.right; }); }")
                            assert fit, f"Route nodes overflow the card at {width}px"
                            folio = page.locator(".evidence-folio")
                            expect(folio).to_have_count(1)
                            page.locator("#evidence").screenshot(path=str(out / f"evidence-section-{width}.png"), caret="initial")
                            folio.screenshot(path=str(out / f"evidence-folio-{width}.png"), caret="initial")
                            fit = folio.evaluate("card => { const box = card.getBoundingClientRect(); return [...card.querySelectorAll('header, .evidence-score, .evidence-trail, footer')].every(node => { const rect = node.getBoundingClientRect(); return rect.left >= box.left && rect.right <= box.right; }); }")
                            assert fit, f"Evidence layout overflows at {width}px"
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    if path == "/" and not DIAGNOSTIC:
                        dossier = page.locator(".corridor-dossier")
                        page.emulate_media(reduced_motion="no-preference")
                        # Reload the isolated page to test its one-shot, below-fold entrance.
                        page.evaluate("window.scrollTo(0, 0)")
                        page.reload(wait_until="networkidle")
                        folio = page.locator(".evidence-folio")
                        assert folio.evaluate("node => node.getBoundingClientRect().top > window.innerHeight"), "Entrance test must start with evidence below the viewport"
                        folio.scroll_into_view_if_needed()
                        expect(folio).to_have_class(re.compile("has-entered"))
                        expect(folio).to_have_class(re.compile("is-armed"))
                        expect(folio).to_have_attribute("data-confidence-tone", "warn")
                        expect(folio.locator(".evidence-score")).to_contain_text("72%")
                        source = folio.get_by_role("link", name=re.compile("Open source:"))
                        expect(source).to_have_attribute("href", "https://example.test/evidence")
                        expect(source).to_have_attribute("rel", "noopener noreferrer")
                        expect(folio.get_by_role("link", name="Explore record")).to_have_attribute("href", "/providers/browser-fixture")
                        assert folio.locator('[data-evidence-entry="source"]').evaluate("node => getComputedStyle(node).animationName") == "evidence-arrive"
                        assert folio.locator('[data-evidence-entry="source"]').evaluate("node => getComputedStyle(node).animationIterationCount") == "1"
                        source.focus()
                        expect(source).to_be_focused()
                        assert source.evaluate("node => getComputedStyle(node).outlineStyle") != "none"
                        page.emulate_media(reduced_motion="reduce")
                        expect(folio).not_to_have_class(re.compile("is-armed"))
                        assert folio.locator('[data-evidence-entry="source"]').evaluate("node => getComputedStyle(node).animationName") == "none"
                        report["checks"].extend(["Evidence medium confidence is qualified, not green", "Evidence source and provider links retain their destinations", "Evidence link has visible keyboard focus", "Evidence entrance is one-shot and disabled for reduced motion"])
                        page.emulate_media(reduced_motion="no-preference")
                        dossier.scroll_into_view_if_needed()
                        expect(dossier).to_have_class(re.compile("is-running"))
                        page.get_by_role("contentinfo").scroll_into_view_if_needed()
                        expect(dossier).not_to_have_class(re.compile("is-running"))
                        page.emulate_media(reduced_motion="reduce")
                        dossier.scroll_into_view_if_needed()
                        expect(dossier).not_to_have_class(re.compile("is-running"))
                        assert dossier.locator(".corridor-packet > span").evaluate("node => getComputedStyle(node).animationName") == "none"
                        report["checks"].append("Route animation pauses offscreen and respects reduced motion")
                        dossier.get_by_role("link", name="Inspect this corridor").click()
                        expect(page).to_have_url(re.compile("/login"))
                        from urllib.parse import urlparse, parse_qs
                        destination = parse_qs(urlparse(page.url).query).get("next", [""])[0]
                        assert "Base" in parse_qs(urlparse(destination).query).get("q", [""])[0]
                        report["checks"].append("Inspect corridor preserves the Base route through sign-in")
                    print(f"Captured {role} {path}", flush=True)
                    if not BASELINE and path in ["/app/payments", "/app/policies", "/app/decisions"]:
                        links = page.locator(f'main a[href^="{path}/"]').evaluate_all("elements => elements.map(element => element.getAttribute('href'))")
                        paths.extend([link for link in dict.fromkeys(links) if link not in paths][:3])
                phase = "interactions"
                if role == "owner" and not BASELINE and not DIAGNOSTIC:
                    page.goto(origin + "/app", wait_until="networkidle")
                    page.get_by_role("button", name="Open search", exact=True).click()
                    expect(page.get_by_role("dialog", name="Command palette")).to_be_visible()
                    expect(page.get_by_role("combobox", name="Search Railor")).to_be_focused()
                    page.get_by_role("combobox", name="Search Railor").fill("no-such-page-fixture")
                    expect(page.get_by_text("Nothing matched", exact=False)).to_be_visible()
                    page.get_by_role("combobox", name="Search Railor").fill("Payments")
                    page.keyboard.press("ArrowDown")
                    page.keyboard.press("Shift+Tab")
                    expect(page.get_by_role("dialog", name="Command palette").locator(":focus")).to_have_count(1)
                    page.keyboard.press("Escape")
                    expect(page.get_by_role("dialog", name="Command palette")).not_to_be_visible()
                    expect(page.get_by_role("button", name="Open search", exact=True)).to_be_focused()
                    page.set_viewport_size({"width": 390, "height": 844})
                    page.get_by_role("button", name="Open menu", exact=True).click()
                    expect(page.get_by_role("navigation", name="Workspace")).to_be_visible()
                    page.keyboard.press("Control+k")
                    expect(page.get_by_role("combobox", name="Search Railor")).to_be_focused()
                    page.keyboard.press("Escape")
                    expect(page.get_by_role("dialog", name="Command palette")).not_to_be_visible()
                    expect(page.get_by_role("navigation", name="Workspace")).to_be_visible()
                    page.keyboard.press("Escape")
                    expect(page.get_by_role("button", name="Open menu", exact=True)).to_be_focused()
                    expect(page.get_by_role("navigation", name="Workspace")).not_to_be_visible()
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.get_by_role("button", name="Collapse sidebar", exact=True).click()
                    expect(page.get_by_role("navigation", name="Workspace").get_by_role("link", name="Payments", exact=True)).to_be_visible()
                    page.get_by_role("button", name="Expand sidebar", exact=True).click()
                    # Real-motion navigation through Next links, then browser history.
                    page.emulate_media(reduced_motion="no-preference")
                    page.evaluate("""() => {
                        window.visualTransitionCount = 0;
                        if (document.startViewTransition) {
                            const original = document.startViewTransition.bind(document);
                            document.startViewTransition = (update) => { window.visualTransitionCount++; return original(update); };
                        }
                    }""")
                    page.get_by_role("navigation", name="Workspace").get_by_role("link", name="Payments", exact=False).click()
                    page.wait_for_url("**/app/payments")
                    expect(page.locator("main h1")).to_have_text("Payments")
                    assert page.evaluate("!document.startViewTransition || window.visualTransitionCount > 0"), "Native outgoing/incoming transition did not run"
                    page.go_back(wait_until="networkidle")
                    expect(page.locator("main h1")).to_contain_text("owner")
                    page.get_by_role("button", name="Open search", exact=True).click()
                    page.get_by_role("button", name="Close search", exact=True).click()
                    expect(page.get_by_role("dialog", name="Command palette")).not_to_be_visible()
                    expect(page.get_by_role("button", name="Open search", exact=True)).to_be_focused()
                    report["checks"].extend(["search filtering and focus return", "search focus trap", "nested mobile menu and search", "mobile menu Escape", "sidebar collapse", "native page transition", "browser history", "search outgoing transition"])
                if role == "visitor" and not BASELINE and not DIAGNOSTIC:
                    page.goto(origin + "/login", wait_until="networkidle")
                    expect(page.get_by_role("heading", level=1)).to_be_visible()
                    page.route("**/api/auth/magic", lambda route: route.abort())
                    page.get_by_label("Work email").fill("test@example.test")
                    page.get_by_role("button", name="Continue with email", exact=False).click()
                    expect(page.locator("main").get_by_role("alert")).to_contain_text("Couldn't connect")
                    expect(page.get_by_role("button", name="Continue with email", exact=False)).to_be_enabled()
                    report["checks"].append("sign-in network failure recovery")
                if role == "operator" and not BASELINE and not DIAGNOSTIC:
                    page.goto(origin + "/admin", wait_until="networkidle")
                    page.set_viewport_size({"width": 390, "height": 600})
                    page.get_by_role("button", name="Open menu", exact=True).click()
                    expect(page.get_by_role("navigation", name="Operations")).to_be_visible()
                    page.keyboard.press("Escape")
                    expect(page.get_by_role("button", name="Open menu", exact=True)).to_be_focused()
                    report["checks"].append("operations drawer Escape and focus return")
                context.close()
            browser.close()
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        if not BASELINE:
            assert not report["errors"], report["errors"]
            assert not [row for row in report["pages"] if row["overflow"]], "Responsive overflow; inspect report.json"
            assert all(row["status"] == 200 for row in report["pages"]), "Unexpected HTTP response; inspect report.json"
        print(json.dumps({"captured": len(report["pages"]), "browserErrors": len(report["errors"]), "overflow": [row for row in report["pages"] if row["overflow"]], "directory": str(out)}))
    finally:
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(server.pid), "/T", "/F"], capture_output=True)
        else:
            server.terminate()
        server.wait(timeout=15)
        log.close()

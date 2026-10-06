"""Whole-app UI audit. Crawls every reachable page as a visitor, a workspace owner, a reviewer and a Railor
operator, then CLICKS every visible control and reports the ones that do nothing.

Owns only its temporary database and server (production build in .next-audit): no demo reset, no real provider
request, no real credentials, no network database. Payments run on Railor's own test rail.

  python apps/web/e2e/ui_audit.py            # audit, write .railor/ui-audit.json, print the findings
  python apps/web/e2e/ui_audit.py --no-build # reuse an existing .next-audit build
"""
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import deque
from pathlib import Path
from urllib.parse import urldefrag, urlparse

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
def arg(name):
    return next((a.split("=", 1)[1] for a in sys.argv if a.startswith(f"--{name}=")), None)


PORT = 3211
EXTERNAL = arg("server")  # audit an already-running server (its own disposable database) instead of booting one
ORIGIN = EXTERNAL.rstrip("/") if EXTERNAL else f"http://127.0.0.1:{PORT}"
NO_BUILD = "--no-build" in sys.argv
MOBILE = "--mobile" in sys.argv  # phone viewport with touch: hamburger menus, stacked layouts
ONLY = arg("only")
PAGES = arg("pages").split(",") if arg("pages") else None  # audit exactly these paths, following no links

# Controls that would end the audit session or flip a platform-wide switch are clicked separately, not in the sweep.
SKIP_CLICK = re.compile(r"sign out|log out|logout|pause (all )?payments|kill switch|resume payments", re.I)
# Nothing on these paths is part of the product UI.
SKIP_PATH = ("/api/", "/_next/", "/v1/", "/auth/", "/invite/", "signout")

INIT = r"""
(() => {
  try { sessionStorage.clear(); } catch (e) {}  // half-built forms must not leak from one load into the next
  window.__a = { mut: 0, dialogs: 0, clip: 0, opened: 0 };
  const start = () => new MutationObserver((list) => { window.__a.mut += list.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  const open = window.open; window.open = function () { window.__a.opened++; return null; };
  try { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { window.__a.clip++; return w(t).catch(() => undefined); }; } catch (e) {}
  if (window.HTMLDialogElement) { const s = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = function () { window.__a.dialogs++; return s.apply(this, arguments); }; }
})();
"""

ENUMERATE = r"""
(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const sel = 'button, [role=button], [role=tab], [role=menuitem], [role=switch], summary, input[type=submit], input[type=button], a[href]';
  const els = [...document.querySelectorAll(sel)].filter(vis);
  els.forEach((el, i) => el.setAttribute('data-audit', String(i)));
  return els.map((el, i) => ({
    i, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), type: el.getAttribute('type'),
    text: (el.getAttribute('aria-label') || el.textContent || el.value || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 70),
    href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel') || '',
    disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
    active: el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'true' || el.getAttribute('data-state') === 'on' || el.getAttribute('data-state') === 'active' || el.getAttribute('data-state') === 'checked',
    inForm: Boolean(el.closest('form')), title: el.getAttribute('title') || '',
    describedBy: Boolean(el.getAttribute('aria-describedby')), soon: /coming soon|soon/i.test(el.textContent || '') || /coming soon/i.test(el.getAttribute('title') || ''),
  }));
})()
"""


def free_port_check():
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            raise SystemExit(f"Port {PORT} is already in use; stop the other server first.")


def norm_template(path: str) -> str:
    p = urlparse(path).path
    p = re.sub(r"/[0-9a-f]{8}-[0-9a-f-]{27}", "/:id", p)
    p = re.sub(r"^(/(?:app/)?providers)/[^/]+$", r"\1/:slug", p)
    p = re.sub(r"^(/invite|/compare|/app/payments|/app/decisions|/app/policies)/[^/]+$", r"\1/:id", p)
    return p


def external_status(url: str):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0 (RailorAudit)"})
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status
    except urllib.error.HTTPError as e:
        if e.code in (403, 405, 429, 999, 501):  # bot walls and HEAD-hostile servers
            return "unverifiable"
        return e.code
    except Exception as e:  # noqa: BLE001
        return f"unreachable ({type(e).__name__})"


class Auditor:
    def __init__(self, browser, who, token, seeds, prefixes, limit, per_template=2):
        self.who, self.seeds, self.prefixes, self.limit, self.per_template = who, seeds, prefixes, limit, per_template
        phone = {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True} if MOBILE else {"viewport": {"width": 1440, "height": 900}}
        self.ctx = browser.new_context(accept_downloads=True, **phone)
        self.ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=ORIGIN)
        self.ctx.add_init_script(INIT)
        if token:
            self.ctx.add_cookies([{"name": "railor_session", "value": token, "url": ORIGIN}])
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(60000)
        self.requests = 0
        self.downloads = 0
        self.popups = 0
        self.dialogs = 0
        self.errors = []
        self.page.on("request", self._on_request)
        self.page.on("download", lambda d: setattr(self, "downloads", self.downloads + 1))
        self.ctx.on("page", lambda p: setattr(self, "popups", self.popups + 1) if p != self.page else None)
        self.page.on("dialog", self._on_dialog)
        self.page.on("pageerror", lambda e: self.errors.append(f"pageerror: {str(e)[:200]}"))
        self.page.on("console", lambda m: self.errors.append(f"console: {m.text[:200]}") if m.type == "error" else None)
        self.page.on("response", lambda r: self.errors.append(f"http {r.status}: {r.url[len(ORIGIN):][:110]}") if r.status >= 400 and r.url.startswith(ORIGIN) and "_rsc" not in r.url and "/_next/" not in r.url else None)
        self.report = {"pages": [], "clickErrors": [], "deadLinks": [], "noEffect": [], "unclickable": [], "disabledUnexplained": [], "externalLinks": {}, "skipped": [], "clicked": 0}

    def _on_request(self, request):
        u = request.url
        if "/_next/static" in u or "/_next/image" in u or request.resource_type in ("image", "font", "stylesheet", "media"):
            return
        if request.headers.get("next-router-prefetch") or request.headers.get("purpose") == "prefetch":
            return
        self.requests += 1

    def _on_dialog(self, dialog):
        self.dialogs += 1
        try:
            dialog.accept()
        except Exception:  # noqa: BLE001
            pass

    def in_scope(self, href):
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            return None
        u = urlparse(href)
        if u.netloc and u.netloc != urlparse(ORIGIN).netloc:
            return None
        path = (u.path or "/") + (f"?{u.query}" if u.query and len(u.query) < 70 else "")
        if any(s in path for s in SKIP_PATH):
            return None
        return path if any(path.startswith(p) for p in self.prefixes) else None

    def handle_anchor(self, item, path):
        if item["tag"] != "a":
            return
        href = item["href"] or ""
        mark = (path, href, item["text"])
        if mark in self.handled:
            return
        self.handled.add(mark)
        if href in ("", "#") or href.lower().startswith("javascript:"):
            self.report["deadLinks"].append({"page": path, "text": item["text"], "href": href})
            return
        if href.startswith("#"):
            if not self.page.evaluate("(h) => { try { return !!document.querySelector(h) } catch (e) { return false } }", href):
                self.report["deadLinks"].append({"page": path, "text": item["text"], "href": href, "why": "anchor target missing"})
            return
        if href.startswith("http") and urlparse(href).netloc != urlparse(ORIGIN).netloc:
            self.report["externalLinks"].setdefault(urldefrag(href)[0], []).append(path)
            if item["target"] == "_blank" and "noopener" not in item["rel"]:
                self.report.setdefault("noopener", []).append({"page": path, "href": href})
            return
        target = self.in_scope(href)
        if target and target not in self.seen:
            self.queue.append(target)

    def enumerate(self):
        """Visible controls with a stable key (tag + label + href + occurrence), so a control can be found again after a reload re-numbers the page."""
        items = self.page.evaluate(ENUMERATE)
        seen = {}
        for it in items:
            base = f"{it['tag']}|{it['text']}|{it['href'] or ''}"
            n = seen.get(base, 0)
            seen[base] = n + 1
            it["key"] = f"{base}#{n}"
        self.current = {it["key"]: it for it in items}
        return items

    def goto(self, path):
        resp = self.page.goto(ORIGIN + path, wait_until="networkidle", timeout=90000)
        # Controls inside collapsed sections are part of the page too: open them so they are tested.
        self.page.evaluate("document.querySelectorAll('details:not([open])').forEach((d) => { d.open = true; })")
        self.page.wait_for_timeout(500)
        return resp

    def run(self):
        seen, queue, per = set(), deque(self.seeds), {}
        while queue and len(seen) < self.limit:
            path = queue.popleft()
            if path in seen:
                continue
            tpl = norm_template(path)
            if per.get(tpl, 0) >= self.per_template:
                continue
            per[tpl] = per.get(tpl, 0) + 1
            seen.add(path)
            self.audit_page(path, queue, seen)
        self.ctx.close()
        return self.report

    def audit_page(self, path, queue, seen):
        self.errors = []
        entry = {"path": path, "status": None, "final": None, "title": "", "controls": 0, "errors": [], "brokenImages": []}
        try:
            resp = self.goto(path)
            entry["status"] = resp.status if resp else None
            entry["final"] = self.page.url[len(ORIGIN):]
            entry["title"] = self.page.title()
            entry["brokenImages"] = self.page.evaluate("[...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src.slice(-70))")
            items = self.enumerate()
        except Exception as e:  # noqa: BLE001
            entry["status"] = "EXC"
            entry["errors"].append(f"exception: {str(e)[:200]}")
            self.report["pages"].append(entry)
            return
        entry["controls"] = len(items)

        # Links: queue internal ones, flag dead ones, remember external ones.
        self.queue, self.seen, self.handled = queue, seen, set()
        for item in items:
            self.handle_anchor(item, path)

        # Buttons and other controls: click each and see whether anything happens.
        for item in items:
            if item["tag"] == "a":
                continue
            label = item["text"] or f"<{item['tag']}>"
            if SKIP_CLICK.search(label):
                self.report["skipped"].append({"page": path, "text": label, "why": "session/platform-wide effect, tested separately"})
                continue
            if item["disabled"]:
                if not (item["title"] or item["describedBy"] or item["soon"]):
                    self.report["disabledUnexplained"].append({"page": path, "text": label})
                continue
            self.click_one(path, item, label)
        entry["errors"] = sorted(set(self.errors))[:12]
        self.report["pages"].append(entry)

    def effect_state(self):
        return self.page.evaluate("({ a: window.__a || {}, url: location.href, dialog: !!document.querySelector('dialog[open], [role=dialog], [role=alertdialog]'), pressed: [...document.querySelectorAll('[aria-checked],[aria-selected],[aria-pressed],[aria-expanded]')].map((e) => e.getAttribute('aria-checked') + e.getAttribute('aria-selected') + e.getAttribute('aria-pressed') + e.getAttribute('aria-expanded')).join(), values: [...document.querySelectorAll('input,textarea,select')].map((e) => (e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value)).join('|') })")

    def click_one(self, path, item, label):
        now = self.current.get(item["key"])
        if now is None:
            # The page re-rendered (or was reset): look again from a clean load.
            try:
                self.goto(path)
                self.enumerate()
            except Exception:  # noqa: BLE001
                pass
            now = self.current.get(item["key"])
        if now is None:
            self.report.setdefault("notPresentAfterReset", []).append({"page": path, "text": label})
            return
        item = {**item, "i": now["i"]}
        loc = self.page.locator(f'[data-audit="{item["i"]}"]').first
        err0 = len(self.errors)
        try:
            loc.scroll_into_view_if_needed(timeout=4000)
            m0 = self.page.evaluate("window.__a.mut")
            self.page.wait_for_timeout(300)
            before = self.effect_state()
            idle = before["a"].get("mut", 0) - m0  # DOM churn with no interaction (animations, tickers)
            req0, dl0, pop0, dia0 = self.requests, self.downloads, self.popups, self.dialogs
            loc.click(timeout=4000, no_wait_after=True)
        except Exception as e:  # noqa: BLE001
            self.report["unclickable"].append({"page": path, "text": label, "why": str(e).splitlines()[0][:140]})
            return
        self.report["clicked"] += 1
        self.page.wait_for_timeout(650)
        if len(self.errors) > err0:
            self.report["clickErrors"].append({"page": path, "text": label, "errors": list(dict.fromkeys(self.errors[err0:]))[:4]})
        try:
            after = self.effect_state()
            invalid = self.page.evaluate("(i) => { const el = document.querySelector('[data-audit=\"' + i + '\"]'); const f = el && el.closest('form'); return !!(f && !f.checkValidity()); }", item["i"])
        except Exception:  # context destroyed by navigation: that is an effect
            after, invalid = None, False
        navigated = after is None or after["url"] != before["url"]
        changed = (
            navigated
            or self.requests > req0
            or self.downloads > dl0
            or self.popups > pop0
            or self.dialogs > dia0
            or invalid
            or after["a"].get("mut", 0) - before["a"].get("mut", 0) > (idle * 3.3 if idle else 0)
            or after["a"].get("clip", 0) > before["a"].get("clip", 0)
            or after["a"].get("opened", 0) > before["a"].get("opened", 0)
            or after["a"].get("dialogs", 0) > before["a"].get("dialogs", 0)
            or after["dialog"] != before["dialog"]
            or after["pressed"] != before["pressed"]
            or after["values"] != before["values"]
        )
        if changed and not navigated:
            try:
                for revealed in self.page.evaluate(ENUMERATE):
                    self.handle_anchor(revealed, path)
            except Exception:  # noqa: BLE001
                pass
        if not changed and not item["active"]:
            self.report["noEffect"].append({"page": path, "text": label, "tag": item["tag"], "role": item["role"], "type": item["type"], "inForm": item["inForm"]})
        # Reset whenever the click could have left the page in a different state.
        if navigated or changed:
            try:
                self.goto(path)
                self.enumerate()
            except Exception:  # noqa: BLE001
                pass


def run_roles(browser, results):
    roles = [
        ("visitor", None, ["/", "/prices", "/providers", "/coverage", "/changes", "/docs", "/company", "/status", "/login", "/legal/terms", "/definitely-missing"], ("/providers", "/prices", "/coverage", "/changes", "/docs", "/company", "/status", "/legal", "/login", "/compare", "/welcome", "/definitely"), 70),
        ("owner", "browser-test-owner", ["/app"], ("/app",), 120),
        ("reviewer", "browser-test-reviewer", ["/app/approvals", "/app/payments"], ("/app/approvals", "/app/payments"), 20),
        ("operator", "browser-test-operator", ["/admin"], ("/admin",), 40),
    ]
    for who, token, seeds, prefixes, limit in roles:
        if ONLY and ONLY != who:
            continue
        if PAGES:
            seeds, prefixes, limit = PAGES, ("/",), len(PAGES)
        print(f"\n=== auditing as {who} ===", flush=True)
        results[who] = Auditor(browser, who, token, seeds, prefixes, limit, per_template=99 if PAGES else 2).run()
        r = results[who]
        print(f"{who}: {len(r['pages'])} pages, {r['clicked']} controls clicked, {len(r['noEffect'])} with no effect, {len(r['deadLinks'])} dead links, {len(r['clickErrors'])} clicks that raised errors", flush=True)


def main():
    if EXTERNAL:
        results = {}
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            run_roles(browser, results)
            browser.close()
        out = ROOT / ".railor"
        out.mkdir(exist_ok=True)
        name = "ui-audit-mobile-focused.json" if MOBILE else "ui-audit-focused.json"
        (out / name).write_text(json.dumps(results, indent=1), encoding="utf-8")
        print(f"\nReport: {out / name}")
        return
    free_port_check()
    with tempfile.TemporaryDirectory(prefix="railor-browser-test-") as temp:
        key = secrets.token_bytes(32)
        import base64

        env = {**os.environ, "DATABASE_URL": "", "PGLITE_DATA_DIR": str(Path(temp) / "db"), "APP_ORIGIN": ORIGIN, "NEXT_PUBLIC_APP_URL": ORIGIN,
               "RAILOR_NEXT_DIST_DIR": ".next-audit", "NEXT_TELEMETRY_DISABLED": "1", "GEMINI_API_KEY": "", "TAVILY_API_KEY": "", "PARALLEL_API_KEY": "",
               "FIRECRAWL_API_KEY": "", "RAILOR_REMOTE_LOGOS": "off", "RAILOR_READ_CACHE_MS": "0", "CREDENTIALS_ENCRYPTION_KEY": base64.b64encode(key).decode(),
               "RAILOR_ALLOW_EMBEDDED_DB": "true", "CRON_SECRET": "audit-cron-secret"}
        if not NO_BUILD or not (WEB / ".next-audit" / "BUILD_ID").exists():
            print("Building the app for the audit (production mode)…")
            subprocess.run([PNPM, "--filter", "@railor/web", "build"], cwd=ROOT, env=env, check=True, timeout=900)
        subprocess.run([PNPM, "--filter", "@railor/core", "exec", "tsx", "../../apps/web/e2e/audit-seed.mts"], cwd=ROOT, env=env, check=True, timeout=240)
        log_path = Path(temp) / "server.log"
        log = log_path.open("w", encoding="utf-8")
        server = subprocess.Popen(["node", str(WEB / "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", str(PORT)], cwd=WEB, env=env, stdout=log, stderr=subprocess.STDOUT,
                                  creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        results = {}
        try:
            for _ in range(90):
                if server.poll() is not None:
                    raise RuntimeError(log_path.read_text(encoding="utf-8"))
                try:
                    with urllib.request.urlopen(ORIGIN + "/api/health/live", timeout=2) as r:
                        if r.status == 200:
                            break
                except Exception:  # noqa: BLE001
                    time.sleep(1)
            else:
                raise RuntimeError("Server readiness timed out")
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                run_roles(browser, results)
                browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except Exception:  # noqa: BLE001
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(server.pid)], capture_output=True)
            log.close()
        # External links: one HEAD each.
        for who, r in results.items():
            r["externalStatus"] = {url: external_status(url) for url in list(r["externalLinks"])[:60]}
        out = ROOT / ".railor"
        out.mkdir(exist_ok=True)
        name = "ui-audit-mobile.json" if MOBILE else "ui-audit.json"
        (out / name).write_text(json.dumps(results, indent=1), encoding="utf-8")
        print(f"\nFull report: {out / name}")


if __name__ == "__main__":
    main()

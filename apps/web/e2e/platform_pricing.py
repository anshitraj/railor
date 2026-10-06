"""Read-only browser checks against an existing Railor development server.

No signups, provider connections, conversions or payments. The page requests
backend FX quotes; use only sandbox platform credentials for this local check.
Run: python -X utf8 apps/web/e2e/platform_pricing.py
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--origin", default="http://localhost:3000")
args = parser.parse_args()
out = Path(__file__).resolve().parents[3] / ".railor" / "platform-acceptance"
out.mkdir(parents=True, exist_ok=True)
report = {"checks": [], "errors": [], "overflow": [], "screenshots": []}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(60000)
    page.on("pageerror", lambda error: report["errors"].append(str(error)))
    page.goto(args.origin + "/prices?from=USD&to=EUR&amount=1000&market=0", wait_until="networkidle")
    table = page.get_by_role("table")
    expect(table).to_contain_text("PayZoll")
    expect(table).to_contain_text("Skydo")
    expect(table).to_contain_text("Airwallex")
    expect(page.get_by_label("Railor-managed provider pricing")).to_contain_text("Sandbox · test data")
    expect(page.get_by_label("Railor-managed provider pricing")).to_contain_text("These are test rates")
    expect(page.get_by_label("Railor-managed provider pricing")).to_contain_text("No visitor API key needed")
    assert page.locator("input[type=password]").count() == 0
    report["checks"].append("Anonymous comparison and backend sandbox observation; no credential form")
    response = context.request.get(args.origin + "/api/prices?from=USD&to=EUR&amount=1000")
    assert response.status == 200
    body = response.json()
    observation = body["platformQuotes"][0]
    assert observation["environment"] == "sandbox" and observation["status"] == "quoted"
    assert observation["quote"]["accountContext"] == "railor_network"
    assert observation["quote"]["quoteType"] == "indicative"
    assert not any(row["providerSlug"] == "airwallex" for row in body["rows"])
    wire = json.dumps(body)
    for private_field in ["apiKey", "clientId", "providerQuoteId", "profileId", "authorization"]:
        assert private_field not in wire
    report["checks"].append("Sanitized response; sandbox quote excluded from selectable rows and price ranking")
    toggle = page.get_by_role("button", name="Show differences", exact=True)
    toggle.click()
    expect(toggle).to_have_attribute("aria-pressed", "true")
    assert table.locator("tbody tr").count() > 0
    toggle.click()
    expect(toggle).to_have_attribute("aria-pressed", "false")
    assert table.locator("tbody tr").count() == 9
    assert table.locator("tbody tr:first-child td a").count() == 3
    report["checks"].append("Keyboard-accessible difference toggle, nine feature rows, linked primary sources")
    for width in [1440, 768, 390]:
        page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=str(out / f"prices-{width}.png"), full_page=True)
        report["screenshots"].append(f"prices-{width}.png")
        if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
            report["overflow"].append(width)
        region = page.get_by_role("region", name="Provider feature comparison; scroll horizontally on small screens")
        region.focus()
        expect(region).to_be_focused()
        if width == 390:
            assert region.evaluate("node => node.scrollWidth > node.clientWidth")
    page.set_viewport_size({"width": 1440, "height": 1400})
    page.locator(".provider-comparison").screenshot(path=str(out / "feature-comparison.png"))
    assert page.locator(".provider-comparison").evaluate("node => getComputedStyle(node).animationName") == "none"
    page.emulate_media(reduced_motion="no-preference")
    assert page.locator(".provider-comparison").evaluate("node => getComputedStyle(node).animationIterationCount") == "1"
    report["checks"].append("1440/768/390 widths, contained table scrolling, reduced-motion support")
    # Expired test observations must hide their numbers even when polling fails.
    page.set_viewport_size({"width": 1440, "height": 1000})
    expired = {**observation, "quote": {**observation["quote"], "expiresAt": "2000-01-01T00:00:00Z", "recipientAmount": 987654.32}}
    context.route("**/api/prices?*", lambda route: route.fulfill(status=200, json={**body, "platformQuotes": [expired]}))
    page.get_by_role("button", name="Refresh quotes now", exact=True).click()
    panel = page.get_by_label("Railor-managed provider pricing")
    expect(panel).to_contain_text("Refreshing observation")
    expect(panel).not_to_contain_text("987,654")
    report["checks"].append("Expired quote hides the simulated amount until a fresh observation arrives")
    browser.close()

(out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
assert not report["errors"], report["errors"]
assert not report["overflow"], report["overflow"]
print(json.dumps(report, indent=2))

import { describe, expect, it } from "vitest";
import { workspaceArea } from "./workspace-navigation";
import { exploreRouteHref, parseExploreRoute } from "./explore-route";
import { setupSnippet } from "./developer-setup";

describe("simpler workspace journeys", () => {
  it.each([["/app", "Overview"], ["/app/providers/wise", "Compare"], ["/app/freelancer", "Compare"], ["/app/search", "Compare"], ["/app/connectors", "Developers"], ["/app/settings/connections", "Developers"], ["/app/decisions/one", "History"], ["/app/approvals", "History"], ["/app/policies", "Settings"], ["/app/monitoring", "Settings"]])("groups %s under %s", (path, area) => expect(workspaceArea(path)).toBe(area));
  it("keeps exact funding, network, amount and receiving details in read-only exploration", () => {
    const input = { sourceEntityCountry: "IN", sourceEntityType: "individual", beneficiaryType: "business", sourceAsset: "USDC", sourceNetwork: "base", destinationCountry: "AE", destinationCurrency: "AED", amount: 1234.56, endpointType: "bank_account", namedRail: "test-rail", preference: "cheapest" };
    const url = new URL(exploreRouteHref(input, "cheapest"), "https://railor.invalid");
    expect(url.pathname).toBe("/app/corridors");
    expect(parseExploreRoute(url.searchParams.get("route"))).toMatchObject({ customerType: "individual", entityCountry: "IN", sourceAsset: "USDC", sourceNetwork: "base", amount: 1234.56, destinationCountry: "AE", endpointType: "bank_account", namedRail: "test-rail" });
    expect(url.searchParams.get("preset")).toBe("cheapest");
    expect(url.searchParams.has("policyId")).toBe(false);
  });
  it("preserves fiat funding separately from assets and rejects malformed route parameters", () => {
    const url = new URL(exploreRouteHref({ sourceEntityCountry: "US", sourceEntityType: "business", beneficiaryType: "business", sourceCurrency: "USD", amountCurrency: "USD", destinationCountry: "IN", destinationCurrency: "INR", amount: 2000 }), "https://railor.invalid");
    const route = parseExploreRoute(url.searchParams.get("route"));
    expect(route).toMatchObject({ sourceCurrency: "USD", amountCurrency: "USD" }); expect(route?.sourceAsset).toBeUndefined();
    for (const input of [null, "{oops", JSON.stringify({ entityCountry: "not-a-country" }), "x".repeat(5000)]) expect(parseExploreRoute(input)).toBeNull();
  });
  it("generates client-specific setup without mixing shell commands into JSON", () => {
    const key = "rail_test_fixture_not_a_real_key";
    const cursor = JSON.parse(setupSnippet("Cursor", "https://railor.invalid/", key));
    expect(cursor.mcpServers.railor).toEqual({ url: "https://railor.invalid/api/mcp", headers: { Authorization: `Bearer ${key}` } });
    const vscode = JSON.parse(setupSnippet("VS Code", "https://railor.invalid", key));
    expect(vscode.servers.railor.type).toBe("http");
    expect(setupSnippet("Codex", "https://railor.invalid", key)).toContain("$env:RAILOR_KEY = '");
    expect(setupSnippet("Codex", "https://railor.invalid", key, false)).toContain("export RAILOR_KEY='");
    expect(setupSnippet("Claude Code", "https://railor.invalid", key)).toContain('--header "Authorization: Bearer ' + key);
  });
});

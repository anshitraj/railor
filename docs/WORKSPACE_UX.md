# Workspace experience

The default experience serves businesses and freelancers comparing providers, and developers connecting Railor to their apps or AI tools.

## Navigation

The sidebar has five destinations: Overview, Compare, Agent, History, Developers. Settings stays in the footer. Existing URLs remain valid and searchable in the command palette.

Below 768px the same destinations appear in a fixed bottom navigation bar, with labelled 64px targets and safe-area padding. The menu still contains Settings. Main content and the Agent conversation reserve space for the bar. When an editable field has an on-screen keyboard open, the bar hides and the Agent uses the visible viewport height; navigation returns when the keyboard closes.

| Area | Main journey | Additional tools |
| --- | --- | --- |
| Overview | Compare a price or set up the API | Saved routes, invoices, changes, optional team controls |
| Compare | Prices, route search, corridors, providers | Provider comparison, map and invoices under More tools |
| Agent | Describe and review a route | Company-rule comparisons when an active policy is available |
| History | Payment history | Recorded rule checks and team reviews under More tools |
| Developers | One primary key card and selected client setup | Usage, extra keys, webhooks and customer-hosted runtime |
| Settings | Workspace and team | Company rules, routing preferences, monitoring and research |

## Comparison and team controls

Without an active company policy, the route builder and Agent open read-only corridor exploration. Structured intent fields and ranking preference are preserved. This does not create a decision, approve a payment, or pretend that the route passed a policy.

With an active policy, the existing search-preview and decision paths continue to enforce its rules. Company rules, rule checks and team reviews retain their policy/decision/approval API names and permissions.

## Onboarding

Three main questions collect the customer profile, home country and destination markets. Business purpose, currency and product preferences are expandable. Existing saved answers and the persisted completion marker remain compatible. An optional API choice sends the user to Developers after completion, unless an existing return destination takes precedence.

## API and client setup

One primary key is presented by default. Existing test/live permissions and additional keys are preserved. A live-only workspace does not receive another automatic test key. Only owners/admins manage keys on this page. Regeneration requires confirmation and atomically replaces the selected key while preserving its mode and request cap. Live secrets remain one-time values.

API key and AI-tool setup are separate tabs. The AI-tool picker shows only the selected client’s setup. Copied setup includes an available key; displayed setup uses a placeholder. The API key and customer-hosted provider-runtime installation token serve different purposes. Runtime setup remains an advanced tool and does not enable live transfers.

Client setup references: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp).

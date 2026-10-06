# Freelancer invoices

Open **Freelancer** in the workspace navigation.

1. Upload a PDF, PNG or JPEG (up to 4 MB), explicitly consent to sending it to Google Gemini, and extract the fields. Manual entry also works without an AI key. Check the invoice total, invoice currency, client country and due date. Receiving setup holds the account country, bank currency, legal form and payment purpose.
2. Save the reviewed invoice and compare receiving routes. Railor uses its existing collection eligibility engine, workspace readiness and profile-specific pricing rules. Commercial freelance income is evaluated as a business collection, never personal remittance. Only the unpaid balance is priced.
3. Review fees, missing requirements and sources. A recommendation needs documented profile eligibility, a supported/conditional corridor and complete pricing. Unknown routes and incomplete prices remain labelled. Public consumer market estimates are excluded. A published estimate is not a locked account quote.
4. Choose connection options, complete provider onboarding and share verified receiving instructions separately. Railor generates a copyable payment request but does not invent bank details or initiate an incoming collection.
5. Upload a receipt for review or enter it manually. Confirm the original invoice-currency allocation separately from the net bank credit. Explicitly confirm that you checked the provider/bank statement. Railor uses exact integer minor units to calculate partial/full payment, prevents duplicate receipt references and over-allocation, and exports CSV for accounting.

## Integration and privacy boundaries

The original file is processed transiently, not stored by Railor. Reviewed invoice and receipt fields are saved privately in the signed-in workspace. Gemini proposals never automatically save an invoice or mark it paid. Documents are untrusted data; the extractor has no tools, never follows document links, and requests no bank credentials. Workspace roles, consent, MIME/signature validation, bounded bodies, a 25-second AI request timeout and a 12-extraction/hour/workspace quota are enforced on the server. The shared public demo blocks private document uploads and resets synthetic invoices on demo entry.

Configure `GEMINI_API_KEY` and optionally `RAILOR_INVOICE_MODEL` (defaults to `RAILOR_LLM_MODEL`, then `gemini-flash-latest`). AI works only when the configured key and model are available. Choose Google service/account terms appropriate to the documents users submit.

Statuses are **Awaiting payment**, **Partially paid · manual**, and **Paid · recorded manually**. Automatic provider-received/converting/bank-credited events require an authorized receiving integration and are not simulated. An invoice PDF is not archived for tax documentation; retain the original separately. Bank-reference splitting across multiple invoices, credit notes, edits to recorded financial history, tax calculations and automatic provider/bank reconciliation are future scope.

Migration `0024_freelancer_invoices.sql` is additive: two tenant-owned tables and indexes. Apply deliberately to hosted PostgreSQL before serving the feature; do not enable automatic hosted migrations. The API is `/api/freelancer` with reviewed save, route and receipt actions; `/api/freelancer/extract` accepts consented uploads. Exports and reads require a workspace session.

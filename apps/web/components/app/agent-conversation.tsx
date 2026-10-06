"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Bot, ChevronDown, MessageSquare, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { SearchPreviewResult, draftPaymentIntent } from "@railor/core";
import { RANKING_PRESET_LABEL, ProductType, PaymentMethod, type RankingPreset } from "@railor/types";
import { controlCommand } from "../../app/app/control-actions";
import { answerAgentQuestion, followupPreference, type AgentAnswer } from "../../lib/agent-presentation";
import { IntentBuilder, draftFromPartial, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "./intent-builder";
import { InfrastructureResults } from "./infrastructure-results";
import { RailorMark } from "../brand";

type DraftResult = ReturnType<typeof draftPaymentIntent>;
type SearchReply = { state: "needs_input" | "needs_confirmation" | "needs_policy" | "ready"; draft: DraftResult; preview: SearchPreviewResult | null };
type Message = { id: number; role: "user" | "agent"; text: string; answer?: AgentAnswer };
const preferences: RankingPreset[] = ["balanced", "cheapest", "fastest", "most_reliable", "max_recipient_amount"];
const examples = [
  { label: "USDC → Mexico", text: "I need to send $100k USDC on Base from our Singapore company to a Mexican supplier receiving MXN through SPEI. Reliability matters more than price." },
  { label: "INR → AED", text: "Our Indian company needs to send 25000 INR to a supplier in UAE receiving AED. Compare the available paths." },
  { label: "USD → EUR", text: "Our Singapore company needs to send 50000 USD to Germany, receiving EUR. Show the best overall options." },
];

export function AgentConversation({ policies, options, entityCountry, defaultEmail, canDecide }: {
  policies: Array<{ id: string; name: string }>; options: IntentOptions; entityCountry?: string; defaultEmail: string; canDecide: boolean;
}) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [intent, setIntent] = useState<IntentDraft | null>(null);
  const [preference, setPreference] = useState<RankingPreset>("balanced");
  const [product, setProduct] = useState("");
  const [method, setMethod] = useState("");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [preview, setPreview] = useState<SearchPreviewResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sequence = useRef(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const add = (role: Message["role"], content: string, answer?: AgentAnswer) => setMessages((current) => [...current, { id: ++sequence.current, role, text: content, answer }].slice(-12));
  const missing = intent ? [...missingIntentFields(intent), ...(!intent.destinationCurrency ? ["destination currency"] : []),
    ...(intent.sourceKind === "asset" && !intent.sourceNetwork ? ["source network"] : [])] : [];

  function receivePreview(next: SearchPreviewResult) {
    setPreview(next); setReviewOpen(false);
    const relevant = next.candidates.filter((c) => c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed");
    add("agent", `I checked ${next.evidenceSummary.providersChecked} providers. ${relevant.length} have route evidence for this request; ${next.permittedCandidates.length} passed your policy. ${next.bestCandidate ? `${next.bestCandidate.provider} ranks first for ${RANKING_PRESET_LABEL[next.intent.preference].toLowerCase()}.` : "Current evidence does not support a best option for this comparison yet."}`);
  }

  function searchDraft(nextPreference = preference, nextPolicyId = policyId, message?: string) {
    if (!intent || !nextPolicyId || missing.length) return;
    setError(""); setPreview(null);
    if (message) add("user", message);
    start(async () => {
      try {
        const value = { ...intentFromDraft(intent), preference: nextPreference,
          ...(product ? { product } : {}),
          ...(method ? { paymentMethod: method } : {}),
        };
        const result = await controlCommand({ action: "search_preview", intent: value, policyId: nextPolicyId });
        if (!result.ok) setError(result.error ?? "Search failed. Please retry.");
        else receivePreview(result.data as SearchPreviewResult);
      } catch { setError("The connection dropped. Please try again."); }
    });
  }

  function ask(raw: string) {
    const question = raw.trim();
    if (!question || pending) return;
    setText(""); setError("");
    if (preview && !/\b(?:send|sending|move|transfer|pay)\b.*\d/i.test(question)) {
      const rankingQuestion = /^(?:which|what|who)\b.*(?:cheapest|fastest|most reliable)/i.test(question) ? followupPreference(question) : null;
      if (rankingQuestion) { setPreference(rankingQuestion); searchDraft(rankingQuestion, policyId, question); return; }
      const answer = answerAgentQuestion(question, preview);
      // Questions explain the existing snapshot. Commands such as "compare by
      // price" re-run the server evaluation rather than reshuffling in the client.
      if (answer) { add("user", question); add("agent", "", answer); return; }
      const nextPreference = followupPreference(question);
      if (nextPreference) { setPreference(nextPreference); searchDraft(nextPreference, policyId, question); return; }
      if (/^(?:why|explain|what|which|how|is|does|can)\b/i.test(question)) {
        add("user", question); add("agent", "I can explain the route, policy, pricing and missing evidence for providers in this comparison. Choose a provider’s Why button, or ask what information is missing."); return;
      }
    }
    add("user", question); setPreview(null);
    const requestText = draft && !preview && !/\b(?:send|sending|move|transfer|pay)\b/i.test(question)
      ? `${draft.interpretation.input}\n${question}` : question;
    start(async () => {
      try {
        const result = await controlCommand({ action: "agent_search", text: requestText, policyId: policyId || undefined });
        if (!result.ok) { setError(result.error ?? "Could not read the request. Please retry."); return; }
        const reply = result.data as SearchReply;
        setDraft(reply.draft); setIntent(draftFromPartial(reply.draft.draft, entityCountry));
        setProduct(typeof reply.draft.draft.product === "string" ? reply.draft.draft.product : "");
        setMethod(typeof reply.draft.draft.paymentMethod === "string" ? reply.draft.draft.paymentMethod : "");
        setPreference((reply.draft.draft.preference as RankingPreset) ?? "balanced");
        if (reply.preview) receivePreview(reply.preview);
        else {
          setReviewOpen(true);
          add("agent", reply.state === "needs_input" ? `I need a little more information: ${reply.draft.missing.map((field) => field.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}. Fill the fields below to continue.`
            : reply.state === "needs_confirmation" ? "I’ve prepared the request. Please confirm the suggested destination values below before I compare providers."
            : "The request is ready. Create and activate your company policy, then return here to compare permitted providers.");
        }
      } catch { setError("The connection dropped. Please try again."); }
    });
  }

  function explain(provider: string) {
    if (!preview) return;
    const name = preview.candidates.find((c) => c.providerSlug === provider)?.provider ?? provider;
    ask(`Why ${name}?`);
  }
  function decide(provider: string) {
    if (!preview) return;
    setError("");
    start(async () => {
      try {
        const result = await controlCommand({ action: "decision", intent: preview.intent, policyId: preview.policyId, mode: "enforce", provider });
        if (!result.ok) setError(result.error ?? "Could not record this decision. Please retry.");
        else if (result.href) router.push(result.href);
      } catch { setError("The connection dropped. Please try again."); }
    });
  }

  return <div className="agent-workspace">
    <header className="agent-intro"><div><p className="product-eyebrow">Railor Agent / evidence-led assistance</p><h1>Where should<br /><span>your money go?</span></h1><p>Describe the movement. I’ll compare the infrastructure, apply your policy and explain the options.</p></div>
      <div className="agent-scope"><RailorMark size={34} /><span>Every answer<br /><strong>traces to evidence.</strong></span></div></header>
    {!policies.length ? <div className="search-policy-empty"><ShieldCheck size={22} /><div><h3>First, set your company policy.</h3><p>You can draft the movement now. An active policy is required for provider comparison and a recorded decision.</p></div><Link className="comparison-primary-action" href="/app/policies">Set up a policy <ArrowRight size={14} /></Link></div> : null}
    <section className="agent-conversation" aria-label="Conversation with Railor"><div className="agent-toolbar"><span><span className="agent-ready-dot" />{pending ? "Working on your request" : "Ready to compare"}</span>
      {messages.length ? <button type="button" disabled={pending} onClick={() => { setMessages([]); setPreview(null); setDraft(null); setIntent(null); setReviewOpen(false); setError(""); setText(""); composer.current?.focus(); }}><RotateCcw size={13} />New conversation</button> : <span>Search and explanation</span>}</div>
      {messages.length ? <div className="agent-messages" role="log" aria-label="Conversation messages">{messages.map((message) => <div key={message.id} className="agent-message" data-role={message.role}>
        <span className="agent-message-mark">{message.role === "agent" ? <RailorMark size={19} /> : "You"}</span><div>{message.answer ? <><h3>{message.answer.title}</h3><div className="agent-answer-lines">{message.answer.lines.map((line, index) => <p key={index}>{line}</p>)}</div>{message.answer.reasonCodes.length ? <p className="agent-reason-codes">{message.answer.reasonCodes.join(" · ")}</p> : null}</> : <p>{message.text}</p>}</div></div>)}</div>
        : <div className="agent-empty"><MessageSquare size={23} /><h2>Start with the movement.</h2><p>Include your company’s country, funding asset or currency, destination and amount. Add what matters most to you.</p>
          <div className="agent-examples">{examples.map((example) => <button type="button" key={example.label} onClick={() => { setText(example.text); composer.current?.focus(); }}><span>{example.label}</span><ArrowUp size={14} /></button>)}</div></div>}
      {pending ? <div className="agent-working" role="status"><span className="search-progress-dot" />Reading the request and checking current policy and evidence…</div> : null}
      <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); ask(text); }}><label className="sr-only" htmlFor="agent-message">Ask Railor</label>
        <textarea id="agent-message" ref={composer} rows={3} maxLength={2000} value={text} disabled={pending} onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(text); } }}
          placeholder={preview ? "Ask why a provider was blocked, or describe another movement…" : "Send $100k USDC on Base from Singapore to a Mexican supplier in MXN through SPEI…"} />
        <div><span>Enter to send · Shift + Enter for a new line</span><button type="submit" disabled={pending || !text.trim()} aria-label="Send request"><ArrowUp size={19} /></button></div></form>
    </section>
    {error ? <p className="search-error" role="alert">{error}</p> : null}
    {intent ? <section className="agent-request"><div className="agent-request-summary"><div><span className="product-index">INTERPRETED REQUEST</span><p>{intent.amount?.toLocaleString() ?? "Amount needed"} {intent.sourceKind === "asset" ? intent.sourceAsset || "Asset needed" : intent.sourceCurrency || "Currency needed"}<ArrowRight size={17} />{intent.destinationCurrency || "Destination currency needed"}<span>{intent.sourceEntityCountry || "Origin needed"} → {intent.destinationCountry || "Destination needed"}{intent.namedRail ? ` · ${intent.namedRail}` : ""}</span></p></div>
        <button type="button" onClick={() => setReviewOpen((open) => !open)} aria-expanded={reviewOpen}><SlidersHorizontal size={15} />Review fields<ChevronDown size={14} /></button></div>
      <div className="agent-policy-controls"><label>Company policy<select disabled={pending || !policies.length} value={policyId} onChange={(event) => { const next = event.target.value; setPolicyId(next); if (preview) searchDraft(preference, next, "Recheck with the selected company policy."); }}>{!policies.length ? <option value="">Create a policy first</option> : policies.map((policy) => <option value={policy.id} key={policy.id}>{policy.name}</option>)}</select></label>
        <label>Compare by<select disabled={pending} value={preference} onChange={(event) => { const next = event.target.value as RankingPreset; setPreference(next); if (preview) searchDraft(next, policyId, `Compare by ${RANKING_PRESET_LABEL[next].toLowerCase()}.`); }}>{preferences.map((value) => <option key={value} value={value}>{RANKING_PRESET_LABEL[value]}</option>)}</select></label></div>
      {reviewOpen ? <div className="agent-request-fields"><fieldset disabled={pending}><IntentBuilder value={intent} onChange={(next) => { setIntent(next); setPreview(null); }} options={options} detectedEntity={entityCountry} />
        {draft?.draft.product || draft?.draft.paymentMethod ? <div className="agent-policy-controls mt-5 !px-0 !pb-0"><label>Interpreted product<select value={product} onChange={(event) => { setProduct(event.target.value); setPreview(null); }}><option value="">Not specified</option>{ProductType.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Interpreted payment method<select value={method} onChange={(event) => { setMethod(event.target.value); setPreview(null); }}><option value="">Not specified</option>{PaymentMethod.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div> : null}
        </fieldset>
        {draft?.notes.map((note) => <p className="mt-3 text-xs text-[var(--color-muted)]" key={note}>{note}</p>)}
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="comparison-primary-action" disabled={pending || !policyId || missing.length > 0} onClick={() => searchDraft()}>Confirm fields & search <ArrowRight size={15} /></button>{missing.length ? <span className="text-xs text-[var(--color-muted)]">Still needed: {missing.join(", ")}.</span> : null}</div></div> : null}
    </section> : null}
    {preview ? <><InfrastructureResults preview={preview} canDecide={canDecide} busy={pending} defaultEmail={defaultEmail} onSelect={decide} onExplain={explain} />
      <div className="agent-followups"><span>Keep exploring</span><button type="button" disabled={pending} onClick={() => ask("Why is there no best option?")}>Explain the recommendation</button><button type="button" disabled={pending} onClick={() => ask("What information is missing?")}>What’s missing?</button><button type="button" disabled={pending} onClick={() => ask("Compare by price")}>Compare by price</button></div></> : null}
    <p className="agent-footer"><Bot size={14} />The Agent structures your request and explains Railor’s results. A decision is recorded only when you choose a provider.</p>
  </div>;
}

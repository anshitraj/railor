"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, ChevronDown, History, MessageSquare, Plus, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useModalFocus } from "@railor/ui";
import type { SearchPreviewResult, draftPaymentIntent } from "@railor/core";
import { RANKING_PRESET_LABEL, ProductType, PaymentMethod, type RankingPreset } from "@railor/types";
import { controlCommand } from "../../app/app/control-actions";
import { answerAgentQuestion, followupPreference, type AgentAnswer } from "../../lib/agent-presentation";
import { IntentBuilder, draftFromPartial, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "./intent-builder";
import { InfrastructureResults } from "./infrastructure-results";
import { RailorMark } from "../brand";
import { CHAT_HISTORY_LIMIT, CHAT_MESSAGE_LIMIT, chatTitle, parseAgentHistory, upsertAgentChat, type AgentChat, type ChatMessage } from "../../lib/agent-history";
import { AgentStarters } from "./agent-starters";
import styles from "./agent-chat.module.css";

type DraftResult = ReturnType<typeof draftPaymentIntent>;
type SearchReply = { state: "needs_input" | "needs_confirmation" | "needs_policy" | "ready"; draft: DraftResult; preview: SearchPreviewResult | null };
const preferences: RankingPreset[] = ["balanced", "cheapest", "fastest", "most_reliable", "max_recipient_amount"];

export function AgentConversation({ policies, options, entityCountry, defaultEmail, canDecide, historyScope, advancedTools }: {
  policies: Array<{ id: string; name: string }>; options: IntentOptions; entityCountry?: string; defaultEmail: string; canDecide: boolean; historyScope: string; advancedTools?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [intent, setIntent] = useState<IntentDraft | null>(null);
  const [preference, setPreference] = useState<RankingPreset>("balanced");
  const [product, setProduct] = useState("");
  const [method, setMethod] = useState("");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [preview, setPreview] = useState<SearchPreviewResult | null>(null);
  const [previewMessageId, setPreviewMessageId] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sequence = useRef(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const workspace = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<AgentChat[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [activeChat, setActiveChat] = useState<{ id: string; createdAt: number } | null>(null);
  const [restored, setRestored] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const historyPanel = useModalFocus<HTMLElement>(historyOpen, () => setHistoryOpen(false));
  const toolsPanel = useModalFocus<HTMLDivElement>(toolsOpen, () => setToolsOpen(false));

  useEffect(() => {
    try { setHistory(parseAgentHistory(localStorage.getItem(historyScope))); }
    catch { setStorageAvailable(false); }
    setHistoryLoaded(true);
  }, [historyScope]);

  useEffect(() => {
    if (!historyLoaded || !activeChat || !messages.length) return;
    const chat: AgentChat = { ...activeChat, title: chatTitle(messages), updatedAt: Date.now(), messages,
      intent, preference, policyId, product, method };
    // Read the latest stored list so another tab's conversations are not lost.
    let previous: AgentChat[] = [];
    try { previous = parseAgentHistory(localStorage.getItem(historyScope)); } catch { /* Session-only history still works. */ }
    const next = upsertAgentChat(previous, chat);
    setHistory((current) => upsertAgentChat(current, chat));
    try { localStorage.setItem(historyScope, JSON.stringify(next)); setHistory(next); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [historyLoaded, historyScope, activeChat, messages, intent, preference, policyId, product, method]);

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = messages.length ? feed.current.scrollHeight : 0;
  }, [messages.length, pending]);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    // Fit below the actual app header, including wrapped demo banners on mobile.
    const fit = () => element.style.setProperty("--agent-top", `${Math.round(element.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = "auto";
    composer.current.style.height = `${Math.min(composer.current.scrollHeight, 150)}px`;
  }, [text]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1101px)");
    const closeDrawer = () => { if (media.matches) setHistoryOpen(false); };
    media.addEventListener("change", closeDrawer);
    return () => media.removeEventListener("change", closeDrawer);
  }, []);

  function newChat() {
    if (pending) return;
    setActiveChat(null); setMessages([]); setPreview(null); setDraft(null); setIntent(null);
    setReviewOpen(false); setError(""); setText(""); setRestored(false); setHistoryOpen(false);
    setPreference("balanced"); setProduct(""); setMethod(""); setPolicyId(policies[0]?.id ?? "");
    sequence.current = 0;
    requestAnimationFrame(() => composer.current?.focus());
  }
  function openChat(chat: AgentChat) {
    if (pending) return;
    setActiveChat({ id: chat.id, createdAt: chat.createdAt }); setMessages(chat.messages);
    setIntent(chat.intent); setPreference(chat.preference); setProduct(chat.product); setMethod(chat.method);
    setPolicyId(policies.some((p) => p.id === chat.policyId) ? chat.policyId : policies[0]?.id ?? "");
    setPreview(null); setDraft(null); setRestored(true); setReviewOpen(false); setText(""); setError(""); setHistoryOpen(false);
    sequence.current = Math.max(...chat.messages.map((message) => message.id), 0);
    requestAnimationFrame(() => composer.current?.focus());
  }
  function deleteChat(id: string) {
    if (pending) return;
    if (activeChat?.id === id) newChat();
    const next = history.filter((chat) => chat.id !== id);
    setHistory(next);
    try { localStorage.setItem(historyScope, JSON.stringify(next)); }
    catch { setStorageAvailable(false); }
  }
  function add(role: ChatMessage["role"], content: string, answer?: AgentAnswer) {
    setActiveChat((current) => current ?? { id: crypto.randomUUID(), createdAt: Date.now() });
    const message: ChatMessage = { id: ++sequence.current, role, text: content, answer };
    setMessages((current) => [...current, message].slice(-CHAT_MESSAGE_LIMIT));
    return message.id;
  }
  const missing = intent ? [...missingIntentFields(intent), ...(!intent.destinationCurrency ? ["destination currency"] : []),
    ...(intent.sourceKind === "asset" && !intent.sourceNetwork ? ["source network"] : [])] : [];

  function receivePreview(next: SearchPreviewResult) {
    setPreview(next); setReviewOpen(false); setRestored(false);
    const relevant = next.candidates.filter((c) => c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed");
    setPreviewMessageId(add("agent", `I checked ${next.evidenceSummary.providersChecked} providers. ${relevant.length} have route evidence for this request; ${next.permittedCandidates.length} passed your policy. ${next.bestCandidate ? `${next.bestCandidate.provider} ranks first for ${RANKING_PRESET_LABEL[next.intent.preference].toLowerCase()}.` : "Current evidence does not support a best option for this comparison yet."}`));
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
    const priorRequest = draft?.interpretation.input ?? (intent ? messages.filter((message) => message.role === "user").map((message) => message.text).join("\n") : "");
    const requestText = priorRequest && !preview && !/\b(?:send|sending|move|transfer|pay)\b/i.test(question)
      ? `${priorRequest}\n${question}` : question;
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
          setReviewOpen(reply.state !== "needs_policy");
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

  const requestPanel = intent ? <section className={`agent-request ${styles.request}`}><div className="agent-request-summary"><div><span className="product-index">INTERPRETED REQUEST</span><p>{intent.amount?.toLocaleString() ?? "Amount needed"} {intent.sourceKind === "asset" ? intent.sourceAsset || "Asset needed" : intent.sourceCurrency || "Currency needed"}<ArrowRight size={17} />{intent.destinationCurrency || "Destination currency needed"}<span>{intent.sourceEntityCountry || "Origin needed"} → {intent.destinationCountry || "Destination needed"}{intent.namedRail ? ` · ${intent.namedRail}` : ""}</span></p></div>
        <button type="button" onClick={() => setReviewOpen((open) => !open)} aria-expanded={reviewOpen}><SlidersHorizontal size={15} />Review fields<ChevronDown size={14} /></button></div>
      <div className="agent-policy-controls"><label>Company policy<select disabled={pending || !policies.length} value={policyId} onChange={(event) => { const next = event.target.value; setPolicyId(next); if (preview) searchDraft(preference, next, "Recheck with the selected company policy."); }}>{!policies.length ? <option value="">Create a policy first</option> : policies.map((policy) => <option value={policy.id} key={policy.id}>{policy.name}</option>)}</select></label>
        <label>Compare by<select disabled={pending} value={preference} onChange={(event) => { const next = event.target.value as RankingPreset; setPreference(next); if (preview) searchDraft(next, policyId, `Compare by ${RANKING_PRESET_LABEL[next].toLowerCase()}.`); }}>{preferences.map((value) => <option key={value} value={value}>{RANKING_PRESET_LABEL[value]}</option>)}</select></label></div>
      {reviewOpen ? <div className="agent-request-fields"><fieldset disabled={pending}><IntentBuilder value={intent} onChange={(next) => { setIntent(next); setPreview(null); }} options={options} detectedEntity={entityCountry} />
        {product || method ? <div className="agent-policy-controls mt-5 !px-0 !pb-0"><label>Interpreted product<select value={product} onChange={(event) => { setProduct(event.target.value); setPreview(null); }}><option value="">Not specified</option>{ProductType.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Interpreted payment method<select value={method} onChange={(event) => { setMethod(event.target.value); setPreview(null); }}><option value="">Not specified</option>{PaymentMethod.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div> : null}
        </fieldset>
        {draft?.notes.map((note) => <p className="mt-3 text-xs text-[var(--color-muted)]" key={note}>{note}</p>)}
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="comparison-primary-action" disabled={pending || !policyId || missing.length > 0} onClick={() => searchDraft()}>Confirm fields & search <ArrowRight size={15} /></button>{missing.length ? <span className="text-xs text-[var(--color-muted)]">Still needed: {missing.join(", ")}.</span> : null}</div></div> : null}
    </section> : null;
  const comparison = preview ? <>{requestPanel}<InfrastructureResults preview={preview} canDecide={canDecide} busy={pending} defaultEmail={defaultEmail} onSelect={decide} onExplain={explain} />
      <div className="agent-followups"><span>Keep exploring</span><button type="button" disabled={pending} onClick={() => ask("Why is there no best option?")}>Explain the recommendation</button><button type="button" disabled={pending} onClick={() => ask("What information is missing?")}>What’s missing?</button><button type="button" disabled={pending} onClick={() => ask("Compare by price")}>Compare by price</button></div></> : null;

  return <div className={styles.workspace} ref={workspace}>
    <section className={styles.conversation} aria-label="Conversation with Railor">
      <header className={styles.toolbar}>
        <div className={styles.identity}><RailorMark size={30} /><span>Railor Agent<small>Evidence behind every answer</small></span></div>
        <div className={styles.toolbarActions}>
          {advancedTools ? <button className={styles.iconButton} type="button" onClick={() => setToolsOpen(true)} aria-label="Open advanced tools" title="Advanced tools"><SlidersHorizontal size={15} /></button> : null}
          <button className={styles.iconButton} type="button" disabled={pending} onClick={newChat} aria-label="Start a new chat" title="New chat"><Plus size={15} /><span>New chat</span></button>
          <button className={`${styles.iconButton} ${styles.mobileHistory}`} type="button" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" aria-expanded={historyOpen}><History size={16} /></button>
        </div>
      </header>
      <div className={styles.feed} ref={feed}>
        {messages.length ? <>
          {restored ? <div className={styles.savedNotice}><span>Saved conversation. Earlier answers may be out of date.</span>{intent && policyId && !missing.length ? <button type="button" disabled={pending} onClick={() => searchDraft(preference, policyId, "Refresh this comparison using current evidence.")}>Refresh comparison</button> : <span>Review the request below to run a fresh comparison.</span>}</div> : null}
          <div className={styles.messages} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions">{messages.map((message) => <Fragment key={message.id}><div className={styles.message} data-role={message.role}>
            <span>{message.role === "agent" ? <><RailorMark size={22} />Railor</> : "You"}</span>
            <div>{message.answer ? <><h3>{message.answer.title}</h3><div className="agent-answer-lines">{message.answer.lines.map((line, index) => <p key={index}>{line}</p>)}</div>{message.answer.reasonCodes.length ? <p className="agent-reason-codes">{message.answer.reasonCodes.join(" · ")}</p> : null}</> : <p>{message.text}</p>}</div>
          </div>{previewMessageId === message.id ? comparison : null}</Fragment>)}</div>
        </> : <div className={styles.welcome}>
          <div className={styles.welcomeMark} aria-hidden="true"><RailorMark size={54} /></div>
          <h1>Ask anything.</h1><p>A clearer path for your money. Compare providers, explore a route, or understand the evidence.</p>
          <span className={styles.suggestionLabel}>A few places to start</span>
          <AgentStarters onChoose={(value) => { setText(value); composer.current?.focus(); }} />
          {!policies.length ? <div className={styles.policyNotice}><div><ShieldCheck size={18} /><p><strong>Your first step: a company policy</strong>You can draft a request now. Activate a policy to compare providers.</p></div><Link href="/app/policies">Set up a policy <ArrowRight size={13} /></Link></div> : null}
        </div>}
        {pending ? <div className={styles.working} role="status"><span aria-hidden="true"><i /><i /><i /></span>Checking your request, policy and evidence…</div> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {!preview ? requestPanel : null}

      </div>
      <div className={styles.composerArea}>
        <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); ask(text); }}>
          <label className="sr-only" htmlFor="agent-message">Ask Railor</label>
          <textarea id="agent-message" ref={composer} rows={1} maxLength={2000} value={text} disabled={pending} onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(text); } }}
            placeholder={messages.length ? "Ask a follow-up, or describe another movement…" : "Ask anything about moving money…"} />
          <div className={styles.composerBottom}><span className={styles.composerScope}><ShieldCheck size={12} />{policies.find((policy) => policy.id === policyId)?.name ?? "Evidence-led assistance"}</span><button className={styles.send} type="submit" disabled={pending || !text.trim() || !historyLoaded} aria-label="Send request"><ArrowUp size={18} /></button></div>
        </form>
        <p className={styles.composerHint}><span>Enter to send · Shift + Enter for a new line</span><span>A decision is recorded only when you choose a provider.</span></p>
      </div>
    </section>
    {historyOpen ? <button type="button" className={styles.backdrop} aria-label="Close chat history" onClick={() => setHistoryOpen(false)} /> : null}
    <aside className={styles.history} data-open={historyOpen} ref={historyPanel} role={historyOpen ? "dialog" : undefined} aria-modal={historyOpen ? true : undefined} aria-label="Chat history" tabIndex={-1}>
      <div className={styles.historyHeading}><h2><History size={16} />Your chats</h2><span>{history.length}/{CHAT_HISTORY_LIMIT}</span><button className={`${styles.iconButton} ${styles.historyClose}`} type="button" onClick={() => setHistoryOpen(false)} aria-label="Close chat history"><X size={15} /></button></div>
      <button className={styles.newChat} type="button" disabled={pending} onClick={newChat}><Plus size={15} />New chat</button>
      <div className={styles.historyList}>{history.length ? history.map((chat) => <div className={styles.historyItem} data-active={chat.id === activeChat?.id} key={chat.id}>
        <button className={styles.openChat} type="button" disabled={pending} onClick={() => openChat(chat)} aria-current={chat.id === activeChat?.id ? "true" : undefined} title={chat.title}><strong>{chat.title}</strong><span>{new Date(chat.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {chat.messages.length} messages</span></button>
        <button className={styles.deleteChat} type="button" disabled={pending} onClick={() => deleteChat(chat.id)} aria-label={`Delete chat: ${chat.title}`} title="Delete chat"><Trash2 size={12} /></button>
      </div>) : <div className={styles.historyEmpty}><MessageSquare size={24} /><p>Your conversations will appear here.<br />Start with a question below.</p></div>}</div>
      <footer className={styles.historyFooter}><strong>We keep only your last 7 chats.</strong><p>{storageAvailable ? "Saved on this device, for this workspace. Older chats are automatically replaced." : "Browser storage is unavailable. History lasts for this page session only."}</p>
        {advancedTools ? <button className={styles.toolsButton} type="button" onClick={() => { setHistoryOpen(false); setToolsOpen(true); }}><SlidersHorizontal size={13} />Advanced tools</button> : null}
      </footer>
    </aside>
    {toolsOpen && advancedTools ? <><button className={styles.backdrop} type="button" onClick={() => setToolsOpen(false)} aria-label="Close advanced tools" /><div className={styles.toolsModal} ref={toolsPanel} role="dialog" aria-modal="true" aria-labelledby="agent-tools-title" tabIndex={-1}><header className={styles.toolsHeader}><h2 id="agent-tools-title">Advanced tools</h2><button className={styles.iconButton} type="button" onClick={() => setToolsOpen(false)} aria-label="Close advanced tools"><X size={18} /></button></header><div className={styles.toolsBody}>{advancedTools}</div></div></> : null}
  </div>;
}

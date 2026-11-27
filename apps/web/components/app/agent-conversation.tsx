"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, History, MessageSquare, Plus, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
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
import { AgentRequestCard } from "./agent-request-card";
import { AgentMessage, AgentWorking, CommandMenu } from "./agent-message";
import { AGENT_COMMANDS, EXAMPLE_PROMPTS, findCommand, matchCommands, needsPaymentFacts, smallTalk, type AgentCommand } from "../../lib/agent-commands";
import styles from "./agent-chat.module.css";

type DraftResult = ReturnType<typeof draftPaymentIntent>;
type SearchReply = { state: "needs_input" | "needs_confirmation" | "needs_policy" | "ready"; draft: DraftResult; preview: SearchPreviewResult | null };


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
  const [commandIndex, setCommandIndex] = useState(0);
  const [seenUpTo, setSeenUpTo] = useState(0);
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

  // While working, follow the bottom. When an answer lands, start it at the top
  // of the view, so a tall request card or result shows its first line, not its end.
  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    if (!messages.length) { element.scrollTop = 0; return; }
    if (pending) { element.scrollTop = element.scrollHeight; return; }
    const frame = requestAnimationFrame(() => {
      const answers = element.querySelectorAll<HTMLElement>('[data-role="agent"]');
      // A fresh request card is the thing to act on: start the view at its top.
      const card = !preview ? element.querySelector<HTMLElement>("section[aria-label='Your request']") : null;
      const last = card ?? answers[answers.length - 1];
      if (!last) { element.scrollTop = element.scrollHeight; return; }
      const top = last.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
      element.scrollTop = Math.max(0, top - 12);
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, pending, preview]);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    // Fit below the actual app header, including wrapped demo banners on mobile.
    // The real visible height (100dvh can disagree with it on phones while the
    // browser bar moves), so the chat fills the screen exactly and never scrolls the page.
    const fit = () => {
      const vv = window.visualViewport;
      element.style.setProperty("--agent-top", `${Math.round(element.getBoundingClientRect().top + window.scrollY)}px`);
      element.style.setProperty("--agent-vh", `${Math.round(vv?.height ?? window.innerHeight)}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
    };
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
  const commands = matchCommands(text);
  // Messages animate in once; restored chats and re-renders don't replay it.
  useEffect(() => {
    const last = messages.at(-1)?.id ?? 0;
    if (restored) { setSeenUpTo(last); return; }
    const timer = window.setTimeout(() => setSeenUpTo(last), 700);
    return () => window.clearTimeout(timer);
  }, [messages, restored]);
  const missing = intent ? [...missingIntentFields(intent), ...(!intent.destinationCurrency ? ["destination currency"] : []),
    ...(intent.sourceKind === "asset" && !intent.sourceNetwork ? ["source network"] : [])] : [];

  function receivePreview(next: SearchPreviewResult) {
    setPreview(next); setReviewOpen(false); setRestored(false);
    const relevant = next.candidates.filter((c) => c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed");
    const ruled = next.policyId !== "explore";
    setPreviewMessageId(add("agent", `I checked ${next.evidenceSummary.providersChecked} providers. ${relevant.length} ${relevant.length === 1 ? "has" : "have"} route evidence for this request${ruled ? `; ${next.permittedCandidates.length} passed your company rules` : " (no company rules applied)"}. ${next.bestCandidate ? `${next.bestCandidate.provider} ranks first for ${RANKING_PRESET_LABEL[next.intent.preference].toLowerCase()}.` : "Current evidence does not support a best option for this comparison yet."}`));
  }

  function searchDraft(nextPreference = preference, nextPolicyId = policyId, message?: string) {
    if (!intent || missing.length) return;
    setError(""); setPreview(null);
    if (message) add("user", message);
    start(async () => {
      try {
        const value = { ...intentFromDraft(intent), preference: nextPreference,
          ...(product ? { product } : {}),
          ...(method ? { paymentMethod: method } : {}),
        };
        // No company rules: the server compares against none, right here in the chat.
        const result = await controlCommand({ action: "search_preview", intent: value, ...(nextPolicyId ? { policyId: nextPolicyId } : {}) });
        if (!result.ok) setError(result.error ?? "Search failed. Please retry.");
        else receivePreview(result.data as SearchPreviewResult);
      } catch { setError("The connection dropped. Please try again."); }
    });
  }

  function say(question: string, answer: AgentAnswer) { add("user", question); add("agent", "", answer); }

  /** Slash commands act on the current chat; none of them invents a price or a decision. */
  function runCommand(command: AgentCommand | null, typed: string) {
    if (!command) { say(typed, { title: `I don’t know ${typed.split(/\s+/)[0]}`, lines: ["These are the commands I understand:"], reasonCodes: [], chips: AGENT_COMMANDS.slice(0, 8).map((item) => item.name) }); return; }
    if (command.kind === "new") { newChat(); return; }
    if (command.kind === "link") { router.push(command.href); return; }
    if (command.kind === "help") { say(typed, smallTalk("help")!); return; }
    if (command.kind === "edit") {
      if (intent) { setReviewOpen(true); return; }
      say(typed, needsPaymentFacts("what")); return;
    }
    if (command.kind === "preference") {
      setPreference(command.value);
      if (preview) { searchDraft(command.value, policyId, typed); return; }
      say(typed, intent
        ? { title: `Ranking by ${RANKING_PRESET_LABEL[command.value].toLowerCase()}`, lines: ["I’ll use this when you compare."], reasonCodes: [] }
        : { title: `I’ll rank by ${RANKING_PRESET_LABEL[command.value].toLowerCase()}`, lines: ["Now describe the payment."], reasonCodes: [], chips: EXAMPLE_PROMPTS });
      return;
    }
    if (command.kind !== "ask") return;
    if (!preview) { say(typed, { title: "Run a comparison first", lines: ["Describe a payment, compare providers, then I can explain the result."], reasonCodes: [], chips: EXAMPLE_PROMPTS }); return; }
    const answer = answerAgentQuestion(command.question, preview);
    if (answer) say(typed, answer);
  }

  function ask(raw: string) {
    const question = raw.trim();
    if (!question || pending) return;
    setText(""); setError(""); setCommandIndex(0);
    const command = findCommand(question);
    if (command !== undefined) { runCommand(command, question); return; }
    const talk = smallTalk(question);
    if (talk) { say(question, talk); return; }
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
        const facts = reply.draft.draft as Record<string, unknown>;
        // No amount, currency or destination at all: ask for them, rather than show a blank request.
        if (!intent && !facts.amount && !facts.sourceCurrency && !facts.sourceAsset && !facts.destinationCountry && !facts.destinationCurrency) {
          add("agent", "", needsPaymentFacts(question)); return;
        }
        setDraft(reply.draft); setIntent(draftFromPartial(reply.draft.draft, entityCountry));
        setProduct(typeof reply.draft.draft.product === "string" ? reply.draft.draft.product : "");
        setMethod(typeof reply.draft.draft.paymentMethod === "string" ? reply.draft.draft.paymentMethod : "");
        setPreference((reply.draft.draft.preference as RankingPreset) ?? "balanced");
        if (reply.preview) receivePreview(reply.preview);
        else {
          // Open the editor only when something is missing; otherwise the card is enough.
          setReviewOpen(reply.state === "needs_input");
          add("agent", reply.state === "needs_input" ? `Almost there. I still need the ${reply.draft.missing.map((field) => field.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")}.`
            : reply.state === "needs_confirmation" ? "Here’s what I understood. Check the destination, then compare."
            : "Here’s what I understood. Compare when you’re ready.");
        }
        if ((facts.sourceAsset === "USDT" || facts.sourceAsset === "USDC") && facts.destinationCurrency === "INR") {
          const query = new URLSearchParams({ mode: "stablecoin", asset: String(facts.sourceAsset), ...(facts.sourceNetwork ? { network: String(facts.sourceNetwork) } : {}), dest: "INR", ...(facts.amount ? { amount: String(facts.amount) } : {}) });
          add("agent", "", { title: `Selling ${String(facts.sourceAsset)} for INR?`, lines: ["Indian exchanges price this live, with the trading fee, GST, 1% TDS and income tax worked out."], reasonCodes: [], links: [{ label: "See live exchange prices", href: `/app/prices?${query}` }] });
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

  const editor = intent ? <fieldset disabled={pending}>
      <IntentBuilder value={intent} onChange={(next) => { setIntent(next); setPreview(null); }} options={options} detectedEntity={entityCountry} compact />
      {product || method ? <div className="agent-policy-controls mt-5 !px-0 !pb-0"><label>Product<select value={product} onChange={(event) => { setProduct(event.target.value); setPreview(null); }}><option value="">Not specified</option>{ProductType.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Payment method<select value={method} onChange={(event) => { setMethod(event.target.value); setPreview(null); }}><option value="">Not specified</option>{PaymentMethod.options.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div> : null}
      {draft?.notes.map((note) => <p className="mt-3 text-xs text-[var(--color-muted)]" key={note}>{note}</p>)}
    </fieldset> : null;
  const requestPanel = intent ? <AgentRequestCard intent={intent} options={options} missing={missing} pending={pending} editing={reviewOpen} onEditing={setReviewOpen} editor={editor}
      policies={policies} policyId={policyId} onPolicy={(next) => { setPolicyId(next); if (preview) searchDraft(preference, next, "Recheck with the selected company policy."); }}
      preference={preference} onPreference={(next) => { setPreference(next); if (preview) searchDraft(next, policyId, `Compare by ${RANKING_PRESET_LABEL[next].toLowerCase()}.`); }}
      onSearch={() => searchDraft()} hasResults={Boolean(preview)} /> : null;
  const comparison = preview ? <>{requestPanel}<InfrastructureResults preview={preview} canDecide={canDecide && preview.policyId !== "explore"} busy={pending} defaultEmail={defaultEmail} onSelect={decide} onExplain={explain} />
      <div className="agent-followups"><span>Keep exploring</span><button type="button" disabled={pending} onClick={() => ask("Why is there no best option?")}>Explain the recommendation</button><button type="button" disabled={pending} onClick={() => ask("What information is missing?")}>What’s missing?</button><button type="button" disabled={pending} onClick={() => ask("Compare by price")}>Compare by price</button></div></> : null;

  return <div className={styles.workspace} ref={workspace}>
    <section className={styles.conversation} aria-label="Conversation with Railor">
      <header className={styles.toolbar}>
        <div className={styles.identity}><RailorMark size={30} /><span>Railor Agent<small>Answers with sources</small></span></div>
        <div className={styles.toolbarActions}>
          {advancedTools ? <button className={styles.iconButton} type="button" onClick={() => setToolsOpen(true)} aria-label="Open advanced tools" title="Advanced tools"><SlidersHorizontal size={15} /></button> : null}
          <button className={styles.iconButton} type="button" disabled={pending} onClick={newChat} aria-label="Start a new chat" title="New chat"><Plus size={15} /><span>New chat</span></button>
          <button className={`${styles.iconButton} ${styles.mobileHistory}`} type="button" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" aria-expanded={historyOpen}><History size={16} /></button>
        </div>
      </header>
      <div className={styles.feed} ref={feed}>
        {messages.length ? <>
          {restored ? <div className={styles.savedNotice}><span>Saved conversation. Earlier answers may be out of date.</span>{intent && !missing.length ? <button type="button" disabled={pending} onClick={() => searchDraft(preference, policyId, "Refresh this comparison using current evidence.")}>Refresh comparison</button> : <span>Review the request below to run a fresh comparison.</span>}</div> : null}
          <div className={styles.messages} role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions">{messages.map((message) => <Fragment key={message.id}>
            <AgentMessage message={message} fresh={message.id > seenUpTo} disabled={pending} onChip={(chip) => ask(chip)} />
            {previewMessageId === message.id ? comparison : null}</Fragment>)}</div>
        </> : <div className={styles.welcome}>
          <div className={styles.welcomeMark} aria-hidden="true"><RailorMark size={54} /></div>
          <h1>Ask anything.</h1><p>Describe a payment in your own words. The agent checks providers and shows the reasons behind every answer.</p>
          <span className={styles.suggestionLabel}>Try one of these</span>
          <AgentStarters onChoose={(value) => { setText(value); composer.current?.focus(); }} />
          {!policies.length ? <div className={styles.policyNotice}><div><ShieldCheck size={18} /><p><strong>Start with your route</strong>Explore provider coverage now. Company rules are optional team setup.</p></div><Link href="/app/policies">Team rules <ArrowRight size={13} /></Link></div> : null}
        </div>}
        {pending ? <AgentWorking /> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {!preview ? requestPanel : null}

      </div>
      <div className={styles.composerArea}>
        {commands.length ? <CommandMenu commands={commands} active={Math.min(commandIndex, commands.length - 1)} onHover={setCommandIndex} onPick={(command) => ask(command.name)} /> : null}
        <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); ask(text); }}>
          <label className="sr-only" htmlFor="agent-message">Ask Railor</label>
          <textarea id="agent-message" ref={composer} rows={1} maxLength={2000} value={text} disabled={pending} onChange={(event) => setText(event.target.value)}
            role="combobox" aria-expanded={commands.length > 0} aria-controls="agent-commands" aria-autocomplete="list" aria-activedescendant={commands.length ? `agent-command-${Math.min(commandIndex, commands.length - 1)}` : undefined}
            onKeyDown={(event) => {
              if (commands.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setCommandIndex((index) => (index + (event.key === "ArrowDown" ? 1 : commands.length - 1)) % commands.length); return; }
              if (commands.length && event.key === "Tab") { event.preventDefault(); setText(commands[Math.min(commandIndex, commands.length - 1)]!.name); return; }
              if (commands.length && event.key === "Escape") { event.preventDefault(); setText(""); return; }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(commands.length ? commands[Math.min(commandIndex, commands.length - 1)]!.name : text); }
            }}
            placeholder={messages.length ? "Ask a follow-up…" : "Ask anything about moving money…"} />
          <div className={styles.composerBottom}><button type="button" className={styles.slashButton} onClick={() => { setText("/"); setCommandIndex(0); composer.current?.focus(); }} aria-label="Show commands" title="Commands">/</button><span className={styles.composerScope}><ShieldCheck size={12} />{policies.find((policy) => policy.id === policyId)?.name ?? "Answers with sources"}</span><button className={styles.send} type="submit" disabled={pending || !text.trim() || !historyLoaded} aria-label="Send request"><ArrowUp size={18} /></button></div>
        </form>
        <p className={styles.composerHint}><span>Enter to send · Shift + Enter for a new line · / for commands</span><span>A decision is recorded only when you choose a provider.</span></p>
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

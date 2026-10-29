"use client";

import { ArrowUpRight } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { CurrencyLogo } from "../marketing/currency-logo";
import styles from "./agent-chat.module.css";

const STARTERS = [
  { title: "Pay a supplier in Mexico", subtitle: "USDC to MXN · explore the route", from: "USDC", to: "MXN", tone: "brand", text: "I need to send $100k USDC on Base from our Singapore company to a Mexican supplier receiving MXN through SPEI. Reliability matters more than price." },
  { title: "Find a path to the UAE", subtitle: "INR to AED · compare providers", from: "INR", to: "AED", tone: "warm", text: "Our Indian company needs to send 25000 INR to a supplier in UAE receiving AED. Compare the available paths." },
  { title: "Explore a euro payout", subtitle: "USD to EUR · see the options", from: "USD", to: "EUR", tone: "paper", text: "Our Singapore company needs to send 50000 USD to Germany, receiving EUR. Show the best overall options." },
];

function CurrencyMark({ symbol }: { symbol: string }) {
  const country = currencyFlagCode(symbol);
  return country ? <Flag code={country} size={30} round /> : <CurrencyLogo symbol={symbol} size={30} />;
}

export function AgentStarters({ onChoose }: { onChoose: (text: string) => void }) {
  return <div className={styles.starters} aria-label="Suggested questions">
    {STARTERS.map((starter, index) => <button type="button" key={starter.title} className={styles.starter} data-tone={starter.tone} onClick={() => onChoose(starter.text)}>
      <div className={styles.starterArt} aria-hidden="true">
        <svg viewBox="0 0 240 95" fill="none"><circle cx="120" cy="48" r="36" /><ellipse cx="120" cy="48" rx="16" ry="36" /><path d="M85 48H155M90 30H150M90 66H150" /><path d="M30 59C64 59 65 35 105 35S165 59 210 59" className={styles.artRoute} /><path d="M30 59C64 59 65 35 105 35S165 59 210 59" pathLength="100" className={styles.artSignal} style={{ animationDelay: `${index * 1.2}s` }} /></svg>
        <span className={styles.fromMark}><CurrencyMark symbol={starter.from} /></span><span className={styles.toMark}><CurrencyMark symbol={starter.to} /></span>
        <span className={styles.artLabels}>{starter.from}<span>→</span>{starter.to}</span>
      </div>
      <span className={styles.starterContent}><strong>{starter.title}</strong><span>{starter.subtitle}</span><ArrowUpRight size={16} aria-hidden="true" /></span>
    </button>)}
  </div>;
}

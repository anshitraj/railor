import Link from "next/link";
import { RouteSticker, SealSticker, TicketSticker } from "../die-cut-stickers";
import { ArrowRight, Bot, Check, Code2, Package } from "lucide-react";
import { DeveloperDemo } from "./developer-demo";
import { LoopOnView } from "./loop-on-view";
import { MobileCardSlider } from "./mobile-card-slider";
import { TrustBases } from "./trust-basis";
import styles from "./home.module.css";

const AUDIENCES = [
  {
    title: "Personal",
    line: "Sending money to family or yourself abroad.",
    points: ["See exactly what your family receives", "Apps and banks compared side by side", "Know when the money will arrive"],
    cta: "Compare personal transfers",
    href: "/prices?from=USD&to=INR&amount=1000&market=1&profile=personal&country=IN&direction=receive&purpose=personal",
    coins: [{ symbol: "$", metal: "gold", size: 92, left: "16%", top: "26%", tilt: -12 }, { symbol: "₹", metal: "silver", size: 74, left: "52%", top: "40%", tilt: 10 }, { symbol: "£", metal: "bronze", size: 54, left: "70%", top: "14%", tilt: -6 }],
  },
  {
    title: "Freelancers",
    line: "Getting paid by clients in other countries.",
    points: ["Services that accept your client’s currency", "Fees you can check before you invoice", "Invoices and receipts in one place"],
    cta: "Compare ways to get paid",
    href: "/prices?from=USD&to=INR&amount=1000&market=1&profile=freelancer&country=IN&direction=receive&purpose=services",
    coins: [{ symbol: "€", metal: "silver", size: 88, left: "20%", top: "30%", tilt: 8 }, { symbol: "$", metal: "gold", size: 70, left: "55%", top: "18%", tilt: -10 }, { symbol: "₹", metal: "bronze", size: 58, left: "64%", top: "54%", tilt: 14 }],
  },
  {
    title: "Businesses",
    line: "Paying suppliers and collecting from customers.",
    points: ["Providers that serve your type of company", "Company rules for routes and limits", "Alerts when fees or coverage change"],
    cta: "Set up a business workspace",
    href: "/login?intent=start",
    coins: [{ symbol: "¥", metal: "bronze", size: 64, left: "14%", top: "18%", tilt: -14 }, { symbol: "$", metal: "gold", size: 96, left: "40%", top: "32%", tilt: 6 }, { symbol: "€", metal: "silver", size: 62, left: "72%", top: "22%", tilt: -8 }],
  },
] as const;

export function AudiencesSection() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="audience-title">
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Made for you</p>
            <h2 id="audience-title" className={styles.title}>One app. Three ways to use it.</h2>
          </div>
          <p className={styles.lead}>Compare providers for a family transfer, a client payment, or a supplier payout.</p>
        </div>
        <MobileCardSlider mode="profiles" label="Transfer profiles" labels={AUDIENCES.map(audience => audience.title)}>
          {AUDIENCES.map((audience) => (
            <li key={audience.title} className={styles.audience}>
              <LoopOnView className={styles.audienceArt}>
                <div className={styles.audienceCoins} aria-hidden="true">
                  {audience.coins.map((coin) => (
                    <span key={coin.symbol} className="coin" data-metal={coin.metal} style={{ "--size": `${coin.size}px`, left: coin.left, top: coin.top, rotate: `${coin.tilt}deg` } as React.CSSProperties}>{coin.symbol}</span>
                  ))}
                </div>
              </LoopOnView>
              <div className={styles.audienceBody}>
                <h3>{audience.title}</h3>
                <p>{audience.line}</p>
                <ul className={styles.checks}>
                  {audience.points.map((point) => <li key={point}><Check size={16} aria-hidden />{point}</li>)}
                </ul>
                <Link href={audience.href} className={styles.textLink}>{audience.cta}<ArrowRight size={16} aria-hidden /></Link>
              </div>
            </li>
          ))}
        </MobileCardSlider>
      </div>
    </section>
  );
}

export function DevelopersSection() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="dev-title">
      <div className={styles.container}>
        <div className={styles.dev}>
          <div>
            <p className={styles.eyebrow}>For developers</p>
            <h2 id="dev-title" className={styles.title}>The same prices, by API.</h2>
            <p className={styles.lead}>Get prices, fees, and the source behind each quote in one request.</p>
            <ul className={styles.devList}>
              <li><span><Code2 size={15} aria-hidden /></span>REST API with a free test key</li>
              <li><span><Package size={15} aria-hidden /></span>Node.js and Python SDKs</li>
              <li><span><Bot size={15} aria-hidden /></span>MCP server for Claude, Cursor and Codex</li>
            </ul>
            <div className={styles.devActions}>
              <Link href={`/login?intent=start&next=${encodeURIComponent("/app/developers")}`} className={`${styles.btn} ${styles.btnPrimary} press`}>Get an API key<ArrowRight size={17} aria-hidden /></Link>
              <Link href="/docs" className={`${styles.btn} ${styles.btnSecondary} press`}>Read the docs</Link>
            </div>
          </div>
          <div className={styles.devCode}>
            <DeveloperDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustSection() {
  return (
    <section className={styles.section} aria-labelledby="trust-title">
      <div className={styles.container}>
        <div className={styles.trust}>
          <div>
            <p className={styles.eyebrow}>Every number, explained</p>
            <h2 id="trust-title" className={styles.title}>No mystery prices.</h2>
            <p className={styles.lead}>Each price carries a label that says where it came from and how fresh it is. If Railor can’t confirm something, it says so instead of guessing.</p>
            <div style={{ marginTop: 28 }}>
              <Link href="/company/trust" className={styles.textLink}>How Railor checks prices<ArrowRight size={16} aria-hidden /></Link>
            </div>
          </div>
          <TrustBases />
        </div>
      </div>
    </section>
  );
}

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  { q: "Is Railor free?", a: <>Yes. Prices are free to see with a free Railor account — no card needed. Your workspace also includes up to 3 saved routes, a monitored route and 500 API requests a month.</> },
  { q: "Does Railor send the money?", a: <>No. Railor never holds your money — you send with the provider you choose, and Railor shows you which option is best and why.</> },
  { q: "Where do the prices come from?", a: <>Live public quotes from providers, their published fee schedules, and dated consumer estimates from comparison feeds. Each price is labelled with its source. <Link href="/docs/pricing#sources">Read how prices work</Link>.</> },
  { q: "How fresh are the prices?", a: <>The calculator refreshes every 30 seconds while you have it open, and every price shows when it was checked.</> },
  { q: "Why don’t I see a provider I know?", a: <>Some services only serve businesses, freelancers or certain countries. Railor hides prices your profile can’t use and tells you how many were hidden and why.</> },
  { q: "Can I use Railor from my own app or AI tool?", a: <>Yes. Create a free workspace to get a test API key. There are TypeScript and Python SDKs and an MCP server for AI tools. <Link href="/docs">See the docs</Link>.</> },
  { q: "What happens to my data?", a: <>Signing up needs only your email. Workspace data stays in your workspace and is never sold. <Link href="/legal/privacy">Privacy policy</Link>.</> },
];

export function FaqSection() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="faq-title">
      <div className={styles.container}>
        <div className={styles.faq}>
          <div>
            <p className={styles.eyebrow}>FAQ</p>
            <h2 id="faq-title" className={styles.title}>Questions, answered.</h2>
            <p className={styles.lead}>Still unsure? Start comparing — it’s free and takes seconds.</p>
          </div>
          <div className={styles.faqList}>
            {FAQS.map((item, index) => (
              <details key={item.q} className={styles.faqItem} open={index === 0}>
                <summary>{item.q}<span className={styles.faqIcon} aria-hidden /></summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={styles.section} aria-labelledby="final-title">
      <div className={styles.container}>
        <div className={styles.final}>
          <div className={styles.finalCoins} aria-hidden>
            <span className="coin" data-metal="gold">$</span>
            <span className="coin" data-metal="silver">€</span>
            <span className="coin" data-metal="bronze">₹</span>
            <span className="coin" data-metal="gold">£</span>
          </div>
          <div className={styles.finalStickers} aria-hidden="true">
            <SealSticker word="FREE" line="always" size={70} tilt={-10} />
            <RouteSticker from="US" to="IN" tilt={6} delay={0.12} />
            <TicketSticker label="Every price" text="Source shown" tilt={-4} delay={0.24} />
          </div>
          <h2 id="final-title">Check before you send.</h2>
          <p>Enter two currencies and an amount to compare public prices.</p>
          <div className={styles.heroActions} style={{ marginTop: 6, justifyContent: "center", animation: "none" }}>
            <Link href="/#calculator" className={`${styles.btn} ${styles.btnPrimary} press`}>Compare prices now<ArrowRight size={17} aria-hidden /></Link>
            <Link href="/login?intent=start" className={`${styles.btn} ${styles.btnSecondary} press`}>Create a free account</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

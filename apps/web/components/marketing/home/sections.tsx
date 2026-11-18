import Link from "next/link";
import { ArrowRight, Bot, Check, Code2, Package } from "lucide-react";
import { CodeSample } from "@railor/ui";
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
          <p className={styles.lead}>Railor only shows prices you can actually use — so a family transfer, a client payment and a supplier payout each get the right answer.</p>
        </div>
        <ul className={styles.audiences}>
          {AUDIENCES.map((audience) => (
            <li key={audience.title} className={styles.audience}>
              <div className={styles.audienceArt} aria-hidden>
                {audience.coins.map((coin, index) => (
                  <span key={index} className="coin" data-metal={coin.metal} style={{ "--size": `${coin.size}px`, left: coin.left, top: coin.top, rotate: `${coin.tilt}deg` } as React.CSSProperties}>{coin.symbol}</span>
                ))}
              </div>
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
        </ul>
      </div>
    </section>
  );
}

export function DevelopersSection({ baseUrl }: { baseUrl: string }) {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} aria-labelledby="dev-title">
      <div className={styles.container}>
        <div className={styles.dev}>
          <div>
            <p className={styles.eyebrow}>For developers</p>
            <h2 id="dev-title" className={styles.title}>The same prices, by API.</h2>
            <p className={styles.lead}>Every price Railor shows is one request away, with its source and basis attached.</p>
            <ul className={styles.devList}>
              <li><span><Code2 size={15} aria-hidden /></span>REST API with a free test key</li>
              <li><span><Package size={15} aria-hidden /></span>TypeScript and Python SDKs</li>
              <li><span><Bot size={15} aria-hidden /></span>MCP server for Claude, Cursor and Codex</li>
            </ul>
            <div className={styles.devActions}>
              <Link href={`/login?intent=start&next=${encodeURIComponent("/app/developers")}`} className={`${styles.btn} ${styles.btnPrimary} press`}>Get an API key<ArrowRight size={17} aria-hidden /></Link>
              <Link href="/docs" className={`${styles.btn} ${styles.btnSecondary} press`}>Read the docs</Link>
            </div>
          </div>
          <div className={styles.devCode}>
            <CodeSample
              variants={[
                {
                  language: "ts",
                  label: "TypeScript",
                  code: `import { Railor } from "@railor/sdk";

const railor = new Railor({ apiKey: "RAILOR_API_KEY" });

const prices = await railor.prices.check({
  sourceCurrency: "USD",
  destinationCurrency: "INR",
  amount: 1000,
  context: {
    profile: "freelancer",
    country: "IN",
    direction: "receive",
    purpose: "services",
  },
});

// Ranked by what arrives; each row says where its number came from.
console.log(prices.data[0]);`,
                },
                {
                  language: "curl",
                  label: "cURL",
                  code: `curl ${baseUrl}/v1/prices \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "source_currency": "USD", "destination_currency": "INR", "amount": 1000 }'`,
                },
                {
                  language: "python",
                  label: "Python",
                  code: `from railor import Railor

railor = Railor(api_key="RAILOR_API_KEY")

prices = railor.prices.check(
    source_currency="USD",
    destination_currency="INR",
    amount=1000,
)
print(prices["data"][0])`,
                },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const BASES = [
  { label: "Your account", tone: "green", title: "A quote from your own account", body: "When you connect a provider, Railor shows the exact price it gives you." },
  { label: "Public quote", tone: "sky", title: "A live public quote", body: "Taken from the provider’s own public pricing a few seconds ago." },
  { label: "Published fees", tone: "gold", title: "The provider’s fee schedule", body: "Their published fees applied at today’s mid-market rate." },
  { label: "Estimate", tone: "ink", title: "A dated estimate", body: "Consumer prices collected from comparison feeds, with the date shown." },
] as const;

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
          <ul className={styles.basisGrid}>
            {BASES.map((basis, index) => (
              <li key={basis.label} className={styles.basis}>
                <span className="sticker" data-tone={basis.tone} style={{ "--tilt": `${index % 2 ? 3 : -3}deg` } as React.CSSProperties}>{basis.label}</span>
                <div>
                  <h3>{basis.title}</h3>
                  <p>{basis.body}</p>
                </div>
              </li>
            ))}
          </ul>
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
            <span className="coin" data-metal="gold" style={{ "--size": "92px", left: "6%", top: "18%", rotate: "-14deg" } as React.CSSProperties}>$</span>
            <span className="coin" data-metal="silver" style={{ "--size": "66px", left: "12%", bottom: "14%", rotate: "10deg" } as React.CSSProperties}>€</span>
            <span className="coin" data-metal="bronze" style={{ "--size": "72px", right: "8%", top: "16%", rotate: "12deg" } as React.CSSProperties}>₹</span>
            <span className="coin" data-metal="gold" style={{ "--size": "58px", right: "14%", bottom: "16%", rotate: "-8deg" } as React.CSSProperties}>£</span>
          </div>
          <h2 id="final-title">Check before you send.</h2>
          <p>Two currencies and an amount is all it takes. Sign in free and every price is yours.</p>
          <div className={styles.heroActions} style={{ marginTop: 6, justifyContent: "center", animation: "none" }}>
            <Link href="/#calculator" className={`${styles.btn} ${styles.btnPrimary} press`}>Compare prices now<ArrowRight size={17} aria-hidden /></Link>
            <Link href="/login?intent=start" className={`${styles.btn} ${styles.btnSecondary} press`}>Create a free account</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

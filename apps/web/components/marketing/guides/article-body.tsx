import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { linkForViewer } from "../../../lib/guides/destinations";
import type { Block, GuideContent } from "../../../lib/guides/content";
import styles from "./guides.module.css";

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]*\))/g;
const LINK = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/;

/** Text with **bold** and [internal links](/path); nothing else, so a guide can never inject markup. */
export function RichText({ text, signedIn }: { text: string; signedIn: boolean }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        const link = LINK.exec(part);
        if (link) return <Link key={index} href={linkForViewer(link[2]!, signedIn)}>{link[1]}</Link>;
        return part;
      })}
    </>
  );
}

function BlockView({ block, signedIn }: { block: Block; signedIn: boolean }) {
  if (block.type === "p") return <p><RichText text={block.text} signedIn={signedIn} /></p>;
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag>{block.items.map((item) => <li key={item}><RichText text={item} signedIn={signedIn} /></li>)}</Tag>;
  }
  if (block.type === "callout") {
    return (
      <div className={styles.callout} data-tone={block.tone} role="note">
        <strong>{block.title}</strong>
        <RichText text={block.text} signedIn={signedIn} />
      </div>
    );
  }
  return (
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={block.caption ?? "Table"}>
      <table className={styles.table}>
        {block.caption ? <caption>{block.caption}</caption> : null}
        <thead><tr>{block.head.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArticleSections({ content, signedIn, beforeSections }: { content: GuideContent; signedIn: boolean; beforeSections?: React.ReactNode }) {
  return (
    <div className={styles.prose}>
      <p className={styles.lede}><RichText text={content.intro} signedIn={signedIn} /></p>
      {beforeSections}
      {content.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.id}>
          <h2 id={section.id}>{section.heading}</h2>
          {section.blocks.map((block, index) => <BlockView key={index} block={block} signedIn={signedIn} />)}
        </section>
      ))}
    </div>
  );
}

export function ArticleFaq({ faq, signedIn }: { faq: GuideContent["faq"]; signedIn: boolean }) {
  return (
    <section className={styles.faq} aria-labelledby="faq-title">
      <h2 id="faq-title">Common questions</h2>
      {faq.map((item) => (
        <details key={item.q}>
          <summary>{item.q}<ChevronDown size={18} aria-hidden /></summary>
          <p><RichText text={item.a} signedIn={signedIn} /></p>
        </details>
      ))}
    </section>
  );
}

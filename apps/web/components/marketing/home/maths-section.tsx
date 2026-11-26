import type { RemittanceCostBenchmarks } from "@railor/core";
import { DoTheMaths } from "./do-the-maths";
import home from "./home.module.css";

/** "Do the maths": what a bank, a transfer app and the cheapest option would take from your monthly transfers. */
export function MathsSection({ benchmarks }: { benchmarks: RemittanceCostBenchmarks }) {
  return (
    <section className={home.section} aria-labelledby="maths-title">
      <div className={home.container}>
        <div className={home.head} style={{ justifyItems: "center", textAlign: "center" }}>
          <div>
            <h2 id="maths-title" className={home.title}>Do the maths.</h2>
          </div>
          <p className={home.lead} style={{ marginInline: "auto" }}>Banks hide most of their cost in the exchange rate. Slide to what you send abroad each month and see what it adds up to.</p>
        </div>
        <DoTheMaths benchmarks={benchmarks} />
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, ArrowRight, Building2, Globe2, LoaderCircle, Scale } from "lucide-react";
import { Flag, type PickerOption } from "@railor/ui";
import { compareRoute } from "../../app/app/compare/actions";
import type { RouteComparison, RouteComparisonRequest } from "../../lib/route-comparison-model";
import { ProviderLogo } from "./provider-logo";
import { RouteOptionPicker } from "./route-option-picker";
import { RouteComparisonResults } from "./route-comparison-results";
import styles from "./route-comparison.module.css";

type Draft = RouteComparisonRequest;
type ProviderChoice = PickerOption & { category: string };

export function RouteComparisonBoard({ providers, countries, initialProviders, initialCountry }: {
  providers: ProviderChoice[];
  countries: PickerOption[];
  initialProviders: [string, string];
  initialCountry: string;
}) {
  const [draft, setDraft] = useState<Draft>({ providers: initialProviders, from: initialCountry, to: "", customerType: "business" });
  const [comparison, setComparison] = useState<RouteComparison | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const result = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const ready = Boolean(draft.from && draft.to && draft.providers[0] && draft.providers[1] && draft.providers[0] !== draft.providers[1]);

  useEffect(() => {
    if (!comparison) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    result.current?.scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" });
    result.current?.focus({ preventScroll: true });
  }, [comparison]);

  function update(next: Partial<Draft>) {
    setDraft(value => ({ ...value, ...next }));
    setComparison(null);
    setError("");
  }

  function chooseProvider(index: number, slug: string) {
    const values = [...draft.providers] as Draft["providers"];
    values[index] = slug;
    update({ providers: values });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setComparison(null);
    try {
      const checked = await compareRoute(draft);
      if (checked.ok) setComparison(checked.result);
      else setError(checked.error);
    } catch {
      setError("Could not complete the comparison. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className={styles.page} aria-labelledby="compare-providers-title">
      <header className={styles.pageHeader}>
        <h1 id="compare-providers-title">Compare providers</h1>
        <p>Choose a route and two providers. See who can serve it, what onboarding takes, and which costs you’ll need to confirm.</p>
      </header>

      <form className={styles.setup} onSubmit={submit} aria-busy={pending}>
        <fieldset disabled={pending}>
          <div className={styles.routeSetup}>
            <div className={styles.routeHeader}>
              <h2><Globe2 size={17} aria-hidden /> Your route</h2>
              <label className={styles.profile}>
                <span>Account type</span>
                <select value={draft.customerType} onChange={event => update({ customerType: event.target.value === "individual" ? "individual" : "business" })}>
                  <option value="business">Business</option>
                  <option value="individual">Personal</option>
                </select>
              </label>
            </div>
            <div className={styles.countries}>
              <div><span>From country</span><RouteOptionPicker label="From country" options={countries} value={draft.from} menuWidth={280} placeholder="Choose country" onChange={from => update({ from })} renderMark={code => <Flag code={code} size={19} round />} /></div>
              <button type="button" className={styles.swap} aria-label="Swap countries" onClick={() => update({ from: draft.to, to: draft.from })}><ArrowLeftRight size={18} /></button>
              <div><span>To country</span><RouteOptionPicker label="To country" options={countries} value={draft.to} menuWidth={280} placeholder="Choose country" onChange={to => update({ to })} renderMark={code => <Flag code={code} size={19} round />} /></div>
            </div>
            <div className={styles.routeFoot}>
              <label className={styles.profile}><span>Payment type</span>
                <select value={draft.product ?? ""} onChange={event => update({ product: (event.target.value || undefined) as Draft["product"] })}>
                  <option value="">Any transfer product</option>
                  <option value="payout">Payout</option>
                  <option value="collection">Collection</option>
                  <option value="off_ramp">Stablecoin cash-out</option>
                </select>
              </label>
              {draft.customerType === "business" ? <p>From is your registration and funding country.</p> : null}
            </div>
          </div>

          <div className={styles.slots}>
            {draft.providers.map((slug, index) => {
              const provider = providers.find(option => option.value === slug);
              const label = index === 0 ? "First provider" : "Second provider";
              return <div className={styles.slot} key={label} data-selected={Boolean(provider)}>
                <span className={styles.slotMark}>{provider ? <ProviderLogo slug={provider.value} name={provider.label} size={39} loading="eager" /> : <Building2 size={21} aria-hidden />}</span>
                <div className={styles.slotContent}>
                  <h2>{label}</h2>
                  <RouteOptionPicker label={label} options={providers.filter(item => item.value !== draft.providers[1 - index])} value={slug} menuWidth={300} showCode={false} placeholder="Choose provider" onChange={value => chooseProvider(index, value)} renderMark={value => <ProviderLogo slug={value} name={providers.find(item => item.value === value)?.label ?? value} size={22} />} />
                  {provider ? <p>{provider.category}</p> : null}
                </div>
              </div>;
            })}
          </div>
        </fieldset>

        <div className={styles.runRow}>
          <p>{ready ? "Checks coverage, verification requirements, timing and fees for this route." : "Choose both countries and providers to compare."}</p>
          <button className={styles.run} type="submit" disabled={!ready || pending} data-loading={pending}>
            {pending ? <LoaderCircle size={17} aria-hidden /> : <Scale size={17} aria-hidden />}
            {pending ? "Checking providers…" : "Compare providers"}
            {!pending ? <ArrowRight size={16} aria-hidden /> : null}
          </button>
        </div>
      </form>

      {pending ? <div className={styles.progress} role="status">
        <span className={styles.progressTrack} aria-hidden />
        <span><strong>Checking your route</strong><small>Looking up provider coverage and source evidence.</small></span>
      </div> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {comparison ? <div ref={result} tabIndex={-1} className={styles.resultsAnchor}><RouteComparisonResults comparison={comparison} shareable /></div> : null}
    </section>
  );
}

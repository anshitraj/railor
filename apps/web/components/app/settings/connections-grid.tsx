"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Clock, Plus } from "lucide-react";
import { ProviderLogo } from "../provider-logo";
import { toast } from "../../toast";
import styles from "./settings.module.css";

/**
 * Accounts people will be able to connect with a sign-in ("Continue with
 * Wise"), so Railor can show their own balances and exact quotes. None is
 * live yet: tapping + says so, rather than pretending.
 */
const APPS = [
  { slug: "wise", name: "Wise", what: "Balances and your own transfer quotes" },
  { slug: "revolut", name: "Revolut Business", what: "Accounts, FX and payouts" },
  { slug: "airwallex", name: "Airwallex", what: "Global accounts and transfers" },
  { slug: "payoneer", name: "Payoneer", what: "Receiving accounts and withdrawals" },
  { slug: "paypal", name: "PayPal", what: "Balances and payouts" },
  { slug: "stripe", name: "Stripe", what: "Payouts and balances" },
  { slug: "mercury", name: "Mercury", what: "Business banking and wires" },
  { slug: "razorpay", name: "Razorpay", what: "International collections in INR" },
  { slug: "coinbase", name: "Coinbase", what: "USDC balances and transfers" },
  { slug: "nium", name: "Nium", what: "Payouts and virtual accounts" },
];

export function ConnectionsGrid() {
  const reduce = useReducedMotion();
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <ul className={styles.apps}>
      {APPS.map((app) => (
        <li key={app.slug} className={styles.app}>
          <ProviderLogo slug={app.slug} name={app.name} size={36} />
          <span className={styles.appText}><strong>{app.name}</strong><small>{app.what}</small></span>
          <AnimatePresence mode="wait" initial={false}>
            {asked === app.slug ? (
              <motion.span key="soon" className={styles.appSoon} initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}>
                <Clock size={13} aria-hidden />Coming soon
              </motion.span>
            ) : (
              <motion.button key="add" type="button" className={styles.appAdd} aria-label={`Connect ${app.name}`} title={`Connect ${app.name}`}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}
                onClick={() => { setAsked(app.slug); toast(`${app.name} is coming soon`, "Connecting your own account isn’t live yet. Prices stay free to compare meanwhile."); }}>
                <Plus size={16} aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>
        </li>
      ))}
    </ul>
  );
}

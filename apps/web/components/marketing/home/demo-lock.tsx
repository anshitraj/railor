import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./home.module.css";

/** Open the public converter from a landing-page example. */
export function DemoLock() {
  return (
    <Link href="/prices" className={styles.demoLock}>
      <ArrowRight size={13} aria-hidden />Check prices
    </Link>
  );
}

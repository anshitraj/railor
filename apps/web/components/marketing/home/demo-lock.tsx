import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import styles from "./home.module.css";

/** Over a blurred example price: the same rule as the calculator, prices need a free account. */
export function DemoLock() {
  return (
    <Link href="/login?intent=start&next=%2Fapp%2Fprices" className={styles.demoLock}>
      <LockKeyhole size={13} aria-hidden />Sign in to see the full price
    </Link>
  );
}

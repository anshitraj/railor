"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RailorMark } from "../../brand";
import styles from "./home.module.css";

/**
 * Phones only: once the calculator has scrolled away, a small glass bar slides
 * up so comparing is always one tap away. It steps aside for the closing call
 * to action and the footer, which already say the same thing.
 */
export function MobileCompareBar({ providerCount }: { providerCount: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const calculator = document.getElementById("calculator");
    if (!calculator || !("IntersectionObserver" in window)) return;
    const ends = [document.querySelector('[aria-labelledby="final-title"]'), document.querySelector("footer")].filter((node): node is Element => Boolean(node));
    let past = false;
    const blocking = new Set<Element>();
    const update = () => setShow(past && blocking.size === 0);
    const hero = new IntersectionObserver(([entry]) => {
      past = Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 0);
      update();
    });
    const end = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) blocking.add(entry.target);
        else blocking.delete(entry.target);
      }
      update();
    });
    hero.observe(calculator);
    ends.forEach((node) => end.observe(node));
    return () => {
      hero.disconnect();
      end.disconnect();
    };
  }, []);

  return (
    <div className={styles.compareBar} data-show={show || undefined} inert={!show || undefined}>
      <Link href="/prices" className={`${styles.compareBarLink} press`}>
        <span className={styles.compareBarMark}><RailorMark size={22} /></span>
        <span className={styles.compareBarText}>
          <strong>Compare prices</strong>
          <small>{providerCount > 0 ? `${providerCount.toLocaleString("en-US")} providers · free` : "Free · no account needed"}</small>
        </span>
        <span className={styles.compareBarGo}>Compare<ArrowRight size={15} aria-hidden /></span>
      </Link>
    </div>
  );
}

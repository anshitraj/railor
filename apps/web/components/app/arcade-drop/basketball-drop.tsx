"use client";

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { BACKBOARD, FLIGHT_MS, MISS_MS, NET_DELAY_MS, NET_SWISH, REACH, RIM, RIM_CLANG, SCENE, SETTLE_MS, START, ZONE, arcDots, flightKeyframes, missKeyframes, netPaths } from "./shot-path";
import styles from "./basketball-drop.module.css";

type Phase = "idle" | "flying" | "made" | "missed";

export interface BasketballDropProps {
  /** Card heading, e.g. "Send your payroll sheet". */
  title: string;
  subtitle?: string;
  /** Inside the dashed area. */
  dropText: string;
  dropHint?: string;
  /** The file input's `accept` list. */
  accept: string;
  inputLabel: string;
  disabled?: boolean;
  /** Reading the file: the card dims and says so instead of taking another shot. */
  busy?: boolean;
  busyText?: string;
  /** A file the page can't use misses the hoop; the page still hears about it and says why. */
  rejects?: (file: File) => boolean;
  onFile: (file: File) => void;
  children?: ReactNode;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A drop zone you score with: drop a file, or tap the paper, and it flies in an
 * arc through the hoop, the net swings and the "Sent" count ticks up. Files the
 * page can't use hit the rim and bounce off. The file is handed to the page
 * when the shot lands, so the page never swaps the zone out mid-flight.
 * With reduced motion there is no flight: the hoop lights up and the file is
 * handed over straight away.
 */
export function BasketballDrop({ title, subtitle, dropText, dropHint, accept, inputLabel, disabled = false, busy = false, busyText = "Reading…", rejects, onFile, children }: BasketballDropProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLButtonElement>(null);
  const sprite = useRef<SVGGElement>(null);
  const net = useRef<SVGGElement>(null);
  const rim = useRef<SVGGElement>(null);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [sent, setSent] = useState(0);
  const [live, setLive] = useState(true);
  const dots = useMemo(() => arcDots(12), []);
  const { mesh, rings } = useMemo(netPaths, []);
  const locked = disabled || busy;

  // The idle loops only run while the card is on screen.
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(([entry]) => setLive(Boolean(entry?.isIntersecting)), { threshold: 0.1 });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => () => { for (const timer of timers.current) window.clearTimeout(timer); }, []);

  const later = (run: () => void, ms: number) => { timers.current.push(window.setTimeout(run, ms)); };
  const enter = (next: Phase) => { phaseRef.current = next; setPhase(next); };

  function shoot(file: File) {
    if (locked || phaseRef.current !== "idle") return;
    const miss = rejects?.(file) ?? false;
    const settle = (made: boolean) => {
      enter("idle");
      if (made) setSent((count) => count + 1);
      onFile(file);
    };
    if (reducedMotion() || !sprite.current || typeof sprite.current.animate !== "function") {
      enter(miss ? "missed" : "made");
      later(() => settle(!miss), 220);
      return;
    }
    enter("flying");
    const total = miss ? MISS_MS : FLIGHT_MS;
    const flight = sprite.current.animate(miss ? missKeyframes() : flightKeyframes(), { duration: total, easing: "linear", fill: "forwards" });
    if (miss) {
      rim.current?.animate(RIM_CLANG, { duration: 520, delay: Math.round(total * 0.5) - 30, easing: "ease-out" });
      later(() => enter("missed"), Math.round(total * 0.5));
    } else {
      net.current?.animate(NET_SWISH, { duration: 760, delay: NET_DELAY_MS, easing: "ease-out" });
      later(() => enter("made"), Math.round(total * REACH));
    }
    later(() => { flight.cancel(); settle(!miss); }, total + SETTLE_MS);
  }

  const files = (event: DragEvent) => event.dataTransfer?.types?.includes("Files");
  const onDragOver = (event: DragEvent) => {
    if (!files(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!locked) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!files(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) shoot(file);
  };

  const glow = `${id}-glow`;
  const label = busy ? busyText : phase === "flying" ? "Taking the shot…" : phase === "missed" ? "Off the rim" : dragging ? "Release to shoot" : dropText;

  return (
    <div className={styles.card} data-live={live} data-phase={phase}>
      <div className={styles.head}>
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className={styles.sent} aria-label={`${sent} sent`}>Sent <b key={sent} data-pop={sent > 0 || undefined}>{sent}</b></span>
      </div>

      <input ref={input} className="sr-only" type="file" accept={accept} aria-label={inputLabel} disabled={locked} tabIndex={-1}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) shoot(file); }} />
      <button ref={stage} type="button" className={styles.stage} data-press="off" disabled={locked} data-dragging={dragging || undefined} aria-busy={busy || undefined}
        aria-label={`${dropText}${dropHint ? `. ${dropHint}` : ""}`}
        onClick={() => input.current?.click()} onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <span className={styles.copy}>
          {busy ? <Loader2 size={18} className={styles.spin} aria-hidden /> : <Upload size={18} aria-hidden />}
          <strong>{label}</strong>
          {dropHint ? <small>{dropHint}</small> : null}
        </span>

        <svg className={styles.scene} viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} aria-hidden focusable="false">
          <defs>
            <filter id={glow} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="4.5" /></filter>
          </defs>
          <rect className={styles.zone} x={ZONE.x} y={ZONE.y} width={ZONE.width} height={ZONE.height} rx={ZONE.radius} />

          <rect className={styles.board} x={BACKBOARD.x} y={BACKBOARD.y} width={BACKBOARD.width} height={BACKBOARD.height} rx="3" />
          <rect className={styles.target} x="152" y="146" width="56" height="38" rx="1.5" />
          <rect className={styles.mount} x="170" y="198" width="20" height="8" rx="1.5" />

          <g ref={net} className={styles.net}>
            <path d={mesh} />
            {rings.map((ring) => <path key={ring} d={ring} />)}
          </g>

          <g ref={rim} className={styles.rim}>
            <path className={styles.rimGlow} filter={`url(#${glow})`} d={`M${RIM.cx - RIM.rx} ${RIM.cy} A${RIM.rx} ${RIM.ry} 0 0 1 ${RIM.cx + RIM.rx} ${RIM.cy} M${RIM.cx - RIM.rx} ${RIM.cy} A${RIM.rx} ${RIM.ry} 0 0 0 ${RIM.cx + RIM.rx} ${RIM.cy}`} />
            <path className={styles.rimBack} d={`M${RIM.cx - RIM.rx} ${RIM.cy} A${RIM.rx} ${RIM.ry} 0 0 1 ${RIM.cx + RIM.rx} ${RIM.cy}`} />
          </g>

          {dots.map((dot, index) => <circle key={index} className={styles.dot} style={{ "--i": index } as React.CSSProperties} cx={dot.x} cy={dot.y} r={2.6} />)}

          {/* The paper: the outer group is flown by the shot, the inner one just bobs while it waits. */}
          <g ref={sprite} className={styles.sprite} style={{ transform: `translate(${START.x}px, ${START.y}px) rotate(-6deg)` }}>
            <g className={styles.bob}>
              <rect x="-17" y="-22" width="34" height="44" rx="3.5" className={styles.paper} />
              <path d="M-9 -12 H9 M-9 -6 H9 M-9 0 H3" className={styles.lines} />
              <g transform="translate(5 11)">
                <circle r="8.5" className={styles.ball} />
                <path d="M-8.5 0 H8.5 M0 -8.5 V8.5 M-6 -6 Q-2.5 0 -6 6 M6 -6 Q2.5 0 6 6" className={styles.seams} />
              </g>
            </g>
          </g>

          <path className={styles.rimFront} d={`M${RIM.cx - RIM.rx} ${RIM.cy} A${RIM.rx} ${RIM.ry} 0 0 0 ${RIM.cx + RIM.rx} ${RIM.cy}`} />
        </svg>
      </button>
      <span className="sr-only" role="status">{phase === "made" ? "File sent" : phase === "missed" ? "That file can’t be used" : ""}</span>
      {children}
    </div>
  );
}

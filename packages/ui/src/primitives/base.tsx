"use client";

import { forwardRef } from "react";
import { cn } from "../cn.js";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        // duration/ease are explicit so every button shares one motion feel
        // with the rest of the system rather than Tailwind's default 150ms.
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 ease-[var(--ease-out-quint)] active:translate-y-px active:duration-75 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none",
        size === "sm" && "px-3.5 py-1.5 text-[13px]",
        size === "md" && "px-4.5 py-2.5 text-sm",
        size === "lg" && "px-6 py-3.5 text-[15px]",
        // The glow is derived from the live accent token — it used to be a
        // hard-coded purple left over from the pre-rebrand palette, which
        // rendered a blue-violet halo under an orange button.
        variant === "primary" &&
          "bg-[var(--color-orange)] text-white shadow-[0_8px_24px_-12px_color-mix(in_srgb,var(--color-orange)_85%,transparent)] hover:-translate-y-px hover:bg-[var(--color-orange-deep)] hover:shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--color-orange)_75%,transparent)]",
        variant === "secondary" &&
          "border border-[var(--color-line)] bg-white text-[var(--color-ink)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]",
        variant === "ghost" && "text-[var(--color-ink-soft)] hover:bg-[var(--color-lavender)]",
        variant === "danger" && "bg-[var(--color-bad)] text-white hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
});

export function Card({
  className,
  children,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]",
        interactive &&
          "transition duration-200 hover:-translate-y-[3px] hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Stat({
  value,
  label,
  hint,
  tone = "default",
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "default" | "purple" | "warn";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "tabular text-[28px] leading-none font-semibold",
          tone === "purple" && "text-[var(--color-purple)]",
          tone === "warn" && "text-[var(--color-warn)]",
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-[var(--color-ink-soft)]">{label}</span>
      {hint ? <span className="text-[11px] text-[var(--color-faint)]">{hint}</span> : null}
    </div>
  );
}

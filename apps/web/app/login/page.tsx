import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "../../lib/auth";
import { safeReturnPath, signInDestination } from "../../lib/security";
import { LoginForm } from "../../components/auth/login-form";
import { AuthVisual } from "../../components/auth/auth-visual";
import { RailorBrand } from "../../components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `next` lets flows like /invite/:token send people back after signing in.
  const next = typeof params.next === "string" ? safeReturnPath(params.next, "") : "";
  const query = typeof params.q === "string" ? params.q.slice(0, 300) : undefined;
  // The visitor's question survives authentication — it is carried into
  // onboarding and then opens in the workspace search.
  const returnTo = next || (query ? `/welcome?q=${encodeURIComponent(query)}` : "/welcome");
  const session = await getSession();
  if (session) redirect(signInDestination(returnTo, Boolean(session.organization?.onboardingCompletedAt)));

  const error = typeof params.error === "string" ? params.error : undefined;
  const intent = typeof params.intent === "string" ? params.intent : undefined;
  const prefillEmail = typeof params.email === "string" ? params.email : undefined;

  return (
    <main id="main" className="auth-viewport grid bg-[var(--color-canvas)] lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-[linear-gradient(165deg,#f7e8d9,#efd8c4)] p-10 lg:flex xl:p-14">
        <Link href="/" className="relative w-fit" aria-label="Railor home"><RailorBrand size={32} /></Link>
        <div className="relative mx-auto flex w-full max-w-[460px] flex-col gap-10">
          <div>
            <p className="text-[clamp(30px,3vw,40px)] font-[650] leading-[1.08] tracking-[-0.03em] text-[var(--color-ink)]">See what arrives before you send.</p>
            <ul className="mt-6 grid gap-3 text-[15px] text-[var(--color-ink-soft)]">
              {["Live prices from apps, banks and payment platforms", "Only options your profile can actually use", "Saved routes, alerts, company rules and an API key"].map((item) => (
                <li key={item} className="flex items-start gap-2.5"><Check size={17} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-orange-deep)]" />{item}</li>
              ))}
            </ul>
          </div>
          <AuthVisual />
        </div>
        <p className="relative text-[12.5px] text-[var(--color-muted)]">Free to start · No card needed</p>
      </section>

      <section className="flex min-h-full flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-10 sm:py-10">
        <div className="flex shrink-0 items-center justify-between">
          <Link href="/" className="lg:invisible" aria-label="Railor home"><RailorBrand size={30} /></Link>
          <Link href="/prices" className="rounded-full px-3 py-2 text-[14px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]">Compare prices</Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-4 sm:py-10">
          <LoginForm
            returnTo={returnTo}
            intent={intent}
            savedQuery={query}
            initialEmail={prefillEmail}
            initialError={error}
            demoAvailable={process.env.NODE_ENV !== "production"}
            oauth={{
              google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
              github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
            }}
          />
        </div>
      </section>
    </main>
  );
}

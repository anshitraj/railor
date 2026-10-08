import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { safeReturnPath, signInDestination } from "../../lib/security";
import { LoginForm } from "../../components/auth/login-form";
import { RailArtwork } from "../../components/marketing/rail-artwork";
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
  const session = await getSession();
  if (session) redirect(signInDestination(next || "/welcome", Boolean(session.organization?.onboardingCompletedAt)));

  const query = typeof params.q === "string" ? params.q : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  // The visitor's question survives authentication — it is carried into
  // onboarding and pre-fills their first corridor.
  const returnTo = next || (query ? `/welcome?q=${encodeURIComponent(query)}` : "/welcome");
  const prefillEmail = typeof params.email === "string" ? params.email : undefined;

  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between gap-10 overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-paper)] p-10 xl:p-12 lg:flex">
        <div className="rail-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2">
          <RailorBrand size={32} />
        </Link>
        <div className="relative flex flex-col gap-6">
          <div className="max-w-md">
            <span className="product-eyebrow">Financial infrastructure, mapped</span>
            <p className="font-display text-[clamp(2.5rem,4vw,4rem)] font-semibold leading-[1.06] tracking-[-0.05em]">
              Your next move.<br /><span className="text-[var(--color-orange-deep)]">Backed by evidence.</span>
            </p>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--color-muted)]">
              Railor checks each mapped provider against your corridor and tells you why the answer
              is what it is.
            </p>
          </div>
          <RailArtwork />
        </div>
        <p className="relative text-[12px] text-[var(--color-muted)]">
          Know the route. Understand the evidence. Move with clarity.
        </p>
      </section>

      <section className="flex flex-col items-center justify-center gap-12 px-6 py-10 sm:py-16">
        <Link href="/" className="self-start lg:hidden" aria-label="Railor home"><RailorBrand size={30} /></Link>
        <LoginForm
          returnTo={returnTo}
          savedQuery={query}
          initialEmail={prefillEmail}
          initialError={error}
          demoAvailable={process.env.NODE_ENV !== "production"}
          oauth={{
            google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
          }}
        />
      </section>
    </main>
  );
}

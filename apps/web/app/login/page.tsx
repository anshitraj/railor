import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { LoginForm } from "../../components/auth/login-form";
import { RailArtwork } from "../../components/marketing/rail-artwork";
import { RailorMark } from "../../components/marketing/nav";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (session) redirect(session.organization?.onboardingCompletedAt ? "/app" : "/welcome");

  const query = typeof params.q === "string" ? params.q : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  // The visitor's question survives authentication — it is carried into
  // onboarding and pre-fills their first corridor.
  const returnTo = query ? `/welcome?q=${encodeURIComponent(query)}` : "/welcome";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-lavender)] p-10 lg:flex">
        <div className="rail-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2">
          <RailorMark />
          <span className="text-[15px] font-semibold">Railor</span>
        </Link>
        <div className="relative flex flex-col gap-6">
          <RailArtwork />
          <div className="max-w-md">
            <p className="text-[20px] font-medium leading-snug text-[var(--color-purple-deep)]">
              Every capability. Every requirement. Every source.
            </p>
            <p className="mt-2 text-[13.5px] text-[var(--color-ink-soft)]">
              Railor checks each mapped provider against your corridor and tells you why the answer
              is what it is.
            </p>
          </div>
        </div>
        <p className="relative text-[12px] text-[var(--color-muted)]">
          Demonstration dataset — providers shown are fictional.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <LoginForm
          returnTo={returnTo}
          savedQuery={query}
          initialError={error}
          oauth={{
            google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
          }}
        />
      </section>
    </main>
  );
}

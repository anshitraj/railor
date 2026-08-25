import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  ensureMigrated,
  getDb,
  magicLinks,
  organizationMembers,
  organizations,
  sessions,
  users,
} from "@railor/database";

const SESSION_COOKIE = "railor_session";
const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 20;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export interface SessionContext {
  user: SessionUser;
  organization: typeof organizations.$inferSelect | null;
  role: string | null;
}

const token = () => randomBytes(24).toString("base64url");

/** Email domains that say nothing about the company behind them. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

export function companyDomain(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || PUBLIC_DOMAINS.has(domain)) return null;
  return domain;
}

/** "acme-payments.io" → "Acme Payments". Pre-fills org name so nobody types it. */
export function suggestedOrgName(email: string): string {
  const domain = companyDomain(email);
  const base = domain ? domain.split(".")[0]! : (email.split("@")[0] ?? "workspace");
  return base
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export async function createMagicLink(email: string, returnTo?: string) {
  await ensureMigrated();
  const db = await getDb();
  const value = token();
  await db.insert(magicLinks).values({
    token: value,
    email: email.trim().toLowerCase(),
    returnTo: returnTo ?? null,
    expiresAt: new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000),
  });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { token: value, url: `${base}/auth/verify?token=${value}` };
}

/**
 * Consumes a magic link and starts a session. Single use: the row is stamped
 * before the session is issued, so a replayed link fails closed.
 */
export async function consumeMagicLink(value: string) {
  await ensureMigrated();
  const db = await getDb();
  const [link] = await db
    .select()
    .from(magicLinks)
    .where(and(eq(magicLinks.token, value), gt(magicLinks.expiresAt, new Date())))
    .limit(1);

  if (!link || link.consumedAt) return null;
  await db.update(magicLinks).set({ consumedAt: new Date() }).where(eq(magicLinks.token, value));

  const user = await findOrCreateUserByEmail(link.email);
  if (!user) return null;

  await startSession(user.id);
  return { user, returnTo: link.returnTo };
}

/** Shared by magic-link and OAuth sign-in so "who counts as the same user" never diverges between paths. */
export async function findOrCreateUserByEmail(email: string, name?: string | null) {
  await ensureMigrated();
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({ email: normalized, name: name ?? undefined }).returning();
  }
  return user ?? null;
}

export async function startSession(userId: string) {
  const db = await getDb();
  const value = token();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ token: value, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
  return value;
}

export async function signOut() {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (value) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.token, value));
  }
  jar.delete(SESSION_COOKIE);
}

/** Current user + their active organization, or null for anonymous visitors. */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;

  await ensureMigrated();
  const db = await getDb();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, value), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  const [membership] = await db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, row.user.id))
    .orderBy(desc(organizations.createdAt))
    .limit(1);

  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      isAdmin: row.user.isAdmin,
    },
    organization: membership?.org ?? null,
    role: membership?.role ?? null,
  };
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

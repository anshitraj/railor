import "server-only";

export type OAuthProviderName = "google" | "github";

interface ProviderProfile {
  email: string;
  name: string | null;
}

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  scope: string;
  extraAuthorizeParams?: Record<string, string>;
  fetchProfile: (accessToken: string) => Promise<ProviderProfile>;
  exchangeCode: (params: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<string>;
}

async function googleExchange({
  code,
  redirectUri,
  clientId,
  clientSecret,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`google token exchange failed: ${response.status}`);
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("google token exchange returned no access_token");
  return json.access_token;
}

async function googleProfile(accessToken: string): Promise<ProviderProfile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`google userinfo failed: ${response.status}`);
  const json = (await response.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!json.email || json.email_verified === false) {
    throw new Error("google account has no verified email");
  }
  return { email: json.email.toLowerCase(), name: json.name ?? null };
}

async function githubExchange({
  code,
  redirectUri,
  clientId,
  clientSecret,
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`github token exchange failed: ${response.status}`);
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error(json.error ?? "github token exchange returned no access_token");
  return json.access_token;
}

/** GitHub requires a User-Agent on every API request or it 403s. */
const githubHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
  accept: "application/vnd.github+json",
  "user-agent": "railor-app",
});

async function githubProfile(accessToken: string): Promise<ProviderProfile> {
  const response = await fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) });
  if (!response.ok) throw new Error(`github user fetch failed: ${response.status}`);
  const json = (await response.json()) as { email?: string | null; name?: string | null };

  let email = json.email?.toLowerCase() ?? null;
  if (!email) {
    // Private-email accounts don't return one on /user — the verified primary
    // address lives in the emails list instead.
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: githubHeaders(accessToken),
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = primary?.email.toLowerCase() ?? null;
    }
  }
  if (!email) throw new Error("github account has no verified email");
  return { email, name: json.name ?? null };
}

const PROVIDERS: Record<OAuthProviderName, ProviderConfig> = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    extraAuthorizeParams: { access_type: "online", prompt: "select_account" },
    exchangeCode: googleExchange,
    fetchProfile: googleProfile,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    exchangeCode: githubExchange,
    fetchProfile: githubProfile,
  },
};

export function isOAuthProvider(value: string): value is OAuthProviderName {
  return value === "google" || value === "github";
}

export function isOAuthConfigured(provider: OAuthProviderName): boolean {
  const config = PROVIDERS[provider];
  return Boolean(config.clientId && config.clientSecret);
}

export function buildAuthorizeUrl(provider: OAuthProviderName, redirectUri: string, state: string): string {
  const config = PROVIDERS[provider];
  if (!config.clientId) throw new Error(`${provider} is not configured`);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    ...(config.extraAuthorizeParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

export async function completeOAuthExchange(
  provider: OAuthProviderName,
  code: string,
  redirectUri: string,
): Promise<ProviderProfile> {
  const config = PROVIDERS[provider];
  if (!config.clientId || !config.clientSecret) throw new Error(`${provider} is not configured`);
  const accessToken = await config.exchangeCode({
    code,
    redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  return config.fetchProfile(accessToken);
}

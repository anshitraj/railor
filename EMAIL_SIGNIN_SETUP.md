# Email sign-in using Resend SMTP

Railor already issues one-use magic links that expire after 20 minutes. Resend
delivers those emails through SMTP; authentication and session cookies run in
the Next.js app on Vercel, using Neon. The Railway crawler needs no mail key.

Both personal and company email addresses are accepted. The login page says
company or work email is preferred; this is guidance, not a domain restriction.
Google sign-in is also available to both groups when its credentials are set.

## Configure Resend

1. Sign in at https://resend.com/login.
2. Add `mail.railor.xyz` in Domains and add the
   exact DNS records shown by Resend at your DNS provider. Wait for verification.
3. Create a sending API key scoped to the verified domain. Resend uses this key
   as the SMTP password, with username `resend`. Use a Sending access key
   scoped to `mail.railor.xyz`.
4. Keep click tracking disabled for sign-in emails, so magic links stay intact.

See the official [SMTP settings](https://resend.com/docs/send-with-smtp) and
[domain verification guide](https://resend.com/docs/dashboard/domains/introduction).

## Configure Vercel

Set these **server-side Production** environment variables on `railor-web`:

```dotenv
AUTH_EMAIL_TRANSPORT=smtp
RESEND_API_KEY=YOUR_RESEND_API_KEY
AUTH_FROM=Railor <hello@mail.railor.xyz>
APP_ORIGIN=https://www.railor.xyz
NEXT_PUBLIC_APP_URL=https://www.railor.xyz
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
```

Use `AUTH_FROM` only after its domain is verified. The API key stays in Vercel's
secret environment settings; do not put a real key in this document, Git, a
browser bundle, or a `NEXT_PUBLIC_` variable. URL-encode a password if it
contains URL-reserved characters. Redeploy after changing the variables.

The app builds its Resend SMTP connection from `RESEND_API_KEY`, URL-encoding
the password automatically. An explicit `SMTP_URL` takes precedence; leave it
empty when using `RESEND_API_KEY`, or remove a stale deployment value. Existing
SMTP providers remain supported with `SMTP_URL`.

## Configure local development

The root `E:\Railor\.env` is ignored by Git and loaded by `apps/web/next.config.ts`.
Set these locally, keeping both URLs on localhost so Google state cookies and
magic links return to the same development server:

```dotenv
AUTH_EMAIL_TRANSPORT=smtp
RESEND_API_KEY=YOUR_RESEND_API_KEY
AUTH_FROM=Railor <hello@mail.railor.xyz>
APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
```

Restart `pnpm dev` after saving credentials. Email delivery will fail until
Resend verifies `mail.railor.xyz` and the sending key is saved. To work locally
while DNS is pending, temporarily use `AUTH_EMAIL_TRANSPORT=console`; the
development login page shows the magic link. Console mode is unavailable in
production. Google sign-in does not depend on email-domain verification.

## Verify

Sign-in emails include Railor branding, a full-width verification button, the
recipient, a one-use/20-minute expiry notice, a copyable backup link and a safety
notice. Both the Railor logo and the official Resend wordmark are embedded PNG
attachments, so the message does not fetch remote images or tracking pixels.
The plain-text alternative carries the same link and expiry. The table layout
and inline styles work without responsive CSS; mobile media queries reduce
padding and heading size. Client-specific inbox rendering still needs a real
Gmail, Apple Mail and Outlook check after deployment.

Generate a browser preview and a MIME `.eml` without sending an email:

```sh
pnpm --filter @railor/core exec tsx ../../apps/web/scripts/preview-sign-in-email.ts
```

Outputs are in `.railor/email-preview/` (ignored by Git) and use a synthetic
verification token. The template lives in `apps/web/lib/emails/sign-in.ts`.

Open `/login`, submit an email address you control, and check both Resend's sent
emails and your inbox. Follow the link: it should create your workspace on first
sign-in, set a secure HttpOnly session cookie and continue to onboarding. Reusing
the link must fail, and expired links must return to login for a fresh link.

Production never returns the token in the API response or exposes development
demo login. Missing SMTP settings return `email_unavailable`; failed database
operations return `sign_in_unavailable`, with no credentials in the response.
The authenticated `/api/health/ready` check validates required settings and
database connectivity, but does not send an email or prove inbox delivery.

## Other confirmed production configuration gap

The production `/api/internal/usage-rollup` endpoint returned
`503 {"error":"cron_not_configured"}` during the deployment check. Set a random
`CRON_SECRET` in Vercel Production and redeploy so Vercel's scheduled jobs can
authenticate. Generate one locally with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and
store it in the deployment's secret settings. Never place the value in Git.
After deployment, unauthenticated requests must return 401, and requests with
the correct Bearer secret can run the job.

## Enable Continue with Google

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/clients)
   and select your Railor Google Cloud project. Create a project if needed.
2. Configure Branding with app name `Railor`, your real support and developer
   contact email, and authorized domain `railor.xyz`. Use these public URLs:
   - Homepage: `https://www.railor.xyz`
   - Privacy policy: `https://www.railor.xyz/legal/privacy`
   - Terms: `https://www.railor.xyz/legal/terms`
3. Choose an **External** audience so personal Google accounts and Google
   Workspace accounts can sign in. Publish the app for public sign-in; while
   testing, add the accounts you intend to use as test users if Google requires it.
4. Under Clients, create a **Web application** client named `Railor Web`.
   Authorized JavaScript origins, if supplied, should be:
   - `https://www.railor.xyz`
   - `http://localhost:3000`
5. Register these exact authorized redirect URIs:

```text
https://www.railor.xyz/api/auth/oauth/google/callback
http://localhost:3000/api/auth/oauth/google/callback
```

6. Save the generated client ID and secret privately to the root `.env` for
   development and Vercel Production for the live site. Restart locally and
   redeploy production. Use a separate development client if you want to keep
   the production client limited to the production callback.

Keep the client secret server-side. `GEMINI_API_KEY` and Google service-account
credentials cannot replace this OAuth client ID and secret. Railor requests only
`openid email profile`, requires a verified Google email, and uses a short-lived
state cookie to validate the callback. Google can sign in personal accounts and
Google Workspace accounts; no company-domain restriction is applied.

See Google's official [web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## Verify Google sign-in

Open `/login` on the deployment being tested and choose **Continue with Google**.
The Google authorization URL must use that deployment's exact registered
callback; `www`, scheme, port and path must match. Complete sign-in with an
account you control and confirm the redirect lands in onboarding or your
existing workspace. An `oauth_state` error often means sign-in started on a
different host from the registered callback; production sign-in should start
at `https://www.railor.xyz/login`. `redirect_uri_mismatch` means the callback
in Google Auth Platform does not match `APP_ORIGIN` plus the callback path.

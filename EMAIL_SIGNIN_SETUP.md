# Email sign-in using Resend SMTP

Railor already issues one-use magic links that expire after 20 minutes. Resend
delivers those emails through SMTP; authentication and session cookies run in
the Next.js app on Vercel, using Neon. The Railway crawler needs no mail key.

Both personal and company email addresses are accepted. The login page says
company or work email is preferred; this is guidance, not a domain restriction.
Google sign-in is also available to both groups when its credentials are set.

## Configure Resend

1. Sign in at https://resend.com/login.
2. Add `railor.xyz` (or your chosen sending subdomain) in Domains and add the
   exact DNS records shown by Resend at your DNS provider. Wait for verification.
3. Create a sending API key scoped to the verified domain. Resend uses this key
   as the SMTP password, with username `resend`.
4. Keep click tracking disabled for sign-in emails, so magic links stay intact.

See the official [SMTP settings](https://resend.com/docs/send-with-smtp) and
[domain verification guide](https://resend.com/docs/dashboard/domains/introduction).

## Configure Vercel

Set these **server-side Production** environment variables on `railor-web`:

```dotenv
AUTH_EMAIL_TRANSPORT=smtp
SMTP_URL=smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465
AUTH_FROM=Railor <no-reply@railor.xyz>
APP_ORIGIN=https://www.railor.xyz
```

Use `AUTH_FROM` only after its domain is verified. The API key stays in Vercel's
secret environment settings; do not put a real key in this document, Git, a
browser bundle, or a `NEXT_PUBLIC_` variable. URL-encode a password if it
contains URL-reserved characters. Redeploy after changing the variables.

## Verify

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

In Google Auth Platform, configure Railor's OAuth consent screen for an External
audience and create a Web application OAuth client. Register this exact redirect:

```text
https://www.railor.xyz/api/auth/oauth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel Production and
redeploy. Keep the client secret server-side. If the app remains in Google's
Testing mode, only configured test users can sign in; make its publishing status
appropriate for your intended public audience. Railor requests only
`openid email profile`, requires a verified Google email, and uses a short-lived
state cookie to validate the callback. Google can sign in personal accounts and
Google Workspace accounts; no company-domain restriction is applied.

See Google's official [web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

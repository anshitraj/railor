# Email logo assets

`logos.json` contains the original PNG bytes as base64 for inline MIME attachments.
Importing them includes the logos in serverless bundles without filesystem paths
or network requests during sign-in. Keep these assets unchanged.

| Logo | Source |
| --- | --- |
| Railor mark | `apps/web/public/brand/railor-r.png` |
| Resend black wordmark | https://cdn.resend.com/brand/resend-wordmark-black.png |

Resend's official brand kit: https://resend.com/brand.

## Sign-in email art (`sign-in-assets.json`)

The animated hero (`hero`, a looping GIF) and the four icon tiles (`compare`,
`bell`, `api`, `lock`, PNG) are drawn from plain shapes by
`generate-assets.py`; nothing is copied from another site or brand. Regenerate
with `python apps/web/lib/emails/generate-assets.py` (needs Pillow). They are
embedded as base64 for the same reason as the logos: they travel inside the
email, so opening it fetches nothing. Frame 0 of the GIF is a complete picture,
because Outlook for Windows shows only the first frame.

# ILECO III Complaint & Response System — secure build

## What changed in security
| Before | Now |
|---|---|
| Login = claimed username passed to SQL functions (anyone knowing a username could impersonate them) | **Supabase Auth** — real signed JWT sessions; every database function checks `auth.uid()` |
| Unsalted SHA-256 computed in the browser | bcrypt, salted, handled only by Supabase Auth — no password data in your tables |
| Admin functions callable with a typed-in admin name | Admin actions run in an **Edge Function** that verifies the caller's JWT is an admin; service-role key never leaves the server |
| First visitor could claim admin on a fresh install | Setup requires a secret **SETUP_KEY** |
| Any user could write any audit-log text | Audit identity comes from the JWT; only 3 client actions allowed |
| No browser hardening | CSP, HSTS, no-framing, no-referrer, pinned CDN versions, XSS-safe rendering (no untrusted `innerHTML`), 12-char passwords, forced change of temp passwords (verified server-side), idle auto-logout (30 min), session ends when the tab closes, login throttling, field role limited to response columns |

## Setup (in this order)
1. **SQL**: Supabase → SQL Editor → run `supabase/schema.sql`. Your complaints data is kept; old users are removed.
2. **Dashboard → Authentication**:
   - Providers → Email: **turn OFF "Allow new users to sign up"** and **OFF "Confirm email"** (users are created only by the admin function).
   - Password: minimum length 12; enable leaked-password protection if your plan has it.
   - Keep the default rate limits (or lower them); add CAPTCHA if you can.
3. **Edge Function** (Supabase CLI):
   ```
   supabase functions deploy admin-users
   supabase secrets set SETUP_KEY="<long random string>" ALLOWED_ORIGIN="https://your-site.example" EMAIL_DOMAIN="ileco3.invalid"
   ```
   `ALLOWED_ORIGIN` must exactly match your site's origin (no trailing slash).
4. **config.js**: paste your project URL and **anon** key. Never the service_role key.
5. Upload this whole folder to your host (the `_headers` file applies the security headers on Netlify / Cloudflare Pages; copy them manually elsewhere). Serve over **HTTPS only**.
6. Open `setup.html`, enter the SETUP_KEY, create the first admin. Then create users from Admin → Users.

## Things to review
- `barangays.js` has only example entries — **fill in your real barangay/town list**.
- Office prefixes (PBO, SBO, NBO, MO) are in `office_prefix()` in schema.sql. Change them to match your existing control numbers.
- Duration = (date received + time received) → (date acted + time finished); Net = Duration − Travel. "Download Excel" = the readable table; "(Full Data)" = every database column. These were inferred, since the original JS wasn't available — adjust if yours differed.
- If Supabase rejects the `.invalid` e-mail domain, use `ileco3.local` in **both** `config.js` and the `EMAIL_DOMAIN` secret.
- For maximum supply-chain safety, download supabase-js and ExcelJS, host them yourself, and change the two `<script>` URLs and the CSP — then no third-party script can run on your pages.
- Back up the database regularly (Supabase → Database → Backups) and enable MFA on your Supabase and hosting accounts.

# Johnston Media

Cinematic photography, videography, aerial media **and web development** —
built with Next.js, Firebase, Square and Resend, deployed on Vercel.

> Your Vision. My Lens.

---

## What this is

A full rebuild of wjohnstonmedia.com as a Next.js application. The previous
version was hand-written static HTML on GitHub Pages; this one keeps the same
visual language but adds a server, which is what makes email automation and
Square invoicing possible.

### Routes

| Route              | What it is                                                  |
| ------------------ | ----------------------------------------------------------- |
| `/`                | Homepage — hero, services, portfolio teaser, web dev teaser |
| `/work`            | Full portfolio, grouped by category, with lightbox           |
| `/web-development` | Web development services, packages, process and quote form   |
| `/about`           | Studio story, stats and process                              |
| `/contact`         | Quote request form + short contact form                      |
| `/portal`          | Client portal — quotes, project progress, file delivery      |
| `/admin`           | Admin panel — quotes, invoicing, clients, projects, messages |

### API routes

| Endpoint              | Auth       | Purpose                                          |
| --------------------- | ---------- | ------------------------------------------------ |
| `/api/quote`          | Public     | Quote request → Firestore + Square customer + email |
| `/api/contact`        | Public     | Contact form → Firestore + email alert           |
| `/api/invoice`        | Admin      | Quote → Square invoice, published and emailed    |
| `/api/project/stage`  | Admin      | Move a project stage and notify the client       |
| `/api/square/webhook` | Signed     | Square payment events → status, project, receipts |

---

## The automated flow

This is the pipeline the site runs on its own:

```
Client submits a quote request
   ├─ saved to Firestore  (quotes/)
   ├─ Square customer created or matched
   ├─ email → client:  "Quote request received"
   └─ email → you:     "New quote request from …"

You open /admin → Quotes → Send invoice
   ├─ Square order + invoice created and published
   ├─ Square emails the client a payment link
   ├─ email → client:  "Your quote is ready"  (branded, same link)
   └─ quote status → Invoiced

Client pays in Square
   └─ webhook → /api/square/webhook
        ├─ quote status → Paid
        ├─ project opened automatically (projects/, stage: Planning)
        ├─ email → client:  "Payment received"
        └─ email → you:     "Paid — <client> · <amount>"

You move the project through its stages in /admin → Projects
   └─ email → client on each stage change
```

---

## Local development

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run typecheck    # TypeScript, no emit
npm run lint         # Next.js ESLint
```

The site degrades gracefully when services aren't configured: without Firebase
the portfolio shows empty states and the portal explains it's unavailable;
without Resend, emails are skipped and logged rather than throwing; without
Square, the invoice button returns a clear error instead of failing silently.

---

## Setup

### 1. Firebase

Reuses the existing project — nothing to migrate.

1. **Firestore rules**: paste `firestore.rules` into Firebase Console →
   Firestore → Rules → Publish.
2. **Storage rules**: paste `storage.rules` into Storage → Rules → Publish.
3. **Authorised domains**: Authentication → Settings → Authorised domains —
   add `wjohnstonmedia.com` and your `*.vercel.app` preview domain.
4. **Service account**: Project settings → Service accounts → *Generate new
   private key*. The JSON gives you `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.

### 2. Resend (email)

1. Sign up at [resend.com](https://resend.com) and add `wjohnstonmedia.com`
   under **Domains**.
2. Add the DNS records it gives you (SPF, DKIM, and ideally DMARC) at your
   registrar. Wait for it to verify — until then, sends are rejected.
3. Create an API key → `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to an address on the verified domain, e.g.
   `Johnston Media <hello@wjohnstonmedia.com>`.

### 3. Square

1. [developer.squareup.com/apps](https://developer.squareup.com/apps) → your
   application.
2. Copy the **access token** and **location ID**. Start with the **sandbox**
   credentials (`SQUARE_ENVIRONMENT="sandbox"`) and test the whole flow before
   switching to production.
3. **Webhooks** → *Add subscription*:
   - URL: `https://wjohnstonmedia.com/api/square/webhook`
   - Events: `invoice.payment_made` and `invoice.updated`
   - Copy the **signature key** → `SQUARE_WEBHOOK_SIGNATURE_KEY`
4. Set `SQUARE_WEBHOOK_NOTIFICATION_URL` to that exact URL. The signature is
   computed over URL + body, so a mismatch (http vs https, trailing slash,
   `www.`) rejects every event.

### 4. Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Next.js
   is detected automatically — no build settings to change.
2. Add every variable from `.env.example` under **Settings → Environment
   Variables** (Production *and* Preview).
3. **Domains** → add `wjohnstonmedia.com` and follow the DNS instructions.

> The old `CNAME` file has been removed — it was GitHub Pages-specific. Turn
> GitHub Pages off in the repo settings once Vercel is serving the domain, so
> the two aren't fighting over DNS.

---

## Firestore data model

```
users/{uid}
  uid, name, email, phone, role, blocked, adminNotes,
  permissions{}, squareCustomerId, createdAt, linkedAt

pendingClients/{email}          ← admin-created, pre-signup
  name, email, phone, role, adminNotes, createdAt

quotes/{id}
  clientId, clientName, clientEmail, clientPhone
  serviceType, source ('media' | 'web'), name, date, location, budget, details
  status: Pending → Reviewed → Invoiced → Paid  (Declined at any point)
  squareCustomerId, squareInvoiceId, squareInvoiceNumber, squarePublicUrl
  amountCents, currency, invoicedAt, paidAt, createdAt

projects/{id}
  clientId, clientName, clientEmail, serviceType, name
  status: Planning → Shooting → Editing → Delivering → Delivered
  files[], quoteId, clientNote, createdAt

messages/{id}      name, email, message, read, createdAt
settings/site      hero + about copy, contact email, social links
portfolio/{category}/projects/{id}
                   title, description, thumbnail, url, type, gallery[], order
squareEvents/{id}  webhook de-duplication (server-only, no client access)
```

### Roles

| Role             | Access                                                       |
| ---------------- | ------------------------------------------------------------ |
| **Prospective**  | Portal: submit and view their own quotes                     |
| **Client**       | Portal: projects, files, invoices                            |
| **Admin**        | Admin panel (permissions configurable)                       |
| **Master Admin** | Admin + manage roles, block and delete users                 |
| **Owner**        | Everything. `wjohnston.media@gmail.com` is permanently Owner |

Roles live on the Firestore user document — there are no custom claims. Both
`firestore.rules` and `lib/firebaseAdmin.ts` read from there.

### Creating a client before they've signed up

Admin → Clients → **Create client** writes to `pendingClients/{email}`, *not*
to `users/`. Firestore only allows a `users` document to be created by the
account that owns it (`request.auth.uid == uid`), so a pre-made profile written
there is always rejected with "Missing or insufficient permissions". When the
client first signs in, `lib/useAuth.ts` finds the pending record by email,
copies it onto their real user document and deletes the placeholder.

---

## Project structure

```
app/
  layout.tsx           root layout, fonts, nav, footer
  globals.css          brand system — tokens, buttons, forms, reveals
  page.tsx             homepage
  work/ about/ contact/ web-development/
  portal/              client portal (auth-gated)
  admin/               admin panel + panels and invoice modal
  api/                 route handlers
components/            Nav, Footer, Hero, Reveal, Toast, forms, portfolio
lib/
  firebase.ts          browser SDK
  firebaseAdmin.ts     Admin SDK + token verification
  square.ts            Square REST client + webhook signature check
  email.ts             Resend + branded HTML templates
  types.ts             shared domain types
  useAuth.ts           auth state + pendingClients claiming
firestore.rules  storage.rules
```

Styling is CSS Modules over a global token layer — no utility framework, so the
markup stays readable and the brand values live in one place (`app/globals.css`).

Square is called through its REST API with `fetch` rather than the Node SDK:
the SDK has had breaking rewrites between majors, while the REST surface is
pinned by the `Square-Version` header.

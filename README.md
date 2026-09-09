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
| `/api/estimate`       | Admin      | Send an estimate for a quote                     |
| `/api/estimate/respond` | Client   | Accept or decline an estimate                    |
| `/api/invoice`        | Admin      | Quote → Square invoice, published and emailed    |
| `/api/project`        | Admin      | Open a project, optionally from a quote          |
| `/api/project/record` | Admin      | Record a Square estimate or contract on a project |
| `/api/project/stage`  | Admin      | Move a project's stage and notify the client     |
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

You open /admin → Quotes → Send estimate      (optional but recommended)
   ├─ line items pre-filled from the package they chose
   ├─ email → client: "Here's what it would take"
   └─ quote status → Estimate Sent

Client accepts or declines in their portal
   ├─ accepted  → status → Accepted, email → you
   └─ declined  → status → Declined + their reason, email → you

You open /admin → Quotes → Send invoice
   ├─ line items pre-filled from the accepted estimate
   ├─ optionally take a deposit (% or fixed) to hold the date
   ├─ Square order + invoice created and published
   ├─ Square emails the client a payment link
   ├─ Square schedules reminders: 3 days before, 1 and 7 days after due
   ├─ email → client:  "Your quote is ready"  (branded, same link)
   └─ quote status → Invoiced

Client pays the deposit (only when one was requested)
   └─ webhook → quote status → Deposit Paid
        ├─ project opened (the booking is confirmed)
        ├─ email → client:  "Your date is locked in"
        └─ portal now offers "Pay balance" on the same invoice

Client pays in full
   └─ webhook → /api/square/webhook
        ├─ quote status → Paid
        ├─ project opened if it wasn't already
        ├─ email → client:  "Payment received"
        └─ email → you:     "Paid — <client> · <amount>"

You cancel or refund the invoice in Square
   └─ webhook → quote status → Cancelled / Refunded
        └─ the portal stops offering the payment link

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

## Go-live runbook

Work through this in order. Steps 1–3 can happen in any order, but **do not
merge to `main` until step 8** — the old static site is gone, so the moment
this hits `main` the GitHub Pages version stops serving.

### 1. Give Vercel access to the repo

1. **github.com/settings/installations** → **Configure** next to **Vercel**
   (for an org-owned repo: *github.com/organizations/johnstonmedia/settings/installations*)
2. Under *Repository access* → **Select repositories** → add **Johnston-Media**
3. **Save**

### 2. Firebase

Reuses the existing project — nothing to migrate.

1. **Firestore rules**: paste `firestore.rules` into Firebase Console →
   Firestore → Rules → Publish.
2. **Storage rules**: paste `storage.rules` into Storage → Rules → Publish.
3. **Authorised domains**: Authentication → Settings → Authorised domains —
   add `wjohnstonmedia.com` and your `*.vercel.app` preview domain. Google
   sign-in fails on any domain not listed here.
4. **Service account**: Project settings → Service accounts → *Generate new
   private key*. The JSON gives you `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.

### 3. Resend (email)

Start this early — DNS propagation is the slowest part of the whole setup.

1. Sign up at [resend.com](https://resend.com) → **Domains** → add
   `wjohnstonmedia.com`.
2. Add the SPF and DKIM records it gives you at your registrar (a DMARC record
   is worth adding too). Wait for Resend to show **Verified**.
3. **API Keys** → create one → `RESEND_API_KEY`.
4. `EMAIL_FROM` must be an address **on that verified domain** —
   `Johnston Media <hello@wjohnstonmedia.com>`. A from-address on any other
   domain is rejected even with a valid key.

### 4. Square

See [Connecting Square](#connecting-square) below — it is the fiddliest part
and has its own section.

### 5. Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) → import **Johnston-Media**.
   Next.js is detected automatically; no build settings to change.
2. **Settings → Environment Variables** → add every value from
   `.env.example`, to **Production and Preview** both.
3. Don't add the domain yet.

### 6. Test on the preview URL

Every branch gets its own deployment. On the preview URL:

- Sign in to `/portal` with Google (confirms Firebase auth + authorised domains)
- Submit a quote from `/contact` — you should get two emails, and the quote
  should appear in `/admin`
- Send a Square **sandbox** invoice from `/admin` → Quotes
- Pay it with a [Square test card](https://developer.squareup.com/docs/devtools/sandbox/payments)
- Confirm the quote flips to Paid, a project opens, and the receipts arrive

Point `SQUARE_WEBHOOK_NOTIFICATION_URL` and the Square webhook subscription at
the **preview** URL while testing, then move both to the live domain.

### 7. Fill in your own content

- **Prices and packages** — `lib/packages.ts` (see [Packages](#packages) below)
- **Testimonials** — not built yet; say the word and they go in
- **Portfolio** — add projects in `/admin`, or directly in Firestore under
  `portfolio/{category}/projects`

### 8. Cut over

1. Merge this branch to `main`.
2. Vercel → **Domains** → add `wjohnstonmedia.com`, follow the DNS instructions.
3. Update DNS at your registrar. **The site is down between the DNS change and
   Vercel serving**, so pick a quiet hour.
4. Repo **Settings → Pages** → turn GitHub Pages **off**, so the two aren't
   fighting over the domain.
5. Update `NEXT_PUBLIC_SITE_URL` and `SQUARE_WEBHOOK_NOTIFICATION_URL` to the
   live domain, and repoint the Square webhook subscription.

### 9. Go live on Square

Swap the sandbox credentials for production ones **last**, once the whole flow
has been proven end to end. The webhook signature key is different in
production — forgetting to swap it is the classic mistake, and it fails
silently.

---

## Connecting Square

### Get your credentials

1. [developer.squareup.com/apps](https://developer.squareup.com/apps) → open
   your application (create one if you haven't).
2. Top-left, switch between **Sandbox** and **Production**. Start in Sandbox.
3. **Credentials** → copy the **Access token** → `SQUARE_ACCESS_TOKEN`.
4. **Locations** → copy the **Location ID** → `SQUARE_LOCATION_ID`.
5. Set `SQUARE_ENVIRONMENT="sandbox"` (or `"production"` later) and
   `SQUARE_CURRENCY="AUD"`.

### Set up the webhook

This is what tells the site a client has paid.

1. In the same app → **Webhooks → Subscriptions → Add subscription**.
2. **URL**: `https://wjohnstonmedia.com/api/square/webhook`
   (use your preview URL while testing).
3. **Events** — subscribe to all five:
   - `invoice.payment_made`
   - `invoice.updated`
   - `invoice.canceled`
   - `invoice.refunded`
   - `invoice.scheduled_charge_failed`
4. Save, then copy the **Signature key** → `SQUARE_WEBHOOK_SIGNATURE_KEY`.
5. Set `SQUARE_WEBHOOK_NOTIFICATION_URL` to the **exact** URL from step 2.

> **The single most common failure.** Square signs the notification URL
> concatenated with the request body. If `SQUARE_WEBHOOK_NOTIFICATION_URL`
> differs from what's registered by even one character — `http` vs `https`, a
> trailing slash, `www.` — every event is rejected as an invalid signature and
> nothing appears to happen. Copy and paste it; don't retype it.

### Check it works

Square's **Webhooks → Subscriptions → your subscription** page lists recent
deliveries and their response codes. A `200` means the site accepted it. A
`401` means the signature check failed — re-read the box above.

### Going to production

Repeat everything with the Production credentials: new access token, new
location ID, **new signature key**, and `SQUARE_ENVIRONMENT="production"`.
Sandbox and production share nothing.

---

## Estimates

**Square has no public Estimates API** — estimates are a Dashboard and mobile-app
feature only, confirmed by Square staff on their developer forums. So estimates
here are ours, not Square's.

That turns out better for the flow:

1. **You compose one** in Admin → Quotes → *Send estimate*, pre-filled from the
   package the client chose (or the last estimate, if you're re-sending).
2. **They get a branded email** with the full breakdown and a link to the portal.
   No money moves at this point.
3. **They accept or decline in the portal**, under your branding rather than
   Square's. Declining prompts for a reason, which lands in your inbox.
4. **Accepting pre-loads the invoice builder** with the agreed figures, so the
   Square invoice is one click and the numbers can't drift.

An estimate can carry a *hold this price until* date. Past it, the portal stops
accepting and tells the client to ask for a fresh one — so nobody accepts last
season's rates.

The estimate is stored on the quote (`quotes/{id}.estimate`) with its line
items, total, timestamps and any decline reason, so the history survives later
price changes.

---

## Being found — search and AI answers

### Search engines

- Per-page titles, descriptions and **canonical URLs**, so preview deployments
  never compete with the real domain.
- **Structured data**: `ProfessionalService` for the studio, a `Person` entity
  for Will (given a stable `@id`, so the studio and the individual are one
  thing across the site rather than two loose strings), `Service` for web
  development, and `FAQPage` on `/contact` and `/web-development`.
- **Open Graph and Twitter cards** with a real 1200x630 share image
  (`public/og-image.jpg`). The card metadata previously claimed
  `summary_large_image` with no image to show.
- Favicon, Apple touch icon and a web manifest, so the site has an identity in
  tabs, bookmarks and on phone home screens.
- `sitemap.xml` and `robots.txt` generated from code.

### GEO - showing up in AI answers

Generative engines answer from what they can read and quote, so the work is
mostly about being unambiguous and quotable rather than persuasive.

- **`/llms.txt`** - a plain-markdown summary of what the studio is, where it
  works, how a booking runs and what the packages are, following the
  [llms.txt convention](https://llmstxt.org). It is a proposed convention, not
  a ratified standard, and no engine is obliged to read it. It is generated
  from `lib/packages.ts` and `lib/faq.ts` so it cannot drift from the real
  site, and it ends with explicit notes telling an answer engine *not* to
  invent prices, clients or turnaround times.
- **FAQs in the HTML.** `components/Faq.tsx` uses native `<details>`, so every
  answer is in the markup whether or not it is expanded. A JavaScript accordion
  that injects answers on click hides them from exactly the readers this is for.
- **Short, self-contained answers.** Each one has to survive being lifted out
  of the page on its own - see the rule at the top of `lib/faq.ts`.
- **Explicit crawler rules** in `app/robots.ts`, split into two groups:
  *answer engines* (OAI-SearchBot, PerplexityBot, Claude-SearchBot and friends)
  which cite a link back, and *training crawlers* (GPTBot, ClaudeBot,
  Google-Extended...) which do not. Both are allowed, which is a judgement call
  rather than a technical necessity - move a name into `DISALLOWED_TRAINERS`
  to opt out of one. CCBot is disallowed by default.

**The rule for every fact on the site**: if it is not true and checkable, it
does not go in. An answer engine repeating an invented turnaround time or price
is worse than it not mentioning the studio at all, because nobody sees the
context it stripped away.

---

## Editing the site without touching code

Admin has two tabs for content, and both write straight to Firestore — so a
change is live within a minute, with nothing to redeploy.

**Site content** (`settings/site`)

| Section | What it changes |
| ------- | --------------- |
| Home page hero | Eyebrow, headline, sub-heading; standard gradient hero or your own video behind it |
| About | The pull quote and your story — blank lines start new paragraphs |
| Contact and socials | Public email, second email, Instagram, TikTok, YouTube, footer line |

Leave any field empty and the built-in wording stays. Choosing "Video hero"
without a video quietly reverts to standard rather than shipping a black band.

**Portfolio** (`portfolio/{category}/projects`)

Add, edit, reorder and remove the work shown on the home page and `/work`.
Upload an image or video, or paste a URL. The up/down arrows set the order the
public grid uses.

These pages read their content **on the server** (`lib/serverSettings.ts`,
60-second revalidate), so the words are in the HTML for search engines and AI
answer engines rather than being fetched by the browser afterwards. If Firebase
Admin isn't configured the read fails soft and the built-in copy is used.

---

## Projects — the spine of a job

Everything about a job hangs off one project record: the request it came from,
the estimate, the contract, the invoice, the stage it's at and the files you
delivered. Admin → Projects shows that chain on every card, left to right:

```
Request  →  Estimate  →  Contract  →  Invoice  →  Delivery
```

Lit steps are done, the copper one is where the job sits, dimmed steps are still
outstanding. It's meant to answer one question at a glance: what's next?

### Two stages, not one

A project carries two stages, and they mean different things:

| Field | Values | Who it's for |
| ----- | ------ | ------------ |
| `pipelineStage` | Enquiry · Proposal · Booked · In progress · Complete | Mirrors your **Square Projects board**. You move it by hand to match what you did in Square. Silent — no email. |
| `status` | Planning · Shooting · Editing · Delivering · Delivered | Production detail Square doesn't track. **This one emails the client** and drives the progress bar in their portal. |

Square's board is where the work happens; the pipeline stage is that same
pipeline reflected back, so the site and Square never tell different stories.

### Where projects come from

- **Automatically**, when a Square invoice takes its first payment — a paid
  deposit confirms the booking, so it opens at **Booked** without waiting for
  the balance.
- **By hand**, with *+ New project*. Pick a quote to carry the client, service
  and Square customer across, or start from scratch for a returning client.
  One project per quote, so the timeline can't fork.

### Estimates and contracts made in Square

Square has no API for either (see [Estimates](#estimates) below), so nothing
can be read back automatically. *Record estimate* / *Record contract* captures
the few facts worth showing — reference, total, link, dates, status — and drops
them into the chain.

Each one has a **Show this in the client's portal** switch, **off by default**.
Nothing you record reaches the client until you deliberately publish it.

To make the *Open in Square* link go straight to the right card, paste the
card's URL from your Square board into the project when you create it.

---

## Packages

`lib/packages.ts` is the single source of truth for pre-made packages. One
entry drives three things:

1. the cards a client picks from on the public site,
2. what gets recorded on their quote,
3. the line items pre-loaded into the admin invoice builder.

```ts
{
  id: "web-business",
  source: "web",              // "web" or "media"
  name: "The Business Site",
  audience: "Most small businesses",
  description: "…",
  includes: ["…", "…"],
  featured: true,             // highlights the card
  fromCents: 280000,          // → shows "from $2,800"
  lineItems: [                // → pre-loads the invoice builder
    { name: "Business site — design and build", amountCents: 280000 },
  ],
}
```

**Prices are in cents**: `$2,800` is `280000`.

Leave `fromCents` off and the card reads **"Price on request"** — which is how
every package currently ships, because these are your rates to set. Leave
`lineItems` off and the invoice builder starts blank as before.

When a client picks a package, the service dropdown is replaced by their
choice, `packageId` is stored on the quote, and invoicing that quote starts
with the package's line items already priced — still fully editable before you
send.

`MEDIA_PACKAGES` is empty. Add entries with `source: "media"` and a packages
section appears on the contact page automatically; while it's empty, nothing
renders.

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
  status: Pending → Reviewed → Invoiced → [Deposit Paid] → Paid
          (Declined, Cancelled or Refunded at any point)
  squareCustomerId, squareInvoiceId, squareInvoiceNumber, squarePublicUrl
  squareInvoiceStatus, amountCents, depositCents, depositPaidCents, currency
  invoicedAt, depositPaidAt, paidAt, refundedAt, createdAt

projects/{id}
  clientId, clientName, clientEmail, serviceType, name
  pipelineStage: Enquiry → Proposal → Booked → In progress → Complete
                 (mirrors the Square Projects board)
  status:        Planning → Shooting → Editing → Delivering → Delivered
                 (production detail; emails the client on change)
  squareCustomerId, squareProjectUrl
  estimateRef{}, contractRef{}   ← recorded from Square, see below
  files[], quoteId, clientNote, createdAt, updatedAt

  estimateRef / contractRef:
    reference, amountCents, currency, url, status, sentAt, resolvedAt,
    note, visibleToClient (default false), recordedAt, recordedBy

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

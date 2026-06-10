# Johnston Media — Website Setup Guide

Full cinematic photography & videography studio site with Firebase backend, client portal, and admin panel.

---

## Project Structure

```
johnston-media/
├── index.html              ← Public homepage
├── css/
│   ├── brand.css           ← Shared brand system (never edit)
│   └── home.css            ← Homepage styles
├── js/
│   └── home.js             ← Homepage scroll/interaction JS
├── portal/
│   ├── index.html          ← Client portal (login + dashboard)
│   └── portal.css
├── admin/
│   ├── index.html          ← Admin panel (access via /admin)
│   └── admin.css
├── firestore.rules         ← Firestore security rules
├── storage.rules           ← Firebase Storage security rules
└── README.md
```

---

## Step 1 — Create Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add Project** → name it `johnston-media`
3. Enable **Google Analytics** (optional)

---

## Step 2 — Enable Firebase Services

### Authentication
- Firebase Console → **Authentication** → Get Started
- Enable **Google** provider
- Enable **Email/Password** provider
- Under **Authorised domains**, add your GitHub Pages domain (e.g. `username.github.io`)

### Firestore Database
- Firebase Console → **Firestore Database** → Create database
- Start in **production mode**
- Choose region: `australia-southeast1` (Sydney)
- After creation, go to **Rules** tab and paste contents of `firestore.rules`

### Storage
- Firebase Console → **Storage** → Get started
- Choose same region as Firestore
- After creation, go to **Rules** tab and paste contents of `storage.rules`

---

## Step 3 — Get Firebase Config

1. Firebase Console → Project Settings (gear icon) → **Your apps**
2. Click **Add app** → Web (`</>`)
3. Register app name: `johnston-media-web`
4. Copy the `firebaseConfig` object

---

## Step 4 — Add Config to Files

Replace the placeholder config in **all three** files:

- `index.html` (bottom `<script type="module">`)
- `portal/index.html` (bottom `<script type="module">`)
- `admin/index.html` (bottom `<script type="module">`)

Replace this block in each file:
```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## Step 5 — Set Up Owner Account

1. Deploy the site first (Step 6 below)
2. Navigate to `/portal` and sign in with Google using `wjohnston.media@gmail.com`
3. This automatically creates your profile with **Owner** role
4. You can now access `/admin`

---

## Step 6 — Deploy to GitHub Pages

### Initial setup
```bash
# In your local project folder
git init
git add .
git commit -m "Initial Johnston Media site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Enable GitHub Pages
1. GitHub repo → **Settings** → **Pages**
2. Source: **Deploy from a branch** → `main` → `/ (root)`
3. Save — site will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`

### Admin URL
Access the admin panel at: `https://YOUR_USERNAME.github.io/YOUR_REPO/admin/`

> The admin page is only accessible by navigating directly to `/admin` — it is not linked anywhere on the public site.

---

## Step 7 — Add Authorised Domain to Firebase

1. Firebase Console → Authentication → Settings → **Authorised domains**
2. Add your GitHub Pages domain: `YOUR_USERNAME.github.io`

---

## Firestore Data Structure

```
users/
  {uid}/
    name, email, phone, role, blocked, createdAt, permissions{}

settings/
  site/
    heroTitle, heroSubtitle, heroEyebrow, heroVideoUrl
    aboutTitle, aboutText
    primaryEmail, secondaryEmail
    igUrl, ttUrl, ytUrl, footerNote

portfolio/
  sports-video/items/{id}    → title, url, type, order
  sports-photo/items/{id}
  commercial/items/{id}

quotes/
  {id}/
    clientId, clientName, clientEmail, clientPhone
    serviceType, name, date, location, budget, details
    status (Pending → Sent → Accepted → Approved)

projects/
  {id}/
    clientId, clientName, serviceType, name
    status (Planning → Shooting → Editing → Delivering → Delivered)
    files[], quoteId

messages/
  {id}/
    name, email, message, read, createdAt
```

---

## Role System

| Role         | Access |
|-------------|--------|
| **Prospective** | Submit quotes, view their own quotes |
| **Client**      | Full portal: projects, gallery, secondary contact email |
| **Admin**       | Admin panel (configurable permissions) |
| **Master Admin**| Admin panel + manage admin permissions + block/delete users |
| **Owner**       | Full access, assign Owner role. Only `wjohnston.media@gmail.com` is permanent Owner |

---

## Deploying Updates

```bash
git add .
git commit -m "Update site"
git push
```
GitHub Pages auto-deploys on push — changes live in ~1 minute.

---

## Custom Domain (Optional)

1. GitHub repo → Settings → Pages → **Custom domain**
2. Enter `johnstonmedia.com.au`
3. Add DNS records at your registrar:
   - `CNAME` → `YOUR_USERNAME.github.io`
4. Add `johnstonmedia.com.au` to Firebase Authorised domains

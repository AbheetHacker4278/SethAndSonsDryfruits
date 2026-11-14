# Deploying Seth And Sons Dryfruits to Render

This guide outlines how to deploy **Seth And Sons Dryfruits** onto **Render** to achieve **zero cold starts** on the frontend while maintaining the full Express & MongoDB backend.

---

## ⚡ Zero Cold Start Architecture

Render Free-tier Web Services go to sleep after 15 minutes of inactivity and take ~50 seconds to wake up (showing the *"Service Waking Up"* screen). 

To completely eliminate this:
1. **Frontend (Render Static Site)**:
   - Hosted on Render's global **Edge CDN**.
   - **Never sleeps** — 0ms cold start, 100% instant initial page loads for all visitors.
   - Serves the luxury black-and-gold storefront, hero videos, product catalog, and brand story immediately.
2. **Backend (Render Web Service)**:
   - Runs the Express API and connects to MongoDB Atlas at `https://sethandsonsdryfruits.onrender.com`.
   - Wakes up in the background for authenticated/dynamic requests while the user is already browsing the site.

---

## Deploying the Frontend as a Render Static Site (No Cold Start)

### Step 1: Create Static Site on Render
1. Open your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top right → select **Static Site**.
3. Connect your repository: **`AbheetHacker4278/SethAndSonsDryfruits`**.
4. Configure the settings:
   - **Name**: `seth-and-sons-dryfruits-web` (or any preferred name)
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
5. **Add Client-Side Routing Rewrite Rule (Important for SPAs)**:
   - Scroll down to **Redirects / Rewrites**.
   - Click **Add Rule**:
     - **Type**: `Rewrite`
     - **Source**: `/*`
     - **Destination**: `/index.html`
   > *This ensures routes like `/catalog`, `/orders`, `/login`, and `/admin/*` load cleanly on page refreshes.*
6. **Set Environment Variable**:
   - In the **Environment** tab of the Static Site, add:
     - `VITE_API_URL` = `https://sethandsonsdryfruits.onrender.com` *(or your Backend Web Service URL)*
7. Click **Create Static Site**.

Once built, Render will give you a public URL (e.g. `https://seth-and-sons-dryfruits-web.onrender.com`) that **loads instantly without ever spinning down**!

---

## Deploying the Backend API as a Render Web Service

If you haven't already deployed the backend Web Service:

1. Click **New +** → **Web Service**.
2. Connect `AbheetHacker4278/SethAndSonsDryfruits`.
3. Configure:
   - **Name**: `seth-and-sons-dryfruits`
   - **Runtime**: `Node`
   - **Region**: `Singapore`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
4. Add the Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `COOKIE_SECRET`: Any random 32+ character string
   - `APP_URL`: Your Frontend URL (e.g. `https://seth-and-sons-dryfruits-web.onrender.com` or custom domain)
   - `ADMIN_URL`: `https://seth-and-sons-dryfruits-web.onrender.com`
   - `EMAIL_FROM`: `abheetseth203@gmail.com`
   - `EMAIL_PROVIDER`: `brevo` or `smtp`
   - `BREVO_API_KEY` / `SMTP_*`: Your email credentials
5. Whitelist `0.0.0.0/0` in **MongoDB Atlas** → **Network Access**.

---

## Option: 1-Click Blueprint (`render.yaml`)

Both the **Static Site** and the **Web Service** are pre-configured in [`render.yaml`](./render.yaml).

1. In Render Dashboard, click **New +** → **Blueprint**.
2. Select your repository.
3. Render will automatically create both:
   - `seth-and-sons-dryfruits-web` (Static Site with SPA rewrite & `VITE_API_URL`)
   - `seth-and-sons-dryfruits` (API Web Service)
4. Provide secret credentials when prompted and click **Apply**.

---

## Keeping the Backend Warm (Optional)

To keep your free-tier Backend API awake so even dynamic login/checkout requests respond instantly:
- Set up a free monitor on [UptimeRobot](https://uptimerobot.com/) or [BetterStack](https://betterstack.com/).
- Set it to send an HTTP GET request to `https://sethandsonsdryfruits.onrender.com/api/health` every **10 minutes**.
- This completely prevents the free-tier backend from sleeping!

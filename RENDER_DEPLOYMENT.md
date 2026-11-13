# Deploying Seth And Sons Dryfruits to Render

This guide outlines how to deploy the **Seth And Sons Dryfruits** full-stack application (Vite React Storefront + Admin ERP Portal + Express API + MongoDB) onto **Render**.

---

## Architecture Overview on Render

- **Web Service Type**: Single unified Node.js Web Service.
- **Frontend**: Pre-built via Vite (`npm run build`), served with high-performance static asset caching (1-year immutable for `/assets/`, fresh revalidation for `index.html`).
- **Backend & ERP**: Express 4 server running on Node 20+ with automatic connection retry and preflight health checks.
- **Health Check Endpoint**: `/api/health` (returns database and service status).

---

## Option 1: Automatic Blueprint Deployment (Recommended)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) blueprint specification.

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top right corner and choose **Blueprint**.
3. Connect your GitHub repository: `AbheetHacker4278/SethAndSonsDryfruits`.
4. Render will read `render.yaml` and configure the web service automatically:
   - **Service Name**: `seth-and-sons-dryfruits`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Fill in the required environment variables prompted by Render (see list below).
6. Click **Apply** to trigger the initial build and deployment.

---

## Option 2: Manual Web Service Setup

If you prefer to configure the Web Service manually via the Render UI:

1. In Render Dashboard, click **New +** → **Web Service**.
2. Connect your GitHub repository: `AbheetHacker4278/SethAndSonsDryfruits`.
3. Configure the following fields:
   - **Name**: `seth-and-sons-dryfruits` (or your preferred name)
   - **Region**: `Singapore` (optimal latency for India / Jammu visitors) or `Frankfurt` / `Oregon`
   - **Branch**: `main`
   - **Root Directory**: Leave blank (repo root)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` or `Starter`
4. Expand **Advanced**:
   - **Health Check Path**: `/api/health`
   - **Auto-Deploy**: `Yes` (deploys on every `git push origin main`)
5. Add the **Environment Variables** (listed below).
6. Click **Create Web Service**.

---

## Environment Variables Reference

Add these under the **Environment** tab of your Render service:

| Variable | Required | Description / Example Value |
|---|---|---|
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | Auto | Render assigns `10000` automatically. |
| `MONGODB_URI` | **Yes** | `mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/seth_and_sons?retryWrites=true&w=majority` |
| `COOKIE_SECRET` | **Yes** | Random 32+ character string (e.g. `seth-sons-prod-session-secret-2026!`) |
| `APP_URL` | **Yes** | Your Render service URL: `https://seth-and-sons-dryfruits.onrender.com` |
| `ADMIN_URL` | Optional | Defaults to `APP_URL`. Set if using a custom admin domain. |
| `EMAIL_FROM` | **Yes** | `abheetseth203@gmail.com` |
| `EMAIL_FROM_NAME` | Optional | `Seth And Sons DryFruits` |
| `EMAIL_PROVIDER` | Optional | `smtp`, `brevo`, or `resend` (default: `smtp`) |
| `SMTP_HOST` | If SMTP | e.g. `smtp.gmail.com` or your transactional mail provider |
| `SMTP_PORT` | If SMTP | `587` (or `465` for SSL) |
| `SMTP_USER` | If SMTP | Your SMTP login username or email |
| `SMTP_PASS` | If SMTP | Your SMTP app password or API key |
| `CLOUDINARY_CLOUD_NAME` | Optional | For customer/admin image uploads |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API Secret |
| `GOOGLE_CLIENT_ID` | Optional | If enabling Google One-Tap/OAuth sign-in |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `ADMIN_SEED_EMAIL` | Optional | Default: `aseth9588@gmail.com` |
| `ADMIN_SEED_PASSWORD` | Optional | Default: `RoyalAdmin@2026!` |

---

## CRITICAL: MongoDB Atlas Network Access Configuration

Render utilizes dynamic IP addresses. If you use MongoDB Atlas, you **must allow connections from Render**:

1. Log into [cloud.mongodb.com](https://cloud.mongodb.com/).
2. Go to **Security** → **Network Access**.
3. Click **Add IP Address**.
4. Choose **Allow Access from Anywhere** (`0.0.0.0/0`).
5. Click **Confirm**.

> *Without this step, MongoDB Atlas will reject the incoming connection from Render and the application will fail health checks.*

---

## Verification After Deployment

Once Render finishes deploying:

1. **Check Health**: Navigate to `https://<your-render-url>/api/health`.
   - Expected JSON response:
     ```json
     {
       "status": "ok",
       "database": "mongodb-connected",
       "emailProvider": "smtp",
       "timestamp": "2026-..."
     }
     ```
2. **Storefront**: Open `https://<your-render-url>/`. Verify the hero video, collections, and fast initial load.
3. **Patron Login**: Test customer login at `/login`.
4. **Admin ERP Portal**: Navigate to `/admin/login` and log in with your admin credentials. Test inventory, orders, and reports.
5. **Custom Domain (Optional)**: In Render settings, click **Custom Domains** and add `sethandsonsdryfruits.com` with the CNAME record provided.


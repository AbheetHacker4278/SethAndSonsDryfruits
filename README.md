# SethAndSonsDryfruits

> **Seth And Sons DryFruits** — Premium Kashmiri Saffron, Himalayan Dry Fruits & Gourmet Reserves with full ERP Management & Concierge Storefront.

---

## 🌟 Overview

Seth And Sons DryFruits is an enterprise-grade dry fruits and spices platform featuring:
- **Luxury Customer Storefront**: Responsive catalog, dynamic 250g/500g/1kg pack selector with 40% margin pricing, custom gift box builder, verified checkout with cart drawer, live shipment tracking, and customer service portal.
- **Admin ERP Suite**: Role-based access control (Super Admin & Staff), catalog & variant editor, inventory management with stock-movement auditing & restock alerts, supplier purchase order tracking with invoice upload & automatic replenishment, financial statements (COGS, GST, P&L), and PDF/Excel/CSV exports.
- **Automated Communication & Security**: Multi-channel transactional emails, SMS/WhatsApp order concierge links, signed webhook event logging, strict CSRF token validation, NoSQL injection sanitization, and secure cookie sessions.
- **Special Shipping Rules**: Standard ₹120 shipping across India, complimentary shipping for orders $\ge$ ₹5,000, and complimentary ₹0 shipping on pure Kesar / Saffron orders.

---

## 🚀 Deploying to Vercel

This application is fully optimized for **Vercel** with single-deployment support for both **Customers (Storefront)** and **Administrators (Admin ERP Portal)**:
- **Customer Storefront**: `https://<your-project>.vercel.app/`
- **Admin ERP Portal**: `https://<your-project>.vercel.app/admin` (or `https://<your-project>.vercel.app/admin/login`)

### Step 1: Push Code to GitHub
```bash
git remote add origin https://github.com/AbheetHacker4278/SethAndSonsDryfruits.git
git branch -M main
git push -u origin main
```

### Step 2: Import into Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New** $\rightarrow$ **Project**.
2. Select the repository **`AbheetHacker4278/SethAndSonsDryfruits`**.
3. Vercel automatically detects the **Vite** framework.
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Step 3: Configure Environment Variables in Vercel
In your Vercel Project Settings under **Environment Variables**, add:

| Variable | Description | Example / Recommended Value |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `COOKIE_SECRET` | 64+ char random hex or string | `your-secret-key-32-chars-min` |
| `MONGODB_URI` | MongoDB Atlas Connection String | `mongodb+srv://<user>:<password>@cluster.mongodb.net/seth_and_sons?retryWrites=true&w=majority` |
| `APP_URL` | Deployed Storefront URL | `https://<your-project>.vercel.app` |
| `ADMIN_URL` | Deployed Admin URL | `https://<your-project>.vercel.app/admin` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `your_api_key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `your_api_secret` |
| `EMAIL_PROVIDER` | Email service (`brevo`, `resend`, `smtp`) | `brevo` |
| `BREVO_API_KEY` | Brevo API key (if using Brevo) | `xkeysib-...` |
| `EMAIL_FROM` | Sender email address | `orders@yourdomain.com` |
| `EMAIL_FROM_NAME` | Sender display name | `Seth And Sons DryFruits` |
| `ADMIN_SEED_EMAIL` | Default Super Admin bootstrap email | `aseth9588@gmail.com` |
| `ADMIN_SEED_PASSWORD` | Default Super Admin bootstrap password | `RoyalAdmin@2026!` |

### Step 4: Click Deploy
Once the build completes:
- Storefront will be live at `https://<your-project>.vercel.app`
- Admin Portal will be accessible at `https://<your-project>.vercel.app/admin`

---

## 💻 Local Development

### 1. Prerequisites
- Node.js (v20 or v22 recommended)
- MongoDB instance (Local or Atlas)

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/AbheetHacker4278/SethAndSonsDryfruits.git
cd SethAndSonsDryfruits

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
```

### 3. Start Development Servers
```bash
npm run dev
```
- **Storefront**: [http://localhost:3000](http://localhost:3000)
- **Admin ERP Portal**: [http://localhost:8000](http://localhost:8000)
- **Express Backend API**: [http://localhost:8001](http://localhost:8001)

### 4. Build & Tests
```bash
# Typecheck
npm run lint

# Production bundle build
npm run build

# Run comprehensive test suite (24 tests)
npm test
```

---

## 📜 License
Private & Proprietary — Seth And Sons DryFruits © 2026. All rights reserved.

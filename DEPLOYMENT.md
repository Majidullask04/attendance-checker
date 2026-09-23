# Deployment & Architecture Guide — MrElectric Attendance

Full-stack app: **React (Vite) frontend** + **Node/Express API** + **Neon Auth (PostgreSQL & Google OAuth)** + **JWT / JWKS security**.

---

## ⚡ Authentication Architecture

1. **Neon Auth (Google OAuth & Sessions)**:
   - Base URL: `https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth`
   - Client ID: `1091870905979-42m0jehth0k3l3o1m1tedkvj2j31gjuv.apps.googleusercontent.com`
   - Google Sign-In is handled natively through Neon Auth's social sign-in endpoints (`/sign-in/social`, `/get-session`).
   - Tokens can be validated cryptographically on the Express backend via Neon's remote JWKS endpoint:
     `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`

2. **Strict Admin Verification**:
   - Master Admin Email: `mrelectricalworks02@gmail.com`
   - Only this email automatically receives `role: 'admin'`, `is_approved = 1`, and access to Admin Approvals, live QR management, employee audits, and shift policy overrides.
   - Any other user who registers via Google OAuth is created with `role: 'user'` and `is_approved = 0` (Pending Approval). They are redirected to `PendingApproval.jsx` until the admin explicitly approves them in `AdminApprovals.jsx`.

3. **Dual-Auth Compatibility**:
   - Both Neon Google OAuth and custom email/password authentication (with bcrypt and application JWT) work side-by-side.

---

## 📦 Required Environment Variables

### Frontend (`.env` or Vercel / Render Environment)
```env
VITE_API_URL=https://your-api-backend-url.onrender.com/api
VITE_NEON_AUTH_URL=https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth
VITE_GOOGLE_CLIENT_ID=1091870905979-42m0jehth0k3l3o1m1tedkvj2j31gjuv.apps.googleusercontent.com
```

### Backend (`backend/.env` or Render / Production Environment)
```env
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-frontend-app.vercel.app,http://localhost:5173
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-delicate-cherry-ayfepet4.us-east-2.aws.neon.tech/neondb?sslmode=require
DATABASE_SSL=true
JWT_SECRET=your_super_secret_jwt_key_here
ADMIN_EMAIL=mrelectricalworks02@gmail.com
NEON_AUTH_BASE_URL=https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth
NEON_AUTH_JWKS_URL=https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json
```

---

## 🚀 Deployment Steps

### 1. Vercel (Frontend)
1. Push your repository to GitHub.
2. Import the project into Vercel.
3. Set the Root Directory to `./` or leave as default.
4. Set Environment Variables:
   - `VITE_API_URL`
   - `VITE_NEON_AUTH_URL`
   - `VITE_GOOGLE_CLIENT_ID`
5. Deploy.

### 2. Render (Backend)
1. In Render, create a new **Web Service**.
2. Set Root Directory to `backend`.
3. Set Build Command to `npm install`.
4. Set Start Command to `node server.js`.
5. Add all backend environment variables (`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, `JWT_SECRET`, `FRONTEND_URL`).
6. In your Google Cloud Console OAuth configuration, ensure authorized JavaScript origins and redirect URIs match your Vercel and Neon Auth URLs.

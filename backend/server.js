import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { verifyToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import qrRoutes from './routes/qr.js';
import attendanceRoutes from './routes/attendance.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';

// ── Allowed origins ─────────────────────────────────────────────────────────
// FRONTEND_URL may be a single origin OR a comma-separated list, so you can
// allow your production site plus any custom/preview domains without code edits.
// e.g. FRONTEND_URL="https://app.example.com,https://mrelectric-attendance.onrender.com"
const parseOrigins = (val) =>
  (val || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // trim whitespace + strip trailing slash
    .filter(Boolean);

const devOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? parseOrigins(FRONTEND_URL)
    : [...new Set([...parseOrigins(FRONTEND_URL), ...devOrigins])];

// ── Security: Force HTTPS in production ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    // Only redirect traffic we KNOW arrived over HTTP. Requests without the
    // header (e.g. Render's internal health checks) are left alone so they
    // aren't bounced with a 301 and marked unhealthy.
    if (req.header('x-forwarded-proto') === 'http') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ── Security Headers ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", ...allowedOrigins],
    },
  },
}));

// ── CORS: Restrict to configured frontend origin(s) ────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (curl, mobile apps, same-origin, health checks)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      // Allow any Vercel preview/production domain
      if (origin && origin.match(/^https:\/\/.*\.vercel\.app$/)) return callback(null, true);
      return callback(new Error(`CORS blocked: origin ${origin} is not in the allowed list`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '256kb' }));

// ── Rate Limiting: 10 requests per minute on attendance endpoints ──────────
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Rate limited to 10 attendance actions per minute.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please wait a minute.' },
});

// Public routes
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (require valid JWT)
app.use('/api/qr-token', verifyToken, qrRoutes);
app.use('/api/attendance', verifyToken, attendanceLimiter, attendanceRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), service: 'MrElectric Attendance API' });
});

app.listen(PORT, () => {
  console.log(`⚡ MrElectric Attendance API running on http://localhost:${PORT}`);
  console.log(`   CORS allowed: ${allowedOrigins.join(', ') || '(none set — set FRONTEND_URL)'}`);
  console.log(`   Rate limits: 10 req/min attendance, 20 req/min auth`);
});

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

// ── Security: Force HTTPS in production ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
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
      connectSrc: ["'self'", FRONTEND_URL],
    },
  },
}));

// ── CORS: Restrict to frontend origin ──────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [FRONTEND_URL]
  : [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

app.use(
  cors({
    origin: allowedOrigins,
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
  console.log(`   CORS allowed: ${FRONTEND_URL}`);
  console.log(`   Rate limits: 10 req/min attendance, 20 req/min auth`);
});

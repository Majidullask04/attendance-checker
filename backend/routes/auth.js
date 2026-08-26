import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../db.js';
import { signToken, verifyToken, requireAdmin } from '../middleware/auth.js';

const router = Router();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@localhost';
const SALT_ROUNDS = 12;

// ── Helper: hash password ───────────────────────────────────────────────────
async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// ── POST /api/auth/signup ───────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password, department } = req.body;

  // Validation
  if (!name?.trim() || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }
  if (!email?.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if email already exists
    const existing = await db.getAsync(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    const id = `emp-${randomUUID().slice(0, 6)}`;
    const passwordHash = await hashPassword(password);
    const isAdmin = normalizedEmail === ADMIN_EMAIL.toLowerCase();
    const role = isAdmin ? 'admin' : 'user';
    const avatar = isAdmin ? '👑' : '👷';
    const deviceId = `dev-${id}`;

    await db.runAsync(
      `INSERT INTO users (id, email, password_hash, name, role, department, avatar, device_id, is_approved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, normalizedEmail, passwordHash, name.trim(), role, department || 'Electrical', avatar, deviceId, isAdmin ? 1 : 0]
    );

    res.status(201).json({
      message: isAdmin
        ? 'Admin account created successfully.'
        : 'Account created successfully. Please wait for admin approval before signing in.',
      user: {
        id,
        email: normalizedEmail,
        name: name.trim(),
        role,
        isApproved: isAdmin ? 1 : 0,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await db.getAsync(`SELECT * FROM users WHERE email = $1`, [normalizedEmail]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check approval
    if (!user.is_approved) {
      return res.status(403).json({
        error: 'Your account is pending admin approval. Please contact your administrator.',
        code: 'PENDING_APPROVAL',
      });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        deviceId: user.device_id,
        isApproved: user.is_approved,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during authentication.' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.getAsync(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User record not found.' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        deviceId: user.device_id,
        isApproved: user.is_approved,
      },
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ── GET /api/auth/pending  (admin only) ────────────────────────────────────
router.get('/pending', verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.allAsync(
      `SELECT id, email, name, department, avatar, created_at FROM users WHERE is_approved = 0 AND role = 'user' ORDER BY created_at DESC`
    );
    res.json({ users });
  } catch (err) {
    console.error('Fetch pending error:', err);
    res.status(500).json({ error: 'Failed to fetch pending users.' });
  }
});

// ── POST /api/auth/approve/:id  (admin only) ───────────────────────────────
router.post('/approve/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.runAsync(
      `UPDATE users SET is_approved = 1 WHERE id = $1 AND role = 'user'`,
      [req.params.id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found or already approved.' });
    }
    res.json({ message: 'User approved successfully.' });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Failed to approve user.' });
  }
});

// ── POST /api/auth/reject/:id  (admin only) ────────────────────────────────
router.post('/reject/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.runAsync(
      `DELETE FROM users WHERE id = $1 AND role = 'user' AND is_approved = 0`,
      [req.params.id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found or cannot be rejected.' });
    }
    res.json({ message: 'User registration rejected and removed.' });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Failed to reject user.' });
  }
});

export default router;

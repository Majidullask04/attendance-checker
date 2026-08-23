import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { signToken, verifyToken } from '../middleware/auth.js';

const router = Router();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@localhost';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const isAdmin = normalizedEmail === ADMIN_EMAIL.toLowerCase();

  try {
    let user = await db.getAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

    // If user does not exist yet, auto-provision
    if (!user) {
      const id = `emp-${randomUUID().slice(0, 6)}`;
      const prefix = normalizedEmail.split('@')[0];
      const name = isAdmin
        ? 'Mr. Electrical Admin'
        : prefix
            .split(/[._-]/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || 'Technician';

      const role = isAdmin ? 'admin' : 'user';
      const department = isAdmin ? 'Management' : 'Electrical';
      const avatar = isAdmin ? '👑' : '👷';
      const deviceId = `dev-${id}`;

      await db.runAsync(
        `INSERT INTO users (id, email, name, role, department, avatar, device_id) VALUES (?,?,?,?,?,?,?)`,
        [id, normalizedEmail, name, role, department, avatar, deviceId]
      );

      user = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [id]);
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
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during authentication.' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.getAsync(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
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
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

export default router;

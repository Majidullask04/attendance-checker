import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../db.js';
import { signToken, verifyToken, requireAdmin } from '../middleware/auth.js';
import { isInvalidName, cleanUserName } from '../utils/formatters.js';

const router = Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'mrelectricalworks02@gmail.com').toLowerCase();
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
    const existing = await db.getAsync(`SELECT * FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    const id = `emp-${randomUUID().slice(0, 6)}`;
    const passwordHash = await hashPassword(password);
    const isAdmin = normalizedEmail === ADMIN_EMAIL;
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
    const user = await db.getAsync(`SELECT * FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check approval
    if (!user.is_approved && user.role !== 'admin') {
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

// ── POST /api/auth/neon-sync ────────────────────────────────────────────────
// Synchronizes Neon Auth Google user with database & checks admin approval
router.post('/neon-sync', async (req, res) => {
  const { email, name, avatar } = req.body;

  if (!email?.trim() || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const isAdmin = normalizedEmail === ADMIN_EMAIL;
  const resolvedName = cleanUserName(name, normalizedEmail);

  try {
    let user = await db.getAsync(`SELECT * FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);

    if (!user) {
      // Create new employee record for first-time Google sign-in
      const id = `emp-${randomUUID().slice(0, 6)}`;
      const role = isAdmin ? 'admin' : 'user';
      const userAvatar = avatar || (isAdmin ? '👑' : '👷');
      const deviceId = `dev-${id}`;
      const isApproved = isAdmin ? 1 : 0;

      await db.runAsync(
        `INSERT INTO users (id, email, password_hash, name, role, department, avatar, device_id, is_approved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, normalizedEmail, null, resolvedName, role, isAdmin ? 'Management' : 'Electrical', userAvatar, deviceId, isApproved]
      );

      user = await db.getAsync(`SELECT * FROM users WHERE id = $1`, [id]);
    } else {
      // User exists. Auto-heal name if existing name is an invalid hash/token or if clean name is available
      const currentIsBad = isInvalidName(user.name);
      if (currentIsBad || (resolvedName && user.name !== resolvedName && !isInvalidName(resolvedName))) {
        await db.runAsync(`UPDATE users SET name = $1 WHERE id = $2`, [resolvedName, user.id]);
        user.name = resolvedName;
      }
      if (avatar && (!user.avatar || user.avatar === '👷') && avatar !== '👷') {
        await db.runAsync(`UPDATE users SET avatar = $1 WHERE id = $2`, [avatar, user.id]);
        user.avatar = avatar;
      }
      if (isAdmin && (!user.is_approved || user.role !== 'admin')) {
        // Ensure admin email is always approved with admin role
        await db.runAsync(`UPDATE users SET role = 'admin', is_approved = 1 WHERE id = $1`, [user.id]);
        user.role = 'admin';
        user.is_approved = 1;
      }
    }

    const cleanName = cleanUserName(user.name, user.email);
    user.name = cleanName;

    // If not approved and not admin, return pending approval status
    if (!user.is_approved && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Your Google account is pending admin approval before access is granted.',
        code: 'PENDING_APPROVAL',
        user: {
          id: user.id,
          email: user.email,
          name: cleanName,
          role: user.role,
          department: user.department,
          avatar: user.avatar,
          isApproved: 0,
        },
      });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: cleanName,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        deviceId: user.device_id,
        isApproved: user.is_approved,
      },
    });
  } catch (err) {
    console.error('Neon sync error:', err);
    res.status(500).json({ error: 'Failed to synchronize user session.' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    let user = null;
    if (req.user?.id) {
      user = await db.getAsync(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    }
    if (!user && req.user?.email) {
      user = await db.getAsync(`SELECT * FROM users WHERE LOWER(email) = $1`, [req.user.email.toLowerCase()]);
    }

    if (!user) {
      // If user came via Neon token but hasn't synced yet, return token user info
      const fallbackName = cleanUserName(req.user.name, req.user.email);
      return res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          name: fallbackName,
          role: req.user.role,
          department: req.user.department || 'Electrical',
          avatar: req.user.avatar || '👷',
          isApproved: req.user.isApproved || 0,
        },
      });
    }

    const safeName = cleanUserName(user.name, user.email);
    // Auto-update if DB name was an unreadable hash
    if (isInvalidName(user.name) && safeName !== user.name) {
      db.runAsync(`UPDATE users SET name = $1 WHERE id = $2`, [safeName, user.id]).catch(() => {});
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: safeName,
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
    const cleanedUsers = (users || []).map((u) => {
      const safeName = cleanUserName(u.name, u.email);
      if (isInvalidName(u.name)) {
        db.runAsync(`UPDATE users SET name = $1 WHERE id = $2`, [safeName, u.id]).catch(() => {});
      }
      return {
        ...u,
        name: safeName,
      };
    });
    res.json({ users: cleanedUsers });
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

// ── DELETE /api/auth/users/:id  (admin only) ───────────────────────────────
router.delete('/users/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.runAsync(
      `DELETE FROM users WHERE id = $1 AND role = 'user'`,
      [req.params.id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found or cannot be deleted (admins cannot be deleted).' });
    }
    await db.runAsync(`DELETE FROM attendance_records WHERE user_id = $1`, [req.params.id]);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ── PUT /api/auth/profile ──────────────────────────────────────────────────
router.put('/profile', verifyToken, async (req, res) => {
  const { name, department, avatar } = req.body;
  const userId = req.user?.id;
  const userEmail = req.user?.email;

  if (!userId && !userEmail) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const resolvedName = cleanUserName(name, userEmail);

  try {
    const targetUser = userId
      ? await db.getAsync('SELECT * FROM users WHERE id = $1', [userId])
      : await db.getAsync('SELECT * FROM users WHERE LOWER(email) = $1', [userEmail.toLowerCase()]);

    if (!targetUser) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    const updatedName = resolvedName || targetUser.name;
    const updatedDept = department?.trim() || targetUser.department;
    const updatedAvatar = avatar?.trim() || targetUser.avatar;

    await db.runAsync(
      `UPDATE users SET name = $1, department = $2, avatar = $3 WHERE id = $4`,
      [updatedName, updatedDept, updatedAvatar, targetUser.id]
    );

    res.json({
      message: 'Profile updated successfully.',
      user: {
        ...targetUser,
        name: updatedName,
        department: updatedDept,
        avatar: updatedAvatar,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

export default router;


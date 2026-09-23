import jwt from 'jsonwebtoken';
import * as jose from 'jose';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'mrelectric_secure_jwt_token_key_2026_dev';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'mrelectricalworks02@gmail.com').toLowerCase();
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL || 'https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json';

// Initialize remote JWKS for Neon Auth token validation
let remoteJWKS = null;
try {
  if (NEON_AUTH_JWKS_URL) {
    remoteJWKS = jose.createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
  }
} catch (err) {
  console.warn('Could not initialize Neon JWKS remote key set:', err.message);
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
      avatar: user.avatar,
      deviceId: user.device_id || user.deviceId,
      isApproved: user.is_approved ?? user.isApproved ?? 1,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authentication token provided.' });
  }

  const token = authHeader.slice(7);

  // 1. Try verifying with local JWT_SECRET first
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (_localErr) {
    // Not a local secret token or expired; proceed to check Neon Auth JWKS
  }

  // 2. Try verifying with Neon Auth JWKS
  if (remoteJWKS) {
    try {
      const { payload } = await jose.jwtVerify(token, remoteJWKS);
      const email = (payload.email || '').toLowerCase();
      const isAdmin = email === ADMIN_EMAIL;

      // Look up user in database
      let dbUser = null;
      try {
        dbUser = await db.getAsync('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
      } catch (_dbErr) {
        // Continue with token payload if DB lookup fails
      }

      req.user = {
        id: dbUser ? dbUser.id : (payload.sub || `neon-${email}`),
        email: email,
        name: dbUser ? dbUser.name : (payload.name || email.split('@')[0]),
        role: isAdmin ? 'admin' : (dbUser?.role || 'user'),
        department: dbUser?.department || 'Electrical',
        avatar: dbUser?.avatar || (isAdmin ? '👑' : '👷'),
        isApproved: isAdmin ? 1 : (dbUser?.is_approved ?? 0),
        authProvider: 'neon_google',
      };

      return next();
    } catch (_neonErr) {
      // Both verifications failed
    }
  }

  return res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  next();
}

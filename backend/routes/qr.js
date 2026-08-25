import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// POST /api/qr-token/regenerate  (Admin only)
router.post('/regenerate', requireAdmin, async (req, res) => {
  const { locationId = 'loc-001', locationName = 'Main HQ & Warehouse' } = req.body;

  try {
    // 1. Deactivate all existing tokens immediately
    await db.runAsync(`UPDATE qr_tokens SET is_active = 0`);

    // 2. Generate new cryptographic token (compact for QR scanning)
    const token = `tok_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO qr_tokens (id, token, location_id, location_name, generated_by, generated_at, is_active) VALUES ($1,$2,$3,$4,$5,$6,1)`,
      [id, token, locationId, locationName, req.user.id, now]
    );

    res.json({
      token,
      locationId,
      locationName,
      generatedAt: now,
    });
  } catch (err) {
    console.error('Error generating new QR token:', err);
    res.status(500).json({ error: 'Failed to generate new QR token.' });
  }
});

// GET /api/qr-token/current  (Any authenticated user)
router.get('/current', async (req, res) => {
  try {
    let row = await db.getAsync(
      `SELECT * FROM qr_tokens WHERE is_active = 1 ORDER BY generated_at DESC LIMIT 1`
    );

    // If none active, generate default
    if (!row) {
      const token = `tok_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO qr_tokens (id, token, location_id, location_name, generated_by, generated_at, is_active) VALUES ($1,$2,$3,$4,$5,$6,1)`,
        [id, token, 'loc-001', 'Main HQ & Warehouse', req.user.id || 'system', now]
      );
      row = { token, location_id: 'loc-001', location_name: 'Main HQ & Warehouse', generated_at: now };
    }

    res.json({
      token: row.token,
      locationId: row.location_id,
      locationName: row.location_name || 'Main Warehouse',
      generatedAt: row.generated_at,
    });
  } catch (err) {
    console.error('Error fetching current QR token:', err);
    res.status(500).json({ error: 'Failed to retrieve active QR token.' });
  }
});

export default router;

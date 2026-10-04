const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'mrelectricalworks02@gmail.com').toLowerCase();

/**
 * Checks if a string represents an internal hash, token, ID, or invalid name.
 */
export function isInvalidName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;

  // Technical internal hashes or token prefixes
  if (/^(usr_|tok_|emp-|dev-|neon-|rec-|loc-|session_|auth_)/i.test(trimmed)) return true;

  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;

  // Hex or alphanumeric hashes/tokens without spaces (20+ chars), including Google avatar hashes
  if (/^[0-9a-zA-Z_=\.-]{20,}$/.test(trimmed)) return true;

  // Pure numeric string (e.g. Google sub numeric ID)
  if (/^\d{6,}$/.test(trimmed)) return true;

  // Email address mistakenly saved as name
  if (trimmed.includes('@')) return true;

  // Generic unhelpful placeholders
  if (/^(unknown|null|undefined|anonymous|user|technician|staff|technician staff|default|\[object Object\])$/i.test(trimmed)) return true;

  return false;
}

/**
 * Derives or sanitizes a human-readable employee name.
 * If name is valid, it formats it cleanly (Title Case).
 * If name is missing or an unknown ID/hash, it extracts and capitalizes the name from email.
 */
export function cleanUserName(name, email) {
  if (name && typeof name === 'string' && !isInvalidName(name)) {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (cleaned.length >= 2) {
      if (cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase()) {
        return cleaned
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }
      return cleaned;
    }
  }

  // Derive human-readable name from email
  if (email && typeof email === 'string' && email.includes('@')) {
    const lowerEmail = email.toLowerCase().trim();
    if (lowerEmail === ADMIN_EMAIL) {
      return 'Mr. Electric (Admin)';
    }

    const usernamePart = lowerEmail.split('@')[0];
    const words = usernamePart
      .replace(/[._\d-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length > 0) {
      const formatted = words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (formatted.length >= 2) return formatted;
    }
  }

  return 'Technician Staff';
}

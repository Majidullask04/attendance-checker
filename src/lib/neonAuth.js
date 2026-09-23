import { ADMIN_EMAIL } from '../config/auth.js';

export const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL || 'https://ep-delicate-cherry-ayfepet4.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1091870905979-42m0jehth0k3l3o1m1tedkvj2j31gjuv.apps.googleusercontent.com';

export const isNeonAuthLive = Boolean(
  NEON_AUTH_URL && !NEON_AUTH_URL.includes('placeholder')
);

// Admin Email verification list
export const ADMIN_EMAILS = [
  ADMIN_EMAIL.toLowerCase(),
  'mrelectricalworks02@gmail.com',
  'admin@mrelectric.com',
  'superadmin@mrelectric.com',
];

export function checkIsAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * Initiates Google OAuth with Neon Auth
 */
export async function signInWithGoogle() {
  if (!isNeonAuthLive) {
    console.warn('Neon Auth base URL not configured. Running in simulation mode.');
    return { needsModal: true };
  }

  try {
    const callbackURL = window.location.origin;
    const response = await fetch(`${NEON_AUTH_URL}/sign-in/social`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin,
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: 'google',
        callbackURL: callbackURL,
        newUserCallbackURL: callbackURL,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Neon Auth failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data?.url) {
      // Redirect browser to Neon Auth Google initiation URL
      window.location.href = data.url;
      return { redirected: true };
    }

    return { data };
  } catch (error) {
    console.error('Neon Auth Google sign in error:', error);
    throw error;
  }
}

/**
 * Checks for an active Neon Auth session
 */
export async function getNeonSession() {
  if (!isNeonAuthLive) return null;

  try {
    const response = await fetch(`${NEON_AUTH_URL}/get-session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.session ? data : null;
  } catch (_err) {
    return null;
  }
}

/**
 * Signs out from Neon Auth
 */
export async function signOutFromNeon() {
  if (!isNeonAuthLive) return;

  try {
    await fetch(`${NEON_AUTH_URL}/sign-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
  } catch (err) {
    console.warn('Neon Auth sign out error:', err);
  }
}

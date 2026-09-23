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
 * Initiates Google OAuth Sign-In
 * First tries native Google Identity Services popup using GOOGLE_CLIENT_ID;
 * Falls back to Neon Auth redirect if GIS is unavailable.
 */
export async function signInWithGoogle() {
  // Option 1: Native Google Identity Services OAuth2 Token Popup
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    return new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile openid',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              console.warn('Google token error:', tokenResponse.error);
              if (tokenResponse.error === 'popup_closed_by_user') {
                return reject(new Error('Sign-in popup was closed. Please try again.'));
              }
              return reject(new Error(tokenResponse.error_description || tokenResponse.error));
            }

            try {
              // Fetch user profile from Google with access token
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await userInfoRes.json();
              resolve({
                profile: {
                  email: profile.email,
                  name: profile.name || profile.email?.split('@')[0],
                  avatar: profile.picture,
                },
                token: tokenResponse.access_token,
              });
            } catch (fetchErr) {
              reject(fetchErr);
            }
          },
        });

        client.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        console.warn('GIS init failed, falling back to Neon Auth redirect:', err);
        signInWithNeonRedirect().then(resolve).catch(reject);
      }
    });
  }

  // Option 2: Fall back to Neon Auth redirect
  return signInWithNeonRedirect();
}

/**
 * Fallback: Initiates Google OAuth via Neon Auth redirect
 */
export async function signInWithNeonRedirect() {
  if (!isNeonAuthLive) {
    console.warn('Neon Auth base URL not configured.');
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

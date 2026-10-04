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

import { cleanUserName } from '../utils/formatters.js';


export function decodeGoogleJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (_e) {
    return null;
  }
}

/**
 * Waits for Google Identity Services SDK to initialize if still loading.
 */
function waitForGoogleAccounts(timeoutMs = 1200) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);

  return new Promise((resolve) => {
    const interval = 80;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve(window.google.accounts.oauth2);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

/**
 * Initiates Google OAuth Sign-In
 * First tries native Google Identity Services popup using GOOGLE_CLIENT_ID;
 * Falls back to Neon Auth redirect if GIS is unavailable.
 */
export async function signInWithGoogle() {
  const oauth2 = await waitForGoogleAccounts();

  // Option 1: Native Google Identity Services OAuth2 Token Popup
  if (oauth2) {
    return new Promise((resolve, reject) => {
      try {
        const client = oauth2.initTokenClient({
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
              let profile = null;
              const accessToken = tokenResponse.access_token;

              // 1. Fetch user profile from Google with access token
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (res.ok) profile = await res.json();
              } catch (e) {
                console.warn('v3 userinfo fetch failed:', e);
              }

              // 2. Fallback to OpenID Connect userinfo endpoint if needed
              if (!profile || !profile.email) {
                try {
                  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  if (res.ok) profile = await res.json();
                } catch (e) {
                  console.warn('OIDC userinfo fetch failed:', e);
                }
              }

              // 3. Fallback to decoding id_token if available
              const idTokenPayload = tokenResponse.id_token ? decodeGoogleJwt(tokenResponse.id_token) : null;

              const email = (profile?.email || idTokenPayload?.email || '').trim().toLowerCase();
              if (!email) {
                throw new Error('Google did not return an authorized email address.');
              }

              // Scrape human name from Google account profile fields
              const rawName =
                profile?.name ||
                [profile?.given_name, profile?.family_name].filter(Boolean).join(' ') ||
                profile?.displayName ||
                idTokenPayload?.name ||
                [idTokenPayload?.given_name, idTokenPayload?.family_name].filter(Boolean).join(' ');

              const cleanName = cleanUserName(rawName, email);
              const avatar = profile?.picture || idTokenPayload?.picture || '👷';

              resolve({
                profile: {
                  email,
                  name: cleanName,
                  avatar,
                },
                token: accessToken,
              });
            } catch (fetchErr) {
              console.error('Google profile extraction failed:', fetchErr);
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
    if (!data) return null;
    
    // Normalize user object location
    const user = data.user || data.session?.user;
    if (data.session && user) {
      return { ...data, user };
    }
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

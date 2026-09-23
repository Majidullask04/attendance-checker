import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAIL } from '../config/auth.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo-attendance.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key-placeholder';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && 
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('demo-attendance')
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured with live env keys. Running in browser simulation mode.');
    // Demo simulation for Google Auth
    return {
      data: null,
      error: null,
      simulated: true,
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  return { data, error, simulated: false };
}

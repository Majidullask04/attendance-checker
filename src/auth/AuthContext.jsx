import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { supabase, isSupabaseConfigured, checkIsAdminEmail, signInWithGoogle } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [authProvider, setAuthProvider] = useState('local'); // 'local' | 'supabase_google'

  useEffect(() => {
    // 1. Check Supabase active session first if configured
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          handleSupabaseUser(session.user);
          setIsLoading(false);
        } else {
          checkLocalToken();
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          handleSupabaseUser(session.user);
        }
      });

      return () => subscription?.unsubscribe();
    } else {
      checkLocalToken();
    }
  }, []);

  const checkLocalToken = () => {
    const token = localStorage.getItem('attendance_token');
    if (token) {
      api.me()
        .then((data) => {
          if (data.user.isApproved) {
            const isAdmin = checkIsAdminEmail(data.user.email) || data.user.role === 'admin';
            setUser({
              ...data.user,
              role: isAdmin ? 'admin' : 'user',
              isAdminVerified: isAdmin,
            });
          } else {
            localStorage.removeItem('attendance_token');
            setPendingApproval(true);
          }
        })
        .catch(() => {
          localStorage.removeItem('attendance_token');
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  };

  const handleSupabaseUser = (sbUser) => {
    const email = sbUser.email || '';
    const isAdmin = checkIsAdminEmail(email);
    const formattedUser = {
      id: sbUser.id,
      email: email,
      name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0],
      avatar: sbUser.user_metadata?.avatar_url || '👤',
      role: isAdmin ? 'admin' : 'user',
      department: sbUser.user_metadata?.department || (isAdmin ? 'Management' : 'Field Operations'),
      isApproved: true,
      isAdminVerified: isAdmin,
      authProvider: 'google',
    };
    setUser(formattedUser);
    setAuthProvider('supabase_google');
    setPendingApproval(false);
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.simulated) {
        // Simulated Google login for instant local demonstration
        const email = prompt('Enter Google Account email to test sign-in (use mrelectricalworks02@gmail.com for admin access):', 'mrelectricalworks02@gmail.com');
        if (!email) {
          setIsLoading(false);
          return;
        }
        const isAdmin = checkIsAdminEmail(email);
        const simUser = {
          id: `goog_${Date.now()}`,
          email: email.trim(),
          name: email.split('@')[0],
          avatar: '⚡',
          role: isAdmin ? 'admin' : 'user',
          department: isAdmin ? 'Executive Admin' : 'Field Technician',
          isApproved: true,
          isAdminVerified: isAdmin,
          authProvider: 'google_simulated',
        };
        setUser(simUser);
        setAuthProvider('google_simulated');
        localStorage.setItem('attendance_token', `sim_token_${simUser.id}`);
      }
    } catch (err) {
      console.error('Google sign in error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const data = await api.login(email, password);
      localStorage.setItem('attendance_token', data.token);
      const isAdmin = checkIsAdminEmail(data.user.email) || data.user.role === 'admin';
      setUser({
        ...data.user,
        role: isAdmin ? 'admin' : 'user',
        isAdminVerified: isAdmin,
      });
      setPendingApproval(false);
      setAuthProvider('local');
      return data.user;
    } catch (err) {
      if (err.message?.includes('PENDING_APPROVAL')) {
        setPendingApproval(true);
      }
      throw err;
    }
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase signout error:', e);
      }
    }
    localStorage.removeItem('attendance_token');
    setUser(null);
    setPendingApproval(false);
  };

  const isAdmin = Boolean(user && user.isAdminVerified && user.role === 'admin');

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        logout,
        isLoading,
        pendingApproval,
        isAdmin,
        isUser: !isAdmin,
        isAuthenticated: !!user,
        authProvider,
        isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

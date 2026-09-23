import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';
import {
  signInWithGoogle,
  getNeonSession,
  signOutFromNeon,
  checkIsAdminEmail,
  isNeonAuthLive,
} from '../lib/neonAuth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [authProvider, setAuthProvider] = useState('local'); // 'local' | 'neon_google'
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        // Check for OAuth error in URL query
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const urlError = urlParams.get('error_description') || urlParams.get('error');
          if (urlError) {
            setAuthError(`Google authentication error: ${urlError}`);
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }

        // 1. Check Neon Auth active session first (handles Google OAuth redirect return)
        if (isNeonAuthLive) {
          const neonData = await getNeonSession();
          if (neonData?.user && isMounted) {
            await handleNeonGoogleUser(neonData.user);
            setIsLoading(false);
            return;
          }
        }

        // 2. Check local/existing JWT token in storage
        if (isMounted) {
          checkLocalToken();
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
        if (isMounted) {
          checkLocalToken();
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNeonGoogleUser = async (neonUser) => {
    const email = (neonUser.email || '').trim().toLowerCase();
    const isAdmin = checkIsAdminEmail(email);

    try {
      // Sync with application backend to verify DB record and approval status
      const syncResult = await api.neonSync({
        email: email,
        name: neonUser.name || email.split('@')[0],
        avatar: neonUser.avatar || neonUser.image || (isAdmin ? '⚡' : '👷'),
      });

      if (syncResult?.token) {
        localStorage.setItem('attendance_token', syncResult.token);
      }

      const formattedUser = {
        ...syncResult.user,
        role: isAdmin ? 'admin' : (syncResult.user?.role || 'user'),
        isAdminVerified: isAdmin,
        authProvider: 'neon_google',
      };

      setUser(formattedUser);
      setAuthProvider('neon_google');
      setPendingApproval(false);
    } catch (err) {
      if (err.message?.includes('PENDING_APPROVAL') || err.message?.includes('pending admin approval')) {
        setPendingApproval(true);
        setUser(null);
      } else {
        console.error('Neon user sync error:', err);
        // Fallback profile if backend sync fails temporarily
        if (isAdmin) {
          const fallbackAdmin = {
            id: `neon-${email}`,
            email: email,
            name: neonUser.name || email.split('@')[0],
            avatar: neonUser.avatar || neonUser.image || '⚡',
            role: 'admin',
            department: 'Management',
            isApproved: true,
            isAdminVerified: true,
            authProvider: 'neon_google',
          };
          setUser(fallbackAdmin);
          setAuthProvider('neon_google');
          setPendingApproval(false);
        } else {
          setPendingApproval(true);
        }
      }
    }
  };

  const checkLocalToken = () => {
    const token = localStorage.getItem('attendance_token');
    if (token) {
      api.me()
        .then((data) => {
          if (data.user?.isApproved || checkIsAdminEmail(data.user?.email)) {
            const isAdmin = checkIsAdminEmail(data.user.email) || data.user.role === 'admin';
            setUser({
              ...data.user,
              role: isAdmin ? 'admin' : 'user',
              isAdminVerified: isAdmin,
            });
            setPendingApproval(false);
          } else {
            localStorage.removeItem('attendance_token');
            setPendingApproval(true);
            setUser(null);
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

  const loginWithGoogle = async (customPayload = null) => {
    setIsLoading(true);
    setAuthError('');
    try {
      if (customPayload && customPayload.email) {
        const email = customPayload.email.trim().toLowerCase();
        const isAdmin = checkIsAdminEmail(email);

        try {
          const syncResult = await api.neonSync({
            email: email,
            name: customPayload.name || email.split('@')[0],
            avatar: customPayload.avatar || (isAdmin ? '⚡' : '👷'),
          });

          if (syncResult?.token) {
            localStorage.setItem('attendance_token', syncResult.token);
          }

          const simUser = {
            ...syncResult.user,
            role: isAdmin ? 'admin' : 'user',
            isAdminVerified: isAdmin,
            authProvider: 'neon_google',
          };
          setUser(simUser);
          setAuthProvider('neon_google');
          setPendingApproval(false);
          return { success: true, user: simUser };
        } catch (syncErr) {
          if (syncErr.message?.includes('PENDING_APPROVAL') || syncErr.message?.includes('pending admin approval')) {
            setPendingApproval(true);
            setUser(null);
            return { pending: true };
          }
          throw syncErr;
        }
      }

      const result = await signInWithGoogle();
      if (result?.profile) {
        await handleNeonGoogleUser(result.profile);
        return { success: true };
      }
      if (result?.needsModal) {
        return { needsModal: true };
      }
      return result;
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
    await signOutFromNeon();
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
        isNeonAuthLive,
        authError,
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

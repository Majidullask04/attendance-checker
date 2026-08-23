import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('attendance_token');
    if (token) {
      api.me()
        .then((data) => {
          if (data.user.isApproved) {
            setUser(data.user);
          } else {
            // Token exists but user not approved — clear it
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
  }, []);

  const login = async (email, password) => {
    try {
      const data = await api.login(email, password);
      localStorage.setItem('attendance_token', data.token);
      setUser(data.user);
      setPendingApproval(false);
      return data.user;
    } catch (err) {
      if (err.message?.includes('PENDING_APPROVAL')) {
        setPendingApproval(true);
      }
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('attendance_token');
    setUser(null);
    setPendingApproval(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isLoading,
        pendingApproval,
        isAdmin: user?.role === 'admin',
        isUser: user?.role === 'user',
        isAuthenticated: !!user,
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

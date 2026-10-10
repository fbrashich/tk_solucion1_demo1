import React, { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      getMe()
        .then((userData) => setCurrentUser(userData))
        .catch((err) => {
          console.warn("No se pudo obtener el perfil de usuario:", err);
          setCurrentUser(null);
        });
    } else {
      localStorage.removeItem('token');
      setCurrentUser(null);
    }
  }, [token]);

  const login = (newToken) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      token, 
      user: currentUser, 
      isAdmin: currentUser?.role === 'admin',
      login, 
      logout, 
      isAuthenticated: !!token 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

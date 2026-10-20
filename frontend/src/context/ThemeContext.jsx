import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const THEME_KEY = 'iot_theme';

function getInitialTheme() {
  // 1. Verificar localStorage
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  // 2. Verificar cookie iot_theme
  const match = document.cookie.match(new RegExp('(^| )' + THEME_KEY + '=([^;]+)'));
  if (match && (match[2] === 'light' || match[2] === 'dark')) {
    return match[2];
  }
  // 3. Por defecto absoluto: 'dark' (para preservar 100% el modo oscuro sin regresión)
  return 'dark';
}

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    }

    // Persistir en localStorage
    localStorage.setItem(THEME_KEY, theme);

    // Persistir en Cookie con vigencia 1 año para sincronización con Nginx Gateway
    document.cookie = `${THEME_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      toggleTheme,
      isDark: theme === 'dark',
      isLight: theme === 'light'
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Always dark — enterprise infrastructure tooling standard.
  // Anti-FOUC is handled by the inline script in index.html.
  const [theme] = useState('dark');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
    // Keep localStorage synced so the anti-FOUC script in index.html
    // always reads the correct value on next hard refresh.
    window.localStorage.setItem('weds-theme', 'dark');
  }, []);

  const value = useMemo(() => ({ theme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

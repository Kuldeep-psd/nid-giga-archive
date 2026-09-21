import { useEffect, useRef, useState } from 'react';

const key = 'giga-archive-theme';
const valid = value => ['light', 'dark'].includes(value) ? value : null;
function preference() {
  try { return valid(localStorage.getItem(key)); } catch { return null; }
}
export function useTheme() {
  const chosen = useRef(preference());
  const [theme, setTheme] = useState(() => typeof document === 'undefined' ? 'light' : document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setTheme(chosen.current || (system.matches ? 'dark' : 'light'));
    const storage = event => {
      if (event.key !== key && event.key !== null) return;
      chosen.current = valid(event.newValue);
      sync();
    };
    system.addEventListener('change', sync);
    window.addEventListener('storage', storage);
    sync();
    return () => { system.removeEventListener('change', sync); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101010' : '#fafbfc');
  }, [theme]);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    chosen.current = next;
    try { localStorage.setItem(key, next); } catch {}
    setTheme(next);
  };
  return { theme, toggle };
}

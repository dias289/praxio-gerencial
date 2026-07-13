'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const novo = !dark;
    setDark(novo);
    document.documentElement.classList.toggle('dark', novo);
    try { localStorage.setItem('tema', novo ? 'dark' : 'light'); } catch {}
  }

  return (
    <button onClick={toggle} title={dark ? 'Modo claro' : 'Modo escuro'}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

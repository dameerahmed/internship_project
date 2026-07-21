import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button onClick={toggleTheme} className="rounded-full border border-zinc-200 bg-white/70 p-2 text-zinc-700 shadow-sm transition hover:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200" aria-label="Toggle theme">
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

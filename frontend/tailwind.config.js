/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ─── EDS Engine Design Token System ────────────────────────────────
      colors: {
        eds: {
          // Core backgrounds (darkest → lightest)
          bg:          '#06080d',
          surface:     '#090b12',
          'surface-2': '#0c0f18',
          panel:       '#0e1220',
          'panel-2':   '#111628',
          elevated:    '#151b2e',

          // Borders
          border:      'rgba(255,255,255,0.07)',
          'border-2':  'rgba(255,255,255,0.12)',
          'border-3':  'rgba(255,255,255,0.18)',

          // Text
          text:        '#f1f5f9',
          'text-2':    '#cbd5e1',
          muted:       '#64748b',
          faint:       '#334155',

          // Primary accent — Indigo
          accent:      '#6366f1',
          'accent-2':  '#818cf8',
          'accent-dim':'rgba(99,102,241,0.12)',
          'accent-ring':'rgba(99,102,241,0.30)',

          // Success — Emerald
          success:     '#10b981',
          'success-2': '#34d399',
          'success-dim':'rgba(16,185,129,0.12)',

          // Danger — Rose
          danger:      '#f43f5e',
          'danger-2':  '#fb7185',
          'danger-dim':'rgba(244,63,94,0.12)',

          // Warning — Amber
          warning:     '#f59e0b',
          'warning-2': '#fbbf24',
          'warning-dim':'rgba(245,158,11,0.12)',

          // Info — Sky
          info:        '#38bdf8',
          'info-dim':  'rgba(56,189,248,0.12)',
        },
      },

      // ─── Font Families ───────────────────────────────────────────────
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },

      // ─── Box Shadows ────────────────────────────────────────────────
      boxShadow: {
        'eds-sm':  '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'eds':     '0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        'eds-md':  '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        'eds-lg':  '0 20px 60px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)',
        'eds-xl':  '0 32px 90px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.6)',
        'eds-glow-indigo': '0 0 0 1px rgba(99,102,241,0.2), 0 4px 20px rgba(99,102,241,0.15)',
        'eds-glow-emerald':'0 0 0 1px rgba(16,185,129,0.2), 0 4px 20px rgba(16,185,129,0.15)',
        'eds-glow-rose':   '0 0 0 1px rgba(244,63,94,0.2),  0 4px 20px rgba(244,63,94,0.15)',
      },

      // ─── Border Radius ──────────────────────────────────────────────
      borderRadius: {
        'eds-sm': '8px',
        'eds':    '12px',
        'eds-md': '16px',
        'eds-lg': '20px',
        'eds-xl': '24px',
      },

      // ─── Animations ─────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':       { opacity: '1',   transform: 'scale(1.08)' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'pop-in': {
          '0%':   { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.25s ease-out both',
        'fade-up':       'fade-up 0.35s ease-out both',
        'shimmer':       'shimmer 1.4s linear infinite',
        'spin-slow':     'spin-slow 12s linear infinite',
        'pulse-ring':    'pulse-ring 3s ease-in-out infinite',
        'slide-in-left': 'slide-in-left 0.25s ease-out both',
        'slide-in-right':'slide-in-right 0.25s ease-out both',
        'pop-in':        'pop-in 0.2s ease-out both',
      },

      // ─── Backdrop Blur ──────────────────────────────────────────────
      backdropBlur: {
        'eds': '16px',
      },
    },
  },
  plugins: [],
}

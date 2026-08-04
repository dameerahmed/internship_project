import React from 'react';

export default function BrandLogo({ size = 44 }) {
  const uid = 'eds-logo';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="EDS Engine"
      role="img"
    >
      <defs>
        {/* Primary gradient: indigo → emerald */}
        <linearGradient id={`${uid}-g1`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>

        {/* Accent gradient for arcs */}
        <linearGradient id={`${uid}-g2`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        {/* Glow filter */}
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Subtle shadow for center node */}
        <filter id={`${uid}-shadow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="shadow" />
          <feFlood floodColor="#6366f1" floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="shadow" operator="in" result="coloredShadow" />
          <feMerge>
            <feMergeNode in="coloredShadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer pulsing ring — subtle */}
      <circle
        cx="32" cy="32" r="26"
        stroke={`url(#${uid}-g1)`}
        strokeWidth="1"
        fill="none"
        opacity="0.18"
      />

      {/* Middle orbit ring */}
      <circle
        cx="32" cy="32" r="18"
        stroke={`url(#${uid}-g1)`}
        strokeWidth="1.5"
        fill="none"
        opacity="0.30"
        strokeDasharray="3 4"
      />

      {/* Inner ring with gradient */}
      <circle
        cx="32" cy="32" r="11"
        stroke={`url(#${uid}-g1)`}
        strokeWidth="1.5"
        fill="none"
        opacity="0.55"
      />

      {/* Center node — dark fill + gradient overlay */}
      <circle cx="32" cy="32" r="6.5" fill="#06080d" />
      <circle
        cx="32" cy="32" r="5.5"
        fill={`url(#${uid}-g1)`}
        filter={`url(#${uid}-shadow)`}
        opacity="0.95"
      />

      {/* Top connection arc — indigo */}
      <path
        d="M18 27 Q24 18 36 23"
        stroke="#818cf8"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* Bottom connection arc — emerald */}
      <path
        d="M46 37 Q40 46 28 41"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* Endpoint dots */}
      <circle cx="18" cy="27" r="2" fill="#6366f1" opacity="0.8" />
      <circle cx="46" cy="37" r="2" fill="#10b981" opacity="0.8" />
    </svg>
  );
}

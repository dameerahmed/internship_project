import React from 'react';

export default function BrandLogo({ size = 44 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="g1" x1="0" x2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <filter id="f1" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b" />
        </filter>
      </defs>

      {/* outer loop */}
      <path
        d="M12 32c0-11 9-20 20-20s20 9 20 20-9 20-20 20S12 43 12 32z"
        stroke="url(#g1)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.12"
      />

      {/* inner signal node */}
      <circle cx="32" cy="32" r="8" fill="#0f172a" />
      <circle cx="32" cy="32" r="6" fill="url(#g1)" filter="url(#f1)" />

      {/* two lightning arcs forming a routed connection */}
      <path d="M20 26c4-6 12-8 18-4" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 38c-4 6-12 8-18 4" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />

      {/* subtle pulse ring */}
      <g opacity="0.14">
        <circle cx="32" cy="32" r="14" stroke="#10b981" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
  // kept single BrandLogo definition (size-based) above

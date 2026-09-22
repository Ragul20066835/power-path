import React from 'react';

/**
 * Component Schematic and Realistic Icon Graphics (Pure SVG)
 * High-definition electronics visuals without any external asset dependencies.
 */

export function ComponentIcon({ type, size = 48, className = '' }) {
  const baseProps = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className: `component-svg-icon ${className}`
  };

  switch (type) {
    case 'battery':
      return (
        <svg {...baseProps}>
          {/* Battery Body */}
          <rect x="18" y="16" width="28" height="38" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
          <rect x="22" y="20" width="20" height="30" rx="2" fill="#0f172a" />
          {/* Terminals */}
          <rect x="23" y="10" width="6" height="6" rx="1" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
          <rect x="35" y="10" width="6" height="6" rx="1" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
          {/* Label & Polarity */}
          <text x="26" y="28" fill="#f59e0b" fontSize="9" fontWeight="800" textAnchor="middle">+</text>
          <text x="38" y="28" fill="#94a3b8" fontSize="9" fontWeight="800" textAnchor="middle">-</text>
          <text x="32" y="42" fill="#38bdf8" fontSize="8" fontWeight="700" textAnchor="middle" fontFamily="monospace">9V</text>
          {/* Energy Bar */}
          <rect x="24" y="45" width="16" height="3" rx="1.5" fill="#10b981" />
        </svg>
      );

    case 'switch':
      return (
        <svg {...baseProps}>
          {/* Switch Base */}
          <rect x="12" y="20" width="40" height="24" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
          {/* Contact Terminals */}
          <circle cx="22" cy="32" r="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
          <circle cx="42" cy="32" r="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
          {/* Toggle Blade (Open/Ready position) */}
          <line x1="22" y1="32" x2="38" y2="20" stroke="#00ffcc" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="22" cy="32" r="2" fill="#00ffcc" />
          {/* Labels */}
          <text x="32" y="52" fill="#94a3b8" fontSize="7" fontWeight="600" textAnchor="middle" fontFamily="monospace">SPST</text>
        </svg>
      );

    case 'resistor':
      return (
        <svg {...baseProps}>
          {/* Leads */}
          <line x1="4" y1="32" x2="16" y2="32" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="48" y1="32" x2="60" y2="32" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          {/* Resistor Body */}
          <rect x="16" y="22" width="32" height="20" rx="6" fill="#d97706" stroke="#b45309" strokeWidth="1.5" />
          {/* 330 Ohm Color Bands: Orange, Orange, Brown, Gold */}
          <rect x="21" y="22" width="3.5" height="20" fill="#ea580c" />
          <rect x="27" y="22" width="3.5" height="20" fill="#ea580c" />
          <rect x="33" y="22" width="3.5" height="20" fill="#78350f" />
          <rect x="40" y="22" width="3.5" height="20" fill="#fbbf24" />
          {/* Schematic Zigzag Overlay in Center */}
          <path d="M22 14 L26 10 L30 18 L34 10 L38 18 L42 14" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="32" y="54" fill="#38bdf8" fontSize="8" fontWeight="700" textAnchor="middle" fontFamily="monospace">330Ω</text>
        </svg>
      );

    case 'led':
      return (
        <svg {...baseProps}>
          {/* Base & Leads */}
          <line x1="26" y1="46" x2="26" y2="58" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="38" y1="46" x2="38" y2="54" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          {/* LED Epoxy Bulb */}
          <path d="M20 44 C20 44, 20 22, 32 16 C44 22, 44 44, 44 44 Z" fill="#ef4444" stroke="#f87171" strokeWidth="1.5" fillOpacity="0.85" />
          <rect x="18" y="42" width="28" height="4" rx="1.5" fill="#dc2626" stroke="#b91c1c" strokeWidth="1" />
          {/* Glow Core */}
          <ellipse cx="32" cy="30" rx="6" ry="9" fill="#fca5a5" fillOpacity="0.75" />
          {/* Photon Emission Arrows */}
          <path d="M42 20 L48 14 M45 14 L48 14 L48 17" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M45 28 L51 22 M48 22 L51 22 L51 25" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'ammeter':
      return (
        <svg {...baseProps}>
          {/* Dial Gauge */}
          <circle cx="32" cy="32" r="24" fill="#0f172a" stroke="#00ffcc" strokeWidth="2.5" />
          <circle cx="32" cy="32" r="19" fill="#1e293b" />
          {/* Measurement Tick Marks */}
          <path d="M19 32 A13 13 0 0 1 45 32" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 3" fill="none" />
          {/* Needle Deflection */}
          <line x1="32" y1="32" x2="40" y2="24" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3" fill="#ef4444" />
          {/* Symbol 'A' */}
          <text x="32" y="44" fill="#00ffcc" fontSize="12" fontWeight="900" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif">A</text>
          <text x="32" y="12" fill="#94a3b8" fontSize="6" fontWeight="700" textAnchor="middle" fontFamily="monospace">mA</text>
        </svg>
      );

    case 'voltmeter':
      return (
        <svg {...baseProps}>
          {/* Dial Gauge (Decoy) */}
          <circle cx="32" cy="32" r="24" fill="#0f172a" stroke="#eab308" strokeWidth="2.5" />
          <circle cx="32" cy="32" r="19" fill="#1e293b" />
          {/* Ticks */}
          <path d="M19 32 A13 13 0 0 1 45 32" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 3" fill="none" />
          {/* Needle */}
          <line x1="32" y1="32" x2="26" y2="22" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3" fill="#eab308" />
          {/* Symbol 'V' */}
          <text x="32" y="44" fill="#eab308" fontSize="12" fontWeight="900" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif">V</text>
          <text x="32" y="12" fill="#94a3b8" fontSize="6" fontWeight="700" textAnchor="middle" fontFamily="monospace">VOLTS</text>
        </svg>
      );

    case 'capacitor':
      return (
        <svg {...baseProps}>
          {/* Leads */}
          <line x1="26" y1="46" x2="26" y2="58" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="38" y1="46" x2="38" y2="58" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          {/* Aluminum Can Body */}
          <rect x="20" y="12" width="24" height="34" rx="4" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
          <rect x="20" y="12" width="6" height="34" fill="#334155" />
          {/* Cathode Negative Stripe */}
          <line x1="23" y1="18" x2="23" y2="40" stroke="#ef4444" strokeWidth="2" strokeDasharray="2 3" />
          <text x="34" y="32" fill="#94a3b8" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="monospace">100μF</text>
        </svg>
      );

    case 'inductor':
      return (
        <svg {...baseProps}>
          {/* Leads */}
          <line x1="6" y1="32" x2="16" y2="32" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="48" y1="32" x2="58" y2="32" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          {/* Ferrite Core Cylinder */}
          <rect x="18" y="24" width="28" height="16" rx="3" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
          {/* Copper Windings */}
          <ellipse cx="23" cy="32" rx="3" ry="9" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          <ellipse cx="29" cy="32" rx="3" ry="9" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          <ellipse cx="35" cy="32" rx="3" ry="9" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          <ellipse cx="41" cy="32" rx="3" ry="9" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
          <text x="32" y="54" fill="#f59e0b" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="monospace">10mH</text>
        </svg>
      );

    case 'ground':
      return (
        <svg {...baseProps}>
          {/* Main Lead Stem */}
          <line x1="32" y1="8" x2="32" y2="28" stroke="#00ffcc" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="8" r="2.5" fill="#00ffcc" />
          {/* Earth Ground Horizontal Stepped Bars */}
          <line x1="14" y1="28" x2="50" y2="28" stroke="#00ffcc" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="20" y1="36" x2="44" y2="36" stroke="#00ffcc" strokeWidth="3" strokeLinecap="round" />
          <line x1="26" y1="44" x2="38" y2="44" stroke="#00ffcc" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="30" y1="50" x2="34" y2="50" stroke="#00ffcc" strokeWidth="2" strokeLinecap="round" />
          {/* Ground Reference Label */}
          <text x="32" y="60" fill="#38bdf8" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="monospace">GND (0V)</text>
        </svg>
      );

    default:
      return (
        <svg {...baseProps}>
          <circle cx="32" cy="32" r="20" stroke="#64748b" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
      );
  }
}

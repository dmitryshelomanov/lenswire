export function FeatureIcon({ index }: { index: number }) {
  const common = {
    width: 32,
    height: 32,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'text-ink',
    'aria-hidden': true as const,
  };

  switch (index) {
    case 0:
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M11 18.5h2" />
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          <rect x="4.5" y="10" width="15" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          <path d="M8 7 3.5 12 8 17" />
          <path d="M16 7l4.5 5L16 17" />
          <path d="M13 5l-2 14" />
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
          <path d="M18 7v4M6 17v-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3 5 6.5v5c0 4.2 2.8 7.8 7 9 4.2-1.2 7-4.8 7-9v-5L12 3z" />
        </svg>
      );
  }
}

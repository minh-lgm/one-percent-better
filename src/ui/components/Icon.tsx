// Inline SVG icons (A-D12: no icon font, nothing loaded from outside).
const PATHS = {
  today: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></>,
  review: <path d="M5 20v-8M12 20V5M19 20v-12" />,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  play: <path d="M8 5l11 7-11 7z" fill="currentColor" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  bell: <><path d="M6 17v-6a6 6 0 0112 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  up: <path d="M12 19V6M6 11l6-6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></>,
  upload: <><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 19h16" /></>,
  offline: <><path d="M5 12a9 9 0 0114-7M19 12a9 9 0 01-14 7" /><path d="M4 4l16 16" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" /></>,
  restore: <><path d="M4 10a8 8 0 1 1 2.3 5.7" /><path d="M4 4v6h6" /></>,
  sync: <><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" /><path d="M20 4v4h-4M4 20v-4h4" /></>,
  lockOpen: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>,
  // v2 (M7) sync indicator, from mockup 09-account.html
  cloudCheck: <><path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117.2 8.6 4.5 4.5 0 0117 18z" /><path d="M9.5 13.2l2 2 3.5-3.7" /></>,
  cloudDot: <><path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117.2 8.6 4.5 4.5 0 0117 18z" /><path d="M12 13.5h.01" strokeWidth="3.5" /></>,
  cloudOff: <><path d="M7 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117.2 8.6 4.5 4.5 0 0117 18z" /><path d="M4 4l16 16" /></>,
  warn: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'ic' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

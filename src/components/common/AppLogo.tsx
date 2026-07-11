interface AppLogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

/** AurisLeft brand mark — left ear + sound waves */
export default function AppLogo({
  size = 28,
  className = '',
  showWordmark = false,
  wordmarkClassName = '',
}: AppLogoProps) {
  return (
    <span className={`app-logo ${className}`.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        className="app-logo__mark"
        aria-hidden={!showWordmark}
        role="img"
      >
        <title>AurisLeft</title>
        <defs>
          <linearGradient id="appLogoBg" x1="32" y1="20" x2="228" y2="240" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F0B35A" />
            <stop offset="48%" stopColor="#E8A54B" />
            <stop offset="100%" stopColor="#9B8CFF" />
          </linearGradient>
          <linearGradient id="appLogoSheen" x1="64" y1="28" x2="180" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="appLogoEar" x1="88" y1="56" x2="176" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF8EF" />
            <stop offset="100%" stopColor="#F2E4D0" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#appLogoBg)" />
        <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#appLogoSheen)" />
        <circle cx="128" cy="132" r="78" fill="#0C0E12" opacity="0.12" />
        <path
          d="M148 58C118 54 92 72 84 100C76 128 84 152 96 168C108 184 118 196 118 210C118 220 126 226 136 224C148 222 152 210 148 198C142 180 138 170 148 156C164 136 170 118 166 98C162 74 158 60 148 58Z"
          fill="url(#appLogoEar)"
        />
        <path
          d="M132 96C120 98 112 110 114 124C116 138 126 146 138 144C146 142 150 134 148 126C146 116 140 110 132 112C128 114 126 120 128 126"
          stroke="#C98B3E"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.55"
        />
        <path d="M72 108C60 120 60 144 72 156" stroke="#FFF8EF" strokeWidth="8" strokeLinecap="round" opacity="0.95" />
        <path d="M56 92C36 114 36 150 56 172" stroke="#FFF8EF" strokeWidth="7" strokeLinecap="round" opacity="0.72" />
        <path d="M42 78C14 108 14 156 42 186" stroke="#FFF8EF" strokeWidth="6" strokeLinecap="round" opacity="0.42" />
        <circle cx="174" cy="78" r="7" fill="#FFF8EF" opacity="0.95" />
        <path
          d="M178 78V54C186 50 196 48 202 52V74"
          stroke="#FFF8EF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="198" cy="74" r="7" fill="#FFF8EF" />
      </svg>
      {showWordmark && (
        <span className={`app-logo__wordmark ${wordmarkClassName}`.trim()}>AurisLeft</span>
      )}
    </span>
  );
}

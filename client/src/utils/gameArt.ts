type ArtMotif =
  | 'hex'
  | 'tiles'
  | 'wings'
  | 'gears'
  | 'orbit'
  | 'waves'
  | 'track'
  | 'cards'
  | 'grid'
  | 'forest'
  | 'arch';

interface ArtSpec {
  bgStart: string;
  bgEnd: string;
  accentA: string;
  accentB: string;
  ink: string;
  motif: ArtMotif;
  tag: string;
}

function buildMotifSvg(spec: ArtSpec): string {
  const { accentA, accentB } = spec;
  switch (spec.motif) {
    case 'hex':
      return `
        <g opacity="0.9">
          <polygon points="110,36 146,56 146,98 110,118 74,98 74,56" fill="${accentA}" opacity="0.28"/>
          <polygon points="184,36 220,56 220,98 184,118 148,98 148,56" fill="${accentB}" opacity="0.34"/>
          <polygon points="147,98 183,118 183,160 147,180 111,160 111,118" fill="${accentA}" opacity="0.48"/>
          <polygon points="221,98 257,118 257,160 221,180 185,160 185,118" fill="${accentB}" opacity="0.22"/>
          <circle cx="147" cy="139" r="14" fill="#FAF8F4" opacity="0.82"/>
        </g>`;
    case 'tiles':
      return `
        <g transform="translate(88 26) rotate(12)" opacity="0.88">
          <rect x="0" y="0" width="54" height="54" rx="8" fill="${accentA}" opacity="0.45"/>
          <rect x="64" y="0" width="54" height="54" rx="8" fill="${accentB}" opacity="0.72"/>
          <rect x="0" y="64" width="54" height="54" rx="8" fill="${accentB}" opacity="0.3"/>
          <rect x="64" y="64" width="54" height="54" rx="8" fill="${accentA}" opacity="0.85"/>
          <circle cx="91" cy="27" r="12" fill="#FAF8F4" opacity="0.85"/>
          <path d="M91 74 L106 91 L91 108 L76 91 Z" fill="#FAF8F4" opacity="0.85"/>
        </g>`;
    case 'wings':
      return `
        <g opacity="0.88">
          <path d="M62 152 C95 62, 195 32, 266 54 C216 92, 166 122, 62 152 Z" fill="${accentA}" opacity="0.38"/>
          <path d="M84 166 C125 94, 206 72, 272 92 C226 126, 178 148, 84 166 Z" fill="${accentB}" opacity="0.65"/>
          <circle cx="102" cy="64" r="22" fill="${accentB}" opacity="0.3"/>
        </g>`;
    case 'orbit':
      return `
        <g opacity="0.9">
          <circle cx="192" cy="96" r="56" fill="${accentA}" opacity="0.72"/>
          <circle cx="176" cy="80" r="14" fill="${accentB}" opacity="0.5"/>
          <circle cx="212" cy="112" r="9" fill="#FAF8F4" opacity="0.35"/>
          <ellipse cx="168" cy="108" rx="116" ry="30" transform="rotate(-18 168 108)" fill="none" stroke="#FAF8F4" stroke-width="2.5" opacity="0.55"/>
          <circle cx="88" cy="128" r="7" fill="${accentB}"/>
        </g>`;
    case 'gears':
      return `
        <g opacity="0.86">
          <circle cx="122" cy="114" r="46" fill="none" stroke="${accentA}" stroke-width="14" stroke-dasharray="16 10"/>
          <circle cx="122" cy="114" r="18" fill="${accentB}" opacity="0.8"/>
          <circle cx="208" cy="78" r="32" fill="none" stroke="${accentB}" stroke-width="10" stroke-dasharray="12 8"/>
          <line x1="50" y1="158" x2="270" y2="158" stroke="${accentA}" stroke-width="3" opacity="0.5"/>
        </g>`;
    case 'track':
      return `
        <g opacity="0.9">
          <path d="M24 148 C90 148, 96 52, 178 52 C240 52, 244 128, 304 128" fill="none" stroke="${accentA}" stroke-width="22" stroke-linecap="round" opacity="0.35"/>
          <path d="M24 148 C90 148, 96 52, 178 52 C240 52, 244 128, 304 128" fill="none" stroke="${accentB}" stroke-width="4" stroke-dasharray="12 10"/>
          <circle cx="178" cy="52" r="10" fill="#FAF8F4"/>
        </g>`;
    case 'cards':
      return `
        <g opacity="0.92">
          <rect x="86" y="42" width="66" height="96" rx="10" transform="rotate(-14 119 90)" fill="${accentA}" opacity="0.65"/>
          <rect x="132" y="36" width="66" height="96" rx="10" transform="rotate(4 165 84)" fill="${accentB}" opacity="0.88"/>
          <rect x="176" y="46" width="66" height="96" rx="10" transform="rotate(18 209 94)" fill="#FAF8F4" opacity="0.25"/>
          <circle cx="165" cy="84" r="15" fill="#FAF8F4" opacity="0.9"/>
        </g>`;
    case 'grid':
      return `
        <g transform="translate(76 34)" opacity="0.88">
          <rect x="0" y="0" width="48" height="32" rx="6" fill="${accentA}" opacity="0.8"/>
          <rect x="58" y="0" width="48" height="32" rx="6" fill="#FAF8F4" opacity="0.3"/>
          <rect x="116" y="0" width="48" height="32" rx="6" fill="${accentB}" opacity="0.85"/>
          <rect x="0" y="42" width="48" height="32" rx="6" fill="#FAF8F4" opacity="0.3"/>
          <rect x="58" y="42" width="48" height="32" rx="6" fill="${accentB}" opacity="0.7"/>
          <rect x="116" y="42" width="48" height="32" rx="6" fill="#FAF8F4" opacity="0.3"/>
          <rect x="0" y="84" width="48" height="32" rx="6" fill="${accentA}" opacity="0.4"/>
          <rect x="58" y="84" width="48" height="32" rx="6" fill="${accentA}" opacity="0.85"/>
          <rect x="116" y="84" width="48" height="32" rx="6" fill="#1F2421" opacity="0.65"/>
        </g>`;
    case 'forest':
      return `
        <g opacity="0.9">
          <path d="M84 156 L118 68 L152 156 Z" fill="${accentA}" opacity="0.72"/>
          <path d="M138 156 L178 46 L218 156 Z" fill="${accentB}" opacity="0.85"/>
          <path d="M196 156 L226 84 L256 156 Z" fill="${accentA}" opacity="0.5"/>
          <circle cx="88" cy="54" r="14" fill="#FAF8F4" opacity="0.75"/>
        </g>`;
    case 'arch':
      return `
        <g opacity="0.88">
          <path d="M74 160 V94 A42 42 0 0 1 158 94 V160 Z" fill="${accentA}" opacity="0.48"/>
          <path d="M142 160 V78 A50 50 0 0 1 242 78 V160 Z" fill="${accentB}" opacity="0.65"/>
          <circle cx="192" cy="78" r="14" fill="#FAF8F4" opacity="0.85"/>
        </g>`;
    default:
      return `
        <g opacity="0.85">
          <path d="M0 120 Q80 76 160 116 T320 108 V200 H0 Z" fill="${accentA}" opacity="0.45"/>
          <path d="M0 144 Q90 108 180 140 T320 132 V200 H0 Z" fill="${accentB}" opacity="0.65"/>
        </g>`;
  }
}

export function createTabletopArt(spec: ArtSpec): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${spec.bgStart}"/>
        <stop offset="100%" stop-color="${spec.bgEnd}"/>
      </linearGradient>
    </defs>
    <rect width="320" height="200" fill="url(#bg)"/>
    <circle cx="290" cy="24" r="76" fill="#FFFFFF" opacity="0.06"/>
    ${buildMotifSvg(spec)}
    <rect x="16" y="162" width="66" height="20" rx="10" fill="#1F2421" opacity="0.28"/>
    <text x="49" y="176" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9" font-weight="700" letter-spacing="0.08em" fill="${spec.ink}" opacity="0.92">${spec.tag}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

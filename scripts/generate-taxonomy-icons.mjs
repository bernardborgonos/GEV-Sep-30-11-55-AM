import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve('public/assets/icons');
fs.mkdirSync(outputDir, { recursive: true });

// 1. Tactical Operations Center (TOC) Icon SVG
const tocSvg = `
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="tocGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
    </radialGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Outer Hexagonal Frame -->
  <polygon points="128,12 232,72 232,184 128,244 24,184 24,72" fill="url(#tocGlow)" stroke="#f43f5e" stroke-width="6"/>
  <polygon points="128,24 220,78 220,178 128,232 36,178 36,78" fill="#090d16" fill-opacity="0.85" stroke="#f43f5e" stroke-width="2" stroke-dasharray="6,4"/>

  <!-- Tactical Reticle & Cardinal Ticks -->
  <circle cx="128" cy="128" r="76" stroke="#f43f5e" stroke-opacity="0.4" stroke-width="2"/>
  <circle cx="128" cy="128" r="48" stroke="#f43f5e" stroke-opacity="0.6" stroke-width="1.5"/>
  <line x1="128" y1="40" x2="128" y2="60" stroke="#f43f5e" stroke-width="4"/>
  <line x1="128" y1="196" x2="128" y2="216" stroke="#f43f5e" stroke-width="4"/>
  <line x1="40" y1="128" x2="60" y2="128" stroke="#f43f5e" stroke-width="4"/>
  <line x1="196" y1="128" x2="216" y2="128" stroke="#f43f5e" stroke-width="4"/>

  <!-- Shield Shape in Center -->
  <path d="M128 64 L172 84 C172 136 128 176 128 176 C128 176 84 136 84 84 Z" fill="url(#shieldGrad)" stroke="#ffffff" stroke-width="3" filter="url(#glow)"/>

  <!-- Five Point Tactical Star in Shield -->
  <polygon points="128,92 133,108 150,108 136,118 141,134 128,124 115,134 120,118 106,108 123,108" fill="#ffffff"/>

  <!-- Tactical Corner Accents -->
  <path d="M38 82 L50 82 L50 70" stroke="#fb7185" stroke-width="3" fill="none"/>
  <path d="M218 82 L206 82 L206 70" stroke="#fb7185" stroke-width="3" fill="none"/>
  <path d="M38 174 L50 174 L50 186" stroke="#fb7185" stroke-width="3" fill="none"/>
  <path d="M218 174 L206 174 L206 186" stroke="#fb7185" stroke-width="3" fill="none"/>

  <!-- Text / Code Badge -->
  <rect x="96" y="196" width="64" height="20" rx="4" fill="#1e293b" stroke="#f43f5e" stroke-width="1.5"/>
  <text x="128" y="210" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#ffffff" text-anchor="middle" letter-spacing="2">TOC</text>
</svg>
`;

// 2. 3D Early Warning Radar Station Icon SVG
const radarSvg = `
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#021c2d" stop-opacity="0.95"/>
    </radialGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Circular Outer Tactical Scope -->
  <circle cx="128" cy="128" r="114" fill="url(#radarGlow)" stroke="#00e5ff" stroke-width="6"/>
  <circle cx="128" cy="128" r="104" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="4,4"/>
  <circle cx="128" cy="128" r="82" stroke="#00e5ff" stroke-opacity="0.5" stroke-width="2"/>
  <circle cx="128" cy="128" r="54" stroke="#00e5ff" stroke-opacity="0.7" stroke-width="2"/>
  <circle cx="128" cy="128" r="26" stroke="#00e5ff" stroke-opacity="0.9" stroke-width="2"/>

  <!-- Compass Crosshairs -->
  <line x1="128" y1="16" x2="128" y2="240" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="2"/>
  <line x1="16" y1="128" x2="240" y2="128" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="2"/>

  <!-- Rotating Radar Sweep Sector (45 deg) -->
  <path d="M128 128 L204 52 A108 108 0 0 0 128 20 Z" fill="#00e5ff" fill-opacity="0.25"/>

  <!-- Radar Dish Assembly Centerpiece -->
  <path d="M84 156 Q128 116 172 156" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none" filter="url(#cyanGlow)"/>
  <path d="M128 136 L128 88" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="128" cy="84" r="8" fill="#38bdf8" stroke="#ffffff" stroke-width="3"/>

  <!-- Wave Emissions -->
  <path d="M112 68 Q128 54 144 68" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M102 54 Q128 36 154 54" stroke="#00e5ff" stroke-width="3.5" fill="none" stroke-linecap="round"/>

  <!-- Radar Dish Mount / Pylon Base -->
  <polygon points="110,154 146,154 154,196 102,196" fill="url(#cyanGrad)" stroke="#ffffff" stroke-width="2.5"/>
  <line x1="94" y1="196" x2="162" y2="196" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>

  <!-- Blip Targets -->
  <circle cx="168" cy="74" r="5" fill="#f43f5e" stroke="#ffffff" stroke-width="1.5" filter="url(#cyanGlow)"/>
  <circle cx="82" cy="100" r="4" fill="#eab308" stroke="#ffffff" stroke-width="1.5"/>

  <!-- Label Badge -->
  <rect x="94" y="206" width="68" height="18" rx="4" fill="#09182a" stroke="#00e5ff" stroke-width="1.5"/>
  <text x="128" y="219" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="10" fill="#00e5ff" text-anchor="middle" letter-spacing="1.5">RADAR</text>
</svg>
`;

// 3. Coastal Cardinal Navigational Buoy Icon SVG
const buoySvg = `
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="buoyGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#031622" stop-opacity="0.95"/>
    </radialGradient>
    <filter id="lightGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Outer Compass Ring Frame -->
  <circle cx="128" cy="128" r="114" fill="url(#buoyGlow)" stroke="#eab308" stroke-width="6"/>
  <circle cx="128" cy="128" r="106" stroke="#00e5ff" stroke-width="2" stroke-dasharray="4,4"/>

  <!-- Beacon Light Rays at Top -->
  <circle cx="128" cy="38" r="12" fill="#fef08a" filter="url(#lightGlow)"/>
  <line x1="128" y1="20" x2="128" y2="10" stroke="#facc15" stroke-width="4" stroke-linecap="round"/>
  <line x1="146" y1="26" x2="156" y2="18" stroke="#facc15" stroke-width="4" stroke-linecap="round"/>
  <line x1="110" y1="26" x2="100" y2="18" stroke="#facc15" stroke-width="4" stroke-linecap="round"/>

  <!-- Topmark: Cardinal Cones (North Cardinal: Two cones pointing UP) -->
  <polygon points="128,42 110,64 146,64" fill="#0f172a" stroke="#ffffff" stroke-width="2.5"/>
  <polygon points="128,66 110,88 146,88" fill="#0f172a" stroke="#ffffff" stroke-width="2.5"/>

  <!-- Buoy Tower / Lattice Structure -->
  <!-- Upper Yellow Section -->
  <polygon points="116,92 140,92 144,124 112,124" fill="#eab308" stroke="#ffffff" stroke-width="2.5"/>
  <!-- Middle Black Band Section -->
  <polygon points="112,124 144,124 148,154 108,154" fill="#0f172a" stroke="#ffffff" stroke-width="2.5"/>
  <!-- Lower Yellow Section / Float Hull -->
  <polygon points="108,154 148,154 164,188 92,188" fill="#eab308" stroke="#ffffff" stroke-width="2.5"/>

  <!-- Waterline Rings & Waves -->
  <path d="M60 190 Q94 180 128 190 T196 190" stroke="#00e5ff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M48 206 Q88 194 128 206 T208 206" stroke="#0284c7" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M72 222 Q100 214 128 222 T184 222" stroke="#0369a1" stroke-width="3" stroke-linecap="round" fill="none"/>

  <!-- Cardinal Sector Indicator Badge -->
  <rect x="94" y="158" width="68" height="18" rx="4" fill="#09182a" stroke="#eab308" stroke-width="1.5"/>
  <text x="128" y="171" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" fill="#fef08a" text-anchor="middle" letter-spacing="1.5">NORTH</text>
</svg>
`;

async function main() {
  await sharp(Buffer.from(tocSvg))
    .png()
    .toFile(path.join(outputDir, 'tactical_toc_icon.png'));
  console.log('✓ tactical_toc_icon.png generated');

  await sharp(Buffer.from(radarSvg))
    .png()
    .toFile(path.join(outputDir, 'radar_station_icon.png'));
  console.log('✓ radar_station_icon.png generated');

  await sharp(Buffer.from(buoySvg))
    .png()
    .toFile(path.join(outputDir, 'maritime_buoy_icon.png'));
  console.log('✓ maritime_buoy_icon.png generated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

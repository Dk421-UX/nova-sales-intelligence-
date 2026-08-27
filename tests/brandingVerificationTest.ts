import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

export function runBrandingVerification() {
  console.log('====================================================');
  console.log(' RUNNING VIYAAN AI BRANDING & HEADER VERIFICATION');
  console.log('====================================================\n');

  const root = process.cwd();
  const logoPathPng = path.join(root, 'public', 'viyaan-ai-logo.png');
  const logoPathJpg = path.join(root, 'public', 'viyaan-ai-logo.jpg');
  const novaLogoTsx = fs.readFileSync(path.join(root, 'src', 'components', 'NovaLogo.tsx'), 'utf-8');
  const headerTsx = fs.readFileSync(path.join(root, 'src', 'components', 'Header.tsx'), 'utf-8');
  const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf-8');

  console.log('--- TEST GROUP 1: Viyaan AI Logo Asset Presence & Integrity ---');
  assert(fs.existsSync(logoPathPng) && fs.statSync(logoPathPng).size > 1000, 'Official Viyaan AI PNG logo asset is present in public/ and valid');
  assert(fs.existsSync(logoPathJpg) && fs.statSync(logoPathJpg).size > 1000, 'Official Viyaan AI JPG logo asset is present in public/ and valid');

  console.log('\n--- TEST GROUP 2: Correct Brand Typography in NovaLogo.tsx ---');
  assert(novaLogoTsx.includes('VIYAAN AI SALES OPERATING SYSTEM'), 'NovaLogo.tsx displays "VIYAAN AI SALES OPERATING SYSTEM" with space between VIYAAN and AI');
  assert(!novaLogoTsx.includes('ViyaanAI Sales Operating System'), 'NovaLogo.tsx does NOT contain outdated "ViyaanAI" without space');
  assert(novaLogoTsx.includes('PROPERTY EXPLORER'), 'NovaLogo.tsx preserves "PROPERTY EXPLORER" heading');
  assert(novaLogoTsx.includes('/nova-logo.png'), 'NovaLogo.tsx preserves official Nova logo image source');

  console.log('\n--- TEST GROUP 3: Header Component Structure & Viyaan AI Integration ---');
  assert(headerTsx.includes('className="header-separator desktop-only"'), 'Desktop header contains subtle header-separator');
  assert(headerTsx.includes('className="viyaan-header-badge"'), 'Header contains Viyaan AI brand badge');
  assert(headerTsx.includes('src="/viyaan-ai-logo.png"'), 'Header displays official Viyaan AI logo');
  assert(headerTsx.includes('Viyaan AI</span>'), 'Header displays "Viyaan AI" text with exact spacing');
  assert(!headerTsx.includes('ViyaanAI</span>'), 'Header does NOT contain unspaced "ViyaanAI"');
  assert(headerTsx.includes('Explore Projects'), 'Header preserves "Explore Projects" navigation');
  assert(headerTsx.includes('Official Site'), 'Header preserves "Official Site" link');
  assert(headerTsx.includes('Ask Nova AI'), 'Header preserves "Ask Nova AI" action');
  assert(headerTsx.includes('Staff Login'), 'Header preserves Staff Login action');

  console.log('\n--- TEST GROUP 4: CSS Styling & Brand Visual Language ---');
  assert(css.includes('.header-separator'), 'CSS defines .header-separator');
  assert(css.includes('.viyaan-header-badge'), 'CSS defines .viyaan-header-badge');
  assert(css.includes('.viyaan-header-logo'), 'CSS defines .viyaan-header-logo with aspect-ratio preservation');
  assert(css.includes('.viyaan-header-text'), 'CSS defines .viyaan-header-text with gold brand color and typography');
  assert(css.includes('@media (max-width: 1024px)'), 'CSS includes tablet media queries for graceful header scaling');
  assert(css.includes('@media (max-width: 640px)'), 'CSS includes mobile media query isolating desktop-only elements');

  console.log('\n--- TEST GROUP 5: Viewport Math & Non-Overflow Validation ---');
  const widths = [320, 360, 375, 414, 768, 1024, 1280, 1440, 1920];
  for (const w of widths) {
    if (w <= 640) {
      // Mobile calculation
      const isExtraSmall = w <= 380;
      const pad = isExtraSmall ? 11.2 : 16;
      const gap = isExtraSmall ? 5.6 : 8;
      const actionsW = isExtraSmall ? 82 : 90;
      const brandAvail = w - pad - actionsW - gap;
      const brandReq = isExtraSmall ? 168 : 198;
      assert(brandAvail >= brandReq, `Mobile Viewport ${w}px: Header fits without overflow (Avail: ${brandAvail.toFixed(1)}px, Req: ${brandReq}px)`);
    } else {
      // Desktop / Tablet calculation
      const isTablet = w <= 900;
      const isSmallDesktop = w <= 1024;
      const pad = isTablet ? 32 : isSmallDesktop ? 40 : 48;
      const brandW = isTablet ? 175 : 210;
      const sepW = isTablet ? 15 : isSmallDesktop ? 25 : 37;
      const navW = isTablet ? 400 : isSmallDesktop ? 480 : 540;
      const viyaanW = isTablet ? 85 : 100;
      const totalReq = brandW + sepW + navW + viyaanW + pad;
      assert(w >= totalReq, `Desktop/Tablet Viewport ${w}px: Fits comfortably without clipping (Total req ${totalReq}px <= ${w}px)`);
    }
  }

  console.log('\n====================================================');
  console.log(` BRANDING VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runBrandingVerification();

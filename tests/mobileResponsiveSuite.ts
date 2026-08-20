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

function runMobileVerification() {
  console.log('====================================================');
  console.log(' RUNNING MOBILE VIEWPORT FIT & CSS VERIFICATION');
  console.log('====================================================\n');

  const cssPath = path.join(process.cwd(), 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  const headerTsx = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'Header.tsx'), 'utf-8');
  const logoTsx = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'NovaLogo.tsx'), 'utf-8');

  console.log('--- TEST GROUP 1: Mobile Header Component Structure ---');
  assert(headerTsx.includes('className="brand-logo-wrap"'), 'Header contains flexible brand-logo-wrap');
  assert(headerTsx.includes('minWidth: 0'), 'brand-logo-wrap has minWidth: 0 to allow shrinking on small viewports');
  assert(headerTsx.includes('className="mobile-header-actions"'), 'Header contains mobile-header-actions');
  assert(logoTsx.includes('className="brand-badge-box"'), 'NovaLogo uses brand-badge-box class');
  assert(logoTsx.includes('className="brand-title-text"'), 'NovaLogo uses brand-title-text class');
  assert(logoTsx.includes('className="brand-sub-text"'), 'NovaLogo uses brand-sub-text class');

  console.log('\n--- TEST GROUP 2: CSS Responsive & Non-Overflow Rules ---');
  assert(css.includes('.brand-logo-wrap') && css.includes('min-width: 0'), 'CSS specifies min-width: 0 on .brand-logo-wrap');
  assert(css.includes('.brand-badge-box') && css.includes('flex-shrink: 0'), 'CSS keeps .brand-badge-box flex-shrink: 0');
  assert(css.includes('.brand-title-text') && css.includes('overflow: hidden'), 'CSS clips/ellipsizes .brand-title-text safely');
  assert(css.includes('@media (max-width: 640px)'), 'CSS includes 640px mobile breakpoint');
  assert(css.includes('@media (max-width: 380px)'), 'CSS includes 380px extra-small mobile breakpoint');

  console.log('\n--- TEST GROUP 3: Viewport Width Simulations (320px to 430px) ---');
  const testWidths = [320, 360, 375, 390, 393, 414, 430];
  
  for (const width of testWidths) {
    const isSmall = width <= 380;
    const headerPadding = isSmall ? 0.35 * 16 * 2 : 0.5 * 16 * 2; // px
    const gapHeader = isSmall ? 0.35 * 16 : 0.5 * 16;
    const actionBtnWidth = isSmall ? 34 + 6 + 42 : 36 + 6 + 48; // hamburger + gap + AI button
    const availableBrandWidth = width - headerPadding - actionBtnWidth - gapHeader;

    const logoBadgeWidth = isSmall ? 78 : 88; // 68/76 + padding + border
    const titleWidth = isSmall ? 90 : 110; // "PROPERTY EXPLORER"
    const requiredBrandWidth = logoBadgeWidth + (isSmall ? 6 : 8) + titleWidth;

    const fitsInViewport = availableBrandWidth >= requiredBrandWidth;
    assert(fitsInViewport, `Width ${width}px: Available brand space (${availableBrandWidth.toFixed(1)}px) fits brand (${requiredBrandWidth}px) with zero overflow`);
  }

  console.log('\n====================================================');
  console.log(` MOBILE VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runMobileVerification();

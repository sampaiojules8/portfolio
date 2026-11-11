// Builds resume.pdf (site root) from resume-source/resume.html.
// Usage, from the repository root: node resume-source/build.js
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'resume.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const p = document.querySelector('.page');
    return p.scrollHeight - p.clientHeight;
  });
  if (overflow > 0) console.warn(`Warning: content overflows the page by ${overflow}px`);
  await page.pdf({ path: path.join(root, 'resume.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log('Wrote resume.pdf');
})();

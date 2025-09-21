// server/templateProcessor.js
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const puppeteer = require('puppeteer');
const mammoth = require('mammoth');
const { PDFDocument } = require('pdf-lib');

function extractPlaceholders(text) {
  const regex = /\{(.*?)\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return Array.from(new Set(matches));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Try to locate Chrome executable reliably
function findChromeExecutable() {
  // 1. Prefer explicit env var
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    console.log('Using env PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Auto-detect in Puppeteer cache
  const base = '/opt/render/.cache/puppeteer/chrome';
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).filter(f => f.startsWith('linux-'));
    if (versions.length > 0) {
      // pick the highest version folder
      const latest = versions.sort().reverse()[0];
      const candidate = path.join(base, latest, 'chrome-linux64', 'chrome');
      if (fs.existsSync(candidate)) {
        console.log('Auto-detected chrome binary at:', candidate);
        return candidate;
      }
    }
  }

  console.warn('No chrome binary found in cache, will try Puppeteer default');
  return null;
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const execPath = findChromeExecutable();

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: execPath || undefined,
      args
    });
    console.log('Puppeteer launched successfully');
    return browser;
  } catch (err) {
    console.error('Puppeteer launch failed, retrying fallback:', err.message);
    return puppeteer.launch({
      headless: true,
      args
    });
  }
}

/**
 * Process a DOCX file.
 * @param {string} filePath 
 * @param {boolean} extractOnly 
 * @param {object} values 
 * @param {string} outputFormat - "docx" | "pdf"
 */
async function processDocx(filePath, extractOnly, values = {}, outputFormat = 'docx') {
  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  if (extractOnly) {
    const text = doc.getFullText();
    return extractPlaceholders(text);
  }

  try {
    doc.render(values || {});
  } catch (err) {
    const msg = err?.properties?.errors
      ? JSON.stringify(err.properties.errors)
      : err.message || String(err);
    throw new Error('Error rendering docx: ' + msg);
  }

  if (outputFormat === 'docx') {
    return doc.getZip().generate({ type: 'nodebuffer' });
  }

  // outputFormat === 'pdf'
  try {
    // Save rendered DOCX to a temp file
    const tmpPath = filePath + '.rendered.docx';
    fs.writeFileSync(tmpPath, doc.getZip().generate({ type: 'nodebuffer' }));

    // Convert to HTML with mammoth
    const { value: htmlBody } = await mammoth.convertToHtml({ path: tmpPath });
    fs.unlinkSync(tmpPath);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.5; margin: 28px; font-size: 12pt; }
    h1,h2,h3,h4 { margin: 16px 0 8px; font-weight: bold; }
    p { margin: 0 0 12px 0; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    ul,ol { margin: 8px 0 8px 24px; }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;

    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await sleep(50);
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
    });
    await browser.close();

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty');
    }

    return pdfBuffer;
  } catch (err) {
    throw new Error('Error generating PDF via Puppeteer + mammoth: ' + (err.message || String(err)));
  }
}

async function processPdf(filePath, extractOnly, values = {}) {
  const pdfBytes = fs.readFileSync(filePath);
  if (extractOnly) {
    return extractPlaceholders(pdfBytes.toString('utf8'));
  }
  return pdfBytes;
}

module.exports = { processDocx, processPdf };

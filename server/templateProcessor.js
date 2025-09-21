// server/templateProcessor.js
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const puppeteer = require('puppeteer');
const mammoth = require('mammoth'); // 👈 NEW
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

async function launchBrowser() {
  const commonArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  try {
    const browser = await puppeteer.launch({
  headless: "new",
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
    "/opt/render/.cache/puppeteer/chrome/linux-140.0.7339.82/chrome-linux64/chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
    return browser;
  } catch {
    return puppeteer.launch({
      headless: true,
      args: commonArgs,
      executablePath: execPath,
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

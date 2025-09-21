// server/index.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// DEFINE templatesDir EARLY so routes can use it
const templatesDir = path.join(__dirname, 'templates');

// Middleware (apply before routes)
app.use(cors());
app.use(express.json());

// Optional: expose templates directory for debugging (not serving files directly, just listing)
app.get('/api/templates', (req, res) => {
  fs.readdir(templatesDir, (err, files) => {
    if (err) {
      console.error('Failed to read templates dir:', err);
      return res.status(500).json({ error: 'Failed to list templates' });
    }
    // Only return .docx and .pdf (ignore hidden files)
    const templates = files.filter(f => (f.endsWith('.docx') || f.endsWith('.pdf')) && !f.startsWith('.'));
    res.json({ templates });
  });
});

// Download a template file for processing
app.get('/api/template/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(templatesDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.sendFile(filePath);
});

const { processDocx, processPdf } = require('./templateProcessor');

const upload = multer({ dest: 'uploads/' });

app.post('/api/upload', upload.single('template'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(file.originalname).toLowerCase();
  let placeholders = [];
  try {
    if (ext === '.docx') {
      placeholders = await processDocx(file.path, true);
    } else if (ext === '.pdf') {
      placeholders = await processPdf(file.path, true);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    res.json({ placeholders });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore cleanup error */ }
  }
});

// inside server/index.js - ensure you require processDocx/processPdf at top
// const { processDocx, processPdf } = require('./templateProcessor');

// server/index.js (replace the existing /api/generate handler with this)
app.post('/api/generate', upload.single('template'), async (req, res) => {
  try {
    const file = req.file;
    const values = req.body.values ? JSON.parse(req.body.values) : {};
    const outputFormat = req.body.outputFormat || 'docx';

    console.log('Output format requested:', outputFormat);
    console.log('Body keys:', Object.keys(req.body));

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    let outputBuffer;

    if (ext === '.docx') {
      // pass outputFormat to processor
      outputBuffer = await processDocx(file.path, false, values, outputFormat);

      // Coerce to Node Buffer (handles Buffer, Uint8Array, ArrayBuffer, etc.)
      if (!Buffer.isBuffer(outputBuffer)) {
        try {
          outputBuffer = Buffer.from(outputBuffer);
        } catch (coerceErr) {
          console.error('Failed to coerce output to Buffer:', coerceErr);
        }
      }

      // Debugging info: type + length
      console.log('Output buffer isBuffer:', Buffer.isBuffer(outputBuffer));
      console.log('Output buffer length:', outputBuffer ? outputBuffer.length : 'null');

      if (!Buffer.isBuffer(outputBuffer) || outputBuffer.length === 0) {
        console.error('Generated buffer invalid or empty for DOCX ->', outputFormat);
        return res.status(500).json({ error: 'Failed to generate document' });
      }

      if (outputFormat === 'pdf') {
        res.setHeader('Content-Disposition', 'attachment; filename=contract.pdf');
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Disposition', 'attachment; filename=contract.docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      return res.send(outputBuffer);
    } else if (ext === '.pdf') {
      outputBuffer = await processPdf(file.path, false, values);

      if (!Buffer.isBuffer(outputBuffer)) {
        try { outputBuffer = Buffer.from(outputBuffer); } catch (_) {}
      }

      console.log('PDF-template output buffer length:', outputBuffer ? outputBuffer.length : 'null');

      if (!Buffer.isBuffer(outputBuffer) || outputBuffer.length === 0) {
        console.error('Generated buffer invalid or empty for PDF template');
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
      res.setHeader('Content-Disposition', 'attachment; filename=contract.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(outputBuffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Server error during generation' });
  } finally {
    if (req?.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }
});



const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Templates directory: ${templatesDir}`);
});

const express = require('express');
const multer = require('multer');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const cors = require('cors');



const app = express();

// Middleware
app.use(cors({
  origin: '*', // Be cautious in production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configure multer for file uploads
const UPLOAD_FOLDER = 'uploads';
fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_FOLDER,
  filename: (req, file, cb) => {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    cb(null, `contacts_${timestamp}.csv`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      return cb(new Error('Invalid file type. Please upload a CSV file'));
    }
    cb(null, true);
  }
});

// Validate phone number
const validatePhone = (phone) => {
  return String(phone).replace(/-/g, '').replace(/ /g, '').match(/^\d+$/);
};

// Upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        status: 'failed'
      });
    }

    const parser = fs.createReadStream(req.file.path)
      .pipe(csv.parse({
        columns: true,
        skip_empty_lines: true
      }));

    const records = [];
    const invalidPhones = [];

    for await (const record of parser) {
      records.push(record);
      
      // Validate required columns
      if (!record.name || !record.phone) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: 'Missing required columns: name, phone',
          status: 'failed'
        });
      }

      // Validate phone numbers
      if (!validatePhone(record.phone)) {
        invalidPhones.push(record);
      }
    }

    if (invalidPhones.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Invalid phone numbers found',
        invalid_rows: invalidPhones,
        status: 'failed'
      });
    }

    if (records.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'The CSV file is empty',
        status: 'failed'
      });
    }

    res.status(200).json({
      message: 'File uploaded successfully',
      filename: req.file.filename,
      total_contacts: records.length,
      status: 'success'
    });

  } catch (error) {
    // Clean up file if exists
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'An unexpected error occurred',
      details: error.message,
      status: 'failed'
    });
  }
});

// List uploaded files route
app.get('/uploaded-files', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_FOLDER);
    res.json({
      files,
      total_files: files.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Could not list files',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

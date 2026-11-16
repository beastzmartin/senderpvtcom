import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import crmInternalRoutes from '../crm/routes/crmInternalRoutes.js';
import { config } from '../config.js';
import { getCrmDb } from '../crm/db/index.js';

async function testHttpUpload() {
  console.log('Testing HTTP /api/crm/imports/upload endpoint...');
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/crm', crmInternalRoutes);

  const server = app.listen(0);
  const port = (server.address() as any).port;

  // Generate a valid JWT token for admin
  const token = jwt.sign(
    {
      id: 'admin_test_user',
      username: 'admin',
      role: 'admin'
    },
    config.jwtSecret
  );

  const testDir = path.resolve('data/crm_imports/uploads');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const sampleCsvContent = `First Name,Last Name,Email Address,Phone Number
Sarah,Connor,sarah.c@example.com,+15559998877
John,Connor,john.c@example.com,+15559998878`;

  // Construct multipart form body
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="sample_leads.csv"\r\n`;
  body += `Content-Type: text/csv\r\n\r\n`;
  body += sampleCsvContent;
  body += `\r\n--${boundary}--\r\n`;

  const req = http.request(
    {
      hostname: 'localhost',
      port,
      path: '/api/crm/imports/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        server.close();
        console.log(`Response status: ${res.statusCode}`);
        console.log(`Response body: ${data}`);

        const json = JSON.parse(data);
        if (res.statusCode !== 200 || !json.success) {
          console.error('HTTP Upload test failed:', json);
          process.exit(1);
        }

        if (json.headers.length !== 4) {
          console.error('Expected 4 headers, got:', json.headers);
          process.exit(1);
        }

        if (json.preview_rows.length !== 2) {
          console.error('Expected 2 preview rows, got:', json.preview_rows);
          process.exit(1);
        }

        // Clean up uploaded file if created
        if (json.file_path && fs.existsSync(json.file_path)) {
          fs.unlinkSync(json.file_path);
        }

        console.log('✅ HTTP multipart upload endpoint works 100%!');
        process.exit(0);
      });
    }
  );

  req.on('error', (err) => {
    server.close();
    console.error('HTTP Request error:', err);
    process.exit(1);
  });

  req.write(body);
  req.end();
}

testHttpUpload().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

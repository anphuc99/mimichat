import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_PATH = path.join(__dirname, 'dist');
const ZIP_PATH = path.join(__dirname, 'dist.zip');
const SERVER_URL = 'https://mimichat.io.vn';
const DEPLOY_TOKEN = "wroi24@#$5lifissWERSDFWrj!!@!#%6tHT^*^&8RDglrjeo2";

async function deployClient() {
  console.log('🚀 Starting client deployment...\n');

  // Check if DEPLOY_TOKEN exists
  if (!DEPLOY_TOKEN) {
    console.error('❌ Error: DEPLOY_TOKEN not found in .env file');
    process.exit(1);
  }

  // Check if dist folder exists
  if (!fs.existsSync(DIST_PATH)) {
    console.error('❌ Error: dist folder not found. Please run "npm run build" first.');
    process.exit(1);
  }

  try {
    // Step 1: Create zip file
    console.log('📦 Creating zip file from dist folder...');
    const zip = new AdmZip();
    zip.addLocalFolder(DIST_PATH);
    zip.writeZip(ZIP_PATH);
    console.log('✅ Zip file created successfully\n');

    // Step 2: Read zip file as base64
    console.log('📖 Reading zip file...');
    const zipBuffer = fs.readFileSync(ZIP_PATH);
    const zipBase64 = zipBuffer.toString('base64');
    console.log(`✅ Zip file read (${(zipBuffer.length / 1024).toFixed(2)} KB)\n`);

    // Step 3: Send to server
    console.log(`🌐 Deploying to ${SERVER_URL}/api/deploy-client...`);
    
    // Create agent to bypass SSL verification for self-signed certificates
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await fetch(`${SERVER_URL}/api/deploy-client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: DEPLOY_TOKEN,
        zipData: zipBase64,
      }),
      agent: agent
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Deployment successful!');
      console.log(`📝 ${result.message}\n`);
    } else {
      console.error('❌ Deployment failed:');
      console.error(`   ${result.error}\n`);
      process.exit(1);
    }

    // Step 4: Clean up zip file
    console.log('🧹 Cleaning up...');
    fs.unlinkSync(ZIP_PATH);
    console.log('✅ Cleanup complete\n');

    console.log('🎉 Client deployment completed successfully!');
  } catch (error) {
    console.error('❌ Deployment error:', error.message);
    
    // Clean up zip file if exists
    if (fs.existsSync(ZIP_PATH)) {
      fs.unlinkSync(ZIP_PATH);
    }
    
    process.exit(1);
  }
}

// Run deployment
deployClient();

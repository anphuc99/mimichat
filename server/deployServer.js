import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import https from 'https';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_JS_PATH = path.join(__dirname, 'dist', 'app.js');
const SERVER_URL = 'https://mimichat.io.vn';
const DEPLOY_TOKEN = "wroi24@#$5lifissWERSDFWrj!!@!#%6tHT^*^&8RDglrjeo2";

async function deployServer() {
  console.log('🚀 Starting server deployment...\n');

  // Check if DEPLOY_TOKEN exists
  if (!DEPLOY_TOKEN) {
    console.error('❌ Error: DEPLOY_TOKEN not found in .env file');
    process.exit(1);
  }

  // Check if app.js exists
  if (!fs.existsSync(APP_JS_PATH)) {
    console.error('❌ Error: app.js not found in dist folder. Please run "npm run build:bundle" first.');
    process.exit(1);
  }

  try {
    // Step 1: Read app.js file
    console.log('📖 Reading app.js file...');
    const fileContent = fs.readFileSync(APP_JS_PATH, 'utf-8');
    console.log(`✅ File read successfully (${(fileContent.length / 1024).toFixed(2)} KB)\n`);

    // Step 2: Send to server
    console.log(`🌐 Deploying to ${SERVER_URL}/api/deploy-server...`);
    
    // Create agent to bypass SSL verification for self-signed certificates
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await fetch(`${SERVER_URL}/api/deploy-server`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: DEPLOY_TOKEN,
        fileContent: fileContent,
      }),
      agent: agent
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Deployment successful!');
      console.log(`📝 ${result.message}\n`);
      console.log('⚠️  Please restart the server manually to apply changes.');
    } else {
      console.error('❌ Deployment failed:');
      console.error(`   ${result.error}\n`);
      process.exit(1);
    }

    console.log('🎉 Server deployment completed successfully!');
  } catch (error) {
    console.error('❌ Deployment error:', error.message);
    process.exit(1);
  }
}

// Run deployment
deployServer();

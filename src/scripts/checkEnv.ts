import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

interface CheckResult {
  service: string;
  key: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  details: string;
}

const results: CheckResult[] = [];

async function checkDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    results.push({
      service: 'Database (PostgreSQL)',
      key: 'DATABASE_URL',
      status: 'WARNING',
      details: 'Not set in local .env (configured on Render production).'
    });
    return;
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    results.push({
      service: 'Database (PostgreSQL)',
      key: 'DATABASE_URL',
      status: 'OK',
      details: 'Connected successfully and executed query.'
    });
  } catch (err: any) {
    results.push({
      service: 'Database (PostgreSQL)',
      key: 'DATABASE_URL',
      status: 'ERROR',
      details: `Connection failed: ${err.message}`
    });
  }
}

function checkJwt() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    results.push({
      service: 'Authentication (JWT)',
      key: 'JWT_SECRET',
      status: 'WARNING',
      details: 'Not set in local .env (must be set on Render production).'
    });
  } else if (secret.length < 16) {
    results.push({
      service: 'Authentication (JWT)',
      key: 'JWT_SECRET',
      status: 'WARNING',
      details: 'Key length is under 16 characters; consider using a stronger secret.'
    });
  } else {
    results.push({
      service: 'Authentication (JWT)',
      key: 'JWT_SECRET',
      status: 'OK',
      details: `Valid (${secret.length} characters).`
    });
  }
}

async function checkBrevo() {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    results.push({
      service: 'Email Delivery (Brevo)',
      key: 'BREVO_API_KEY',
      status: 'ERROR',
      details: 'Missing. OTP emails and password resets will fail.'
    });
    return;
  }

  try {
    const res = await axios.get('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key }
    });
    const sender = process.env.SYSTEM_EMAIL || 'not set';
    results.push({
      service: 'Email Delivery (Brevo)',
      key: 'BREVO_API_KEY',
      status: 'OK',
      details: `Active account: ${res.data.email} | Sender: ${sender}`
    });
  } catch (err: any) {
    results.push({
      service: 'Email Delivery (Brevo)',
      key: 'BREVO_API_KEY',
      status: 'ERROR',
      details: err.response?.data?.message || err.message
    });
  }
}

async function checkCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    results.push({
      service: 'Image Hosting (Cloudinary)',
      key: 'CLOUDINARY_*',
      status: 'ERROR',
      details: 'Missing credentials. Incident image uploads will fail.'
    });
    return;
  }

  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });
    const res = await cloudinary.api.ping();
    results.push({
      service: 'Image Hosting (Cloudinary)',
      key: 'CLOUDINARY_*',
      status: 'OK',
      details: `Connected to cloud '${cloudName}' (ping: ${res.status}).`
    });
  } catch (err: any) {
    results.push({
      service: 'Image Hosting (Cloudinary)',
      key: 'CLOUDINARY_*',
      status: 'ERROR',
      details: err.message
    });
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    results.push({
      service: 'AI Vision Analysis (Gemini)',
      key: 'GEMINI_API_KEY',
      status: 'WARNING',
      details: 'Missing. AI triage will fall back to manual review.'
    });
    return;
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash'
  ].filter(Boolean) as string[];

  const genAI = new GoogleGenerativeAI(key);
  let lastError: any = null;

  for (const m of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent('ping');
      results.push({
        service: 'AI Vision Analysis (Gemini)',
        key: `GEMINI_API_KEY (${m})`,
        status: 'OK',
        details: `Active. Response: "${res.response.text().trim()}"`
      });
      return;
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('CONSUMER_SUSPENDED')) {
        break;
      }
    }
  }

  const msg = lastError?.message || '';
    if (msg.includes('CONSUMER_SUSPENDED')) {
      results.push({
        service: 'AI Vision Analysis (Gemini)',
        key: 'GEMINI_API_KEY',
        status: 'ERROR',
        details: 'Key SUSPENDED by Google. Generate a new key at https://aistudio.google.com/app/apikey'
      });
    } else {
      results.push({
        service: 'AI Vision Analysis (Gemini)',
        key: 'GEMINI_API_KEY',
        status: 'ERROR',
        details: msg
      });
    }
}



function checkFirebase() {
  let serviceAccount: object | null = null;
  const envVal = process.env.FIREBASE_CREDENTIALS_JSON;

  if (envVal) {
    try {
      serviceAccount = JSON.parse(envVal);
    } catch {
      results.push({
        service: 'Push Notifications (Firebase)',
        key: 'FIREBASE_CREDENTIALS_JSON',
        status: 'ERROR',
        details: 'FIREBASE_CREDENTIALS_JSON is not valid JSON.'
      });
      return;
    }
  } else {
    const credPath = path.join(__dirname, '../config/firebase-credentials.json');
    if (fs.existsSync(credPath)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      } catch (err: any) {
        results.push({
          service: 'Push Notifications (Firebase)',
          key: 'firebase-credentials.json',
          status: 'ERROR',
          details: `Error parsing local file: ${err.message}`
        });
        return;
      }
    }
  }

  if (!serviceAccount) {
    results.push({
      service: 'Push Notifications (Firebase)',
      key: 'FIREBASE_CREDENTIALS_JSON',
      status: 'WARNING',
      details: 'Missing. Push notifications to mobile devices will be skipped.'
    });
    return;
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
    }, 'check-env-app');
    admin.messaging(app);
    results.push({
      service: 'Push Notifications (Firebase)',
      key: 'Firebase Admin SDK',
      status: 'OK',
      details: `Initialized successfully for project '${(serviceAccount as any).project_id}'.`
    });
  } catch (err: any) {
    results.push({
      service: 'Push Notifications (Firebase)',
      key: 'Firebase Admin SDK',
      status: 'ERROR',
      details: err.message
    });
  }
}

async function runDiagnostic() {
  console.log('\n======================================================');
  console.log('🔍 SendResQPls Backend - Environment & Service Check');
  console.log('======================================================\n');

  await checkDatabase();
  checkJwt();
  await checkBrevo();
  await checkCloudinary();
  await checkGemini();
  checkFirebase();

  for (const r of results) {
    const symbol = r.status === 'OK' ? '✅' : r.status === 'WARNING' ? '⚠️ ' : '❌';
    console.log(`${symbol} [${r.status}] ${r.service} (${r.key})`);
    console.log(`   ${r.details}\n`);
  }

  console.log('======================================================\n');
}

runDiagnostic();

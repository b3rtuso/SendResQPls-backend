import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

let firebaseApp: admin.app.App | null = null;

try {
  let serviceAccount: object | null = null;

  // 1. Prefer env var (used on Render/production — avoids committing secrets to git)
  if (process.env.FIREBASE_CREDENTIALS_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
    console.log('🔥 Firebase: loading credentials from FIREBASE_CREDENTIALS_JSON env var.');
  } else {
    // 2. Fall back to local file (for local development)
    const credentialsPath = path.join(__dirname, 'firebase-credentials.json');
    if (fs.existsSync(credentialsPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      console.log('🔥 Firebase: loading credentials from local file.');
    }
  }

  if (serviceAccount) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    console.log('🔥 Firebase Admin SDK initialized successfully.');
  } else {
    console.warn('⚠️ Firebase credentials not found. Set FIREBASE_CREDENTIALS_JSON env var on Render. Push notifications will be skipped.');
  }
} catch (error: any) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
}

export const messaging = firebaseApp ? admin.messaging(firebaseApp) : null;

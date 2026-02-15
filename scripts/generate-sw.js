
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env parser since we might not have dotenv installed in dependencies (though Vite uses it)
// We'll try to read .env manually to be safe without adding dependencies, 
// OR we can rely on process.env if run via a runner that loads it. 
// Standard 'node' doesn't extra deps. Let's parse .env manually.

const loadEnv = () => {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (!fs.existsSync(envPath)) return {};
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim().replace(/^["']|["']$/g, ''); // toggle quotes
            }
        });
        return env;
    } catch (e) {
        console.error("Error loading .env", e);
        return {};
    }
};

const env = loadEnv();
// Fallback to process.env if deployed where env vars are injected
const getVar = (key) => process.env[key] || env[key] || "";

// Generate src/firebase-messaging-sw.js from sw.template.js
const publicSwPath = path.resolve(__dirname, '../public/firebase-messaging-sw.js');
const mainSwTemplatePath = path.resolve(__dirname, '../src/sw.template.js');
const mainSwOutputPath = path.resolve(__dirname, '../src/firebase-messaging-sw.js');

if (fs.existsSync(mainSwTemplatePath)) {
    const mainSwTemplate = fs.readFileSync(mainSwTemplatePath, 'utf-8');
    const mainSwContent = mainSwTemplate
        .replace('__VITE_FIREBASE_API_KEY__', getVar('VITE_FIREBASE_API_KEY'))
        .replace('__VITE_FIREBASE_AUTH_DOMAIN__', getVar('VITE_FIREBASE_AUTH_DOMAIN'))
        .replace('__VITE_FIREBASE_PROJECT_ID__', getVar('VITE_FIREBASE_PROJECT_ID'))
        .replace('__VITE_FIREBASE_STORAGE_BUCKET__', getVar('VITE_FIREBASE_STORAGE_BUCKET'))
        .replace('__VITE_FIREBASE_MESSAGING_SENDER_ID__', getVar('VITE_FIREBASE_MESSAGING_SENDER_ID'))
        .replace('__VITE_FIREBASE_APP_ID__', getVar('VITE_FIREBASE_APP_ID'))
        .replace('__VITE_FIREBASE_DATABASE_URL__', getVar('VITE_FIREBASE_DATABASE_URL'))
        .replace('__VITE_FIREBASE_VAPID_KEY__', getVar('VITE_FIREBASE_VAPID_KEY'));

    // For Source (src/): Keep self.__WB_MANIFEST literal for Vite to inject
    fs.writeFileSync(mainSwOutputPath, mainSwContent);

    // For Public (public/): Inject dummy manifest [] to avoid evaluation errors in dev
    const publicContent = mainSwContent.replace('self.__WB_MANIFEST', '[]');
    fs.writeFileSync(publicSwPath, publicContent);

    console.log('✅ Generated src/firebase-messaging-sw.js and public/firebase-messaging-sw.js');
}

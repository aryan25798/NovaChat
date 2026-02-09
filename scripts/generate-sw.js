
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

const templatePath = path.resolve(__dirname, '../src/firebase-messaging-sw.template.js');
const outputPath = path.resolve(__dirname, '../public/firebase-messaging-sw.js');

const template = fs.readFileSync(templatePath, 'utf-8');

const content = template
    .replace('__VITE_FIREBASE_API_KEY__', getVar('VITE_FIREBASE_API_KEY'))
    .replace('__VITE_FIREBASE_AUTH_DOMAIN__', getVar('VITE_FIREBASE_AUTH_DOMAIN'))
    .replace('__VITE_FIREBASE_PROJECT_ID__', getVar('VITE_FIREBASE_PROJECT_ID'))
    .replace('__VITE_FIREBASE_STORAGE_BUCKET__', getVar('VITE_FIREBASE_STORAGE_BUCKET'))
    .replace('__VITE_FIREBASE_MESSAGING_SENDER_ID__', getVar('VITE_FIREBASE_MESSAGING_SENDER_ID'))
    .replace('__VITE_FIREBASE_APP_ID__', getVar('VITE_FIREBASE_APP_ID'))
    .replace('__VITE_FIREBASE_DATABASE_URL__', getVar('VITE_FIREBASE_DATABASE_URL'));

fs.writeFileSync(outputPath, content);
console.log('✅ Generated public/firebase-messaging-sw.js with environment variables.');

import { exec } from 'child_process';
import fs from 'fs';

console.log("Starting build debug...");
const logStream = fs.createWriteStream('build-debug.log');

const child = exec('npm run build', (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
    }
    console.log('Build finished.');
});

child.stdout.pipe(logStream);
child.stderr.pipe(logStream);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

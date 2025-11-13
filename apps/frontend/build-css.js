import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// For Tailwind CSS v4, we can use the CSS import directly
// Bun should process @import "tailwindcss" automatically
// But if not, we'll read and write the file to ensure it's processed
const inputPath = join(__dirname, 'styles.css');
const outputPath = join(__dirname, 'dist', 'styles.css');

const css = readFileSync(inputPath, 'utf-8');
writeFileSync(outputPath, css, 'utf-8');
console.log('CSS file copied to dist/styles.css');

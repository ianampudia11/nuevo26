import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
    path.join(__dirname, '../translations/es.json'),
    path.join(__dirname, '../translations/en.json')
];

const replacements = [
    { from: /PowerChat/gi, to: 'Iawarrior tech' },
    { from: /Bothive/gi, to: 'Iawarrior tech' }
];

files.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        let newContent = content;

        replacements.forEach(rep => {
            newContent = newContent.replace(rep.from, rep.to);
        });

        if (newContent !== content) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log(`Updated ${file}`);
        } else {
            console.log(`No changes needed for ${file}`);
        }
    } catch (err) {
        console.error(`Error processing ${file}:`, err);
    }
});

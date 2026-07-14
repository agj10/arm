import fs from 'fs';
import path from 'path';

const versionFilePath = path.join(process.cwd(), 'public', 'version.json');

try {
  const data = fs.readFileSync(versionFilePath, 'utf8');
  const json = JSON.parse(data);
  let version = json.version; // e.g. "a1.0"
  
  const match = version.match(/^([a-zA-Z]+)(\d+)\.(\d+)$/);
  if (match) {
    const prefix = match[1]; // "a"
    const major = parseInt(match[2], 10);
    const minor = parseInt(match[3], 10);
    
    const newVersion = `${prefix}${major}.${minor + 1}`;
    json.version = newVersion;
    
    fs.writeFileSync(versionFilePath, JSON.stringify(json, null, 2), 'utf8');
    console.log(`Version incremented from ${version} to ${newVersion}`);
  } else {
    console.log(`Version format unrecognized: ${version}`);
  }
} catch (e) {
  console.error("Failed to increment version", e);
  process.exit(1);
}

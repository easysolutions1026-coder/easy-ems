// Patch workLogs.json in-place to add technicianID (extracted from
// technicians[0].staffID) on every record. Bypasses PowerShell's
// broken JSON round-tripping — Node handles nested arrays correctly.
//
// Usage:  node scripts/patch-worklogs.js "C:\\Users\\pc\\Downloads\\migration files"

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'C:\\Users\\pc\\Downloads\\migration files';
const src = path.join(dir, 'workLogs.json');
const backup = src + '.node-backup';

if (!fs.existsSync(src)) {
    console.error('Not found:', src);
    process.exit(1);
}

// Backup once (won't overwrite existing backup)
if (!fs.existsSync(backup)) {
    fs.copyFileSync(src, backup);
    console.log('Backup created:', backup);
}

// Load
const raw = fs.readFileSync(src, 'utf8');
let data = JSON.parse(raw);

if (!Array.isArray(data)) {
    console.error('Expected top-level array, got:', typeof data);
    process.exit(1);
}

console.log('Records loaded:', data.length);

// Patch every record
let patched = 0;
for (const rec of data) {
    if (rec.technicianID) continue;  // already has it
    if (!Array.isArray(rec.technicians) || !rec.technicians.length) continue;
    const first = rec.technicians[0];
    const staffId = (typeof first === 'string') ? first : (first.staffID || first.id);
    if (staffId) {
        rec.technicianID = staffId;
        patched++;
    }
}

console.log('Patched:', patched);

// Write back — compact, no BOM
fs.writeFileSync(src, JSON.stringify(data), { encoding: 'utf8' });

// Verify
const check = JSON.parse(fs.readFileSync(src, 'utf8'));
console.log('Verification:');
console.log('  Total records after write:', check.length);
console.log('  First 3 records:');
check.slice(0, 3).forEach((r, i) => {
    console.log(`    ${i+1}. wlID=${r.wlID}  technicianID=${r.technicianID}  project=${r.project?.substring(0, 40)}...`);
});
const fs = require('fs');
const src = 'C:/Users/pc/Downloads/migration files/wl_11.json';

let raw = fs.readFileSync(src, 'utf8');

// The corruption in the file: em-dash characters became mangled sequences
// that JSON.parse tolerates on read but re-serialize doesn't fully clean.
// Nuke every non-ASCII "weird" character in string content by replacing them
// with a plain hyphen. This is lossy but the point is to get the record loaded.

// Replace common em-dash-corruption patterns first
raw = raw.replace(/\?\?"/g, '-"');           // ??" pattern (extra quote issue)
raw = raw.replace(/Ã¢â‚¬"/g, '-');              // Windows-1252 em-dash in UTF-8
raw = raw.replace(/\u2013/g, '-');           // en-dash
raw = raw.replace(/\u2014/g, '-');           // em-dash
raw = raw.replace(/\u0097/g, '-');           // C1 control
raw = raw.replace(/[\u0080-\u009F]/g, '');   // strip all C1 controls

try {
    const data = JSON.parse(raw);
    fs.writeFileSync(src, JSON.stringify(data));
    console.log('SUCCESS. Records:', data.length);
} catch (e) {
    console.error('Still broken:', e.message);
    const m = e.message.match(/position (\d+)/);
    if (m) {
        const pos = parseInt(m[1]);
        console.error('Around position ' + pos + ':');
        for (let i = Math.max(0, pos-10); i < Math.min(raw.length, pos+20); i++) {
            console.error('  ' + i + ' char: ' + JSON.stringify(raw[i]) + ' code: ' + raw.charCodeAt(i));
        }
    }
}

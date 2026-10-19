const fs = require('fs');
const menuPath = 'd:/OtoSolve/src/app/Shared/layout/menu.data.ts';
let src = fs.readFileSync(menuPath, 'utf8');
const startMarker = '"id": "42f4e315-d98a-4b71-bac3-37eac62ea2aa",';
const nextMarker = '"id": "c3075787-9ec3-4f9f-ba92-51a1e3903522",';
const si = src.indexOf(startMarker);
const ni = src.indexOf(nextMarker, si);
if (si < 0 || ni < 0) { console.error('markers not found', { si, ni }); process.exit(1); }
const start = src.lastIndexOf('  {', si);   // opening of the FR_RELATIONSHIPS block object
const end = src.lastIndexOf('  {', ni);     // opening of the FR_CAMPAIGNS block (next menu)
if (start < 0 || end <= start) { console.error('bad splice range', { start, end }); process.exit(1); }
let repl = fs.readFileSync('d:/OtoSolve/_menu_new.txt', 'utf8').replace(/\r?\n/g, '\r\n');
if (!repl.endsWith('\r\n')) repl += '\r\n';
src = src.slice(0, start) + repl + src.slice(end);
fs.writeFileSync(menuPath, src, 'utf8');
console.log('spliced ok; range', start, '-', end, '; new length', src.length);

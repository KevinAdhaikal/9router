const fs = require('fs');
const path = require('path');

const safeParseCookieDef = `
function safeParseCookie(header) {
    if (!header) return {};
    try {
        const fn = (typeof cookieParser !== "undefined" && cookieParser && typeof cookieParser.parse === "function")
            ? cookieParser.parse
            : (typeof cookieParser !== "undefined" && cookieParser && cookieParser.default && typeof cookieParser.default.parse === "function")
            ? cookieParser.default.parse
            : null;
        if (fn) return fn(header);
    } catch (_) {}
    const out = {};
    for (const pair of String(header).split(";")) {
        const idx = pair.indexOf("=");
        if (idx !== -1) {
            const k = pair.slice(0, idx).trim();
            const v = pair.slice(idx + 1).trim();
            try {
                out[k] = decodeURIComponent(v);
            } catch (_) {
                out[k] = v;
            }
        }
    }
    return out;
}
`;

const filesToPatch = [
    path.join(__dirname, '../node_modules/@opennextjs/aws/dist/overrides/converters/edge.js'),
    path.join(__dirname, '../node_modules/@opennextjs/aws/dist/overrides/converters/node.js'),
];

for (const filePath of filesToPatch) {
    if (!fs.existsSync(filePath)) {
        console.log(`[patch-opennext] File not found: ${filePath}`);
        continue;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('safeParseCookie(cookieHeader)')) {
        console.log(`[patch-opennext] Already patched: ${filePath}`);
        continue;
    }
    if (content.includes('cookieParser.parse(cookieHeader)')) {
        content = safeParseCookieDef + '\n' + content.replace('cookieParser.parse(cookieHeader)', 'safeParseCookie(cookieHeader)');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[patch-opennext] Successfully patched: ${filePath}`);
    } else {
        console.log(`[patch-opennext] Pattern not found in: ${filePath}`);
    }
}

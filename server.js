const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.jar': 'application/java-archive',
    '.wasm': 'application/wasm',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

// Cache-Control by extension
const CACHE_CONTROL = {
    '.html': 'no-cache',
    '.wav':  'public, max-age=86400',
    '.jar':  'public, max-age=3600'
};

const server = http.createServer((req, res) => {
    // CORS headers (required for CheerpJ cross-origin resource loading)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Safe URL decoding — respond 400 on malformed percent-encoding
    let reqPath;
    try {
        reqPath = decodeURI(req.url.split('?')[0]);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: invalid URL encoding');
        return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const safePath = path.normalize(path.join(ROOT, reqPath));
    if (!safePath.startsWith(ROOT + path.sep) && safePath !== ROOT) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found: ' + reqPath);
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const cacheControl = CACHE_CONTROL[ext] || 'public, max-age=3600';
        const totalSize = stats.size;

        // Accept-Ranges: required by CheerpJ for JAR loading
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', cacheControl);

        const rangeHeader = req.headers['range'];
        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
            if (match) {
                let start = match[1] ? parseInt(match[1], 10) : 0;
                let end   = match[2] ? parseInt(match[2], 10) : totalSize - 1;

                if (isNaN(start)) start = 0;
                if (isNaN(end) || end >= totalSize) end = totalSize - 1;

                if (start > end || start >= totalSize) {
                    res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                    res.end();
                    return;
                }

                const chunkSize = end - start + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Content-Length': chunkSize,
                    'Content-Type': contentType
                });

                const stream = fs.createReadStream(safePath, { start, end });
                stream.on('error', (streamErr) => {
                    console.error('Stream error (range):', streamErr.message);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                    }
                    res.end('Internal Server Error');
                });
                stream.pipe(res);
                return;
            }
        }

        // Full content response
        res.writeHead(200, {
            'Content-Length': totalSize,
            'Content-Type': contentType
        });

        const stream = fs.createReadStream(safePath);
        stream.on('error', (streamErr) => {
            console.error('Stream error:', streamErr.message);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
            }
            res.end('Internal Server Error');
        });
        stream.pipe(res);
    });
});

server.on('error', (err) => {
    console.error('Server error:', err.message);
});

server.listen(PORT, () => {
    console.log(`Dungeon Chronicles Web Server running at http://localhost:${PORT}/`);
    console.log(`HTTP Range requests enabled for CheerpJ.`);
    console.log(`Serving from: ${ROOT}`);
});

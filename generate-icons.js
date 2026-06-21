const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3871;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/icon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(fs.readFileSync(path.join(__dirname, 'icon.svg')));
  } else if (req.method === 'GET' && (req.url === '/' || req.url === '/render-icons.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <body>
        <h1>Generating Icons...</h1>
        <canvas id="c192" width="192" height="192"></canvas>
        <canvas id="c512" width="512" height="512"></canvas>
        <script>
          const img = new Image();
          img.src = '/icon.svg';
          img.onload = () => {
            // Draw 192
            const c192 = document.getElementById('c192');
            c192.getContext('2d').drawImage(img, 0, 0, 192, 192);
            const data192 = c192.toDataURL('image/png');

            // Draw 512
            const c512 = document.getElementById('c512');
            c512.getContext('2d').drawImage(img, 0, 0, 512, 512);
            const data512 = c512.toDataURL('image/png');

            // Send to server
            Promise.all([
              fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: 'icon-192.png', data: data192 })
              }),
              fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: 'icon-512.png', data: data512 })
              })
            ]).then(() => {
              console.log('Icons generated successfully.');
              document.body.innerHTML += '<h2>Done! You can close this tab.</h2>';
              fetch('/done');
            }).catch(err => {
              console.error(err);
            });
          };
        </script>
      </body>
      </html>
    `);
  } else if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const base64Data = payload.data.replace(/^data:image\/png;base64,/, "");
        const filePath = path.join(__dirname, payload.filename);
        fs.writeFileSync(filePath, base64Data, 'base64');
        console.log(`Saved ${payload.filename}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end(err.toString());
      }
    });
  } else if (req.url === '/done') {
    res.writeHead(200);
    res.end('Shutting down');
    console.log('Shutting down server...');
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Icon generator server running on http://localhost:${PORT}/render-icons.html`);
});

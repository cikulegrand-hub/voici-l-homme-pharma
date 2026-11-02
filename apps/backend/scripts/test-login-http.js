const http = require('http');

const data = JSON.stringify({
  username: 'admin',
  password: 'Admin2026@VoiciLHomme!',
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try {
        const json = JSON.parse(body);
        console.log('RESPONSE:', JSON.stringify(json, null, 2));
      } catch {
        console.log('RAW BODY:', body);
      }
    });
  },
);

req.on('error', (e) => {
  console.error('REQUEST ERROR:', e.message);
});

req.write(data);
req.end();


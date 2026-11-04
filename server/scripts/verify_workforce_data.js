const http = require('http');

function req(path, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'Cookie': cookie || ''
      }
    };
    http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email: 'admin@example.com', password: 'Password123!' });
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const r = http.request(options, (res) => {
      let data = '';
      const setCookies = res.headers['set-cookie'] || [];
      const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(cookie));
    });
    r.on('error', reject);
    r.write(postData);
    r.end();
  });
}

async function verify() {
  const cookie = await login();
  console.log('Logged in as admin. Fetching workforce data...');

  const headcount = await req('/workforce/headcount', cookie);
  console.log('\n--- HEADCOUNT (first 6) ---');
  console.table(headcount.slice(0, 6));

  const attrition = await req('/workforce/attrition?months=3', cookie);
  console.log('\n--- ATTRITION (first 6) ---');
  console.table(attrition.slice(0, 6));

  const overtime = await req('/workforce/overtime?months=3', cookie);
  console.log('\n--- OVERTIME (first 6) ---');
  console.table(overtime.slice(0, 6));

  const leavePressure = await req('/workforce/leave-pressure?months=3', cookie);
  console.log('\n--- LEAVE PRESSURE (first 6) ---');
  console.table(leavePressure.slice(0, 6));
}

verify().catch(console.error);


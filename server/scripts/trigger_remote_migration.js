const https = require('https');

const BASE_URL = 'https://employee-system-api-jet.vercel.app/api';

function makeRequest(method, path, body = null, cookies = [], headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (cookies.length > 0) {
      options.headers['Cookie'] = cookies.join('; ');
    }

    const req = https.request(options, (res) => {
      let data = '';
      const setCookieHeaders = res.headers['set-cookie'] || [];
      const newCookies = setCookieHeaders.map(c => c.split(';')[0]);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          cookies: newCookies.length > 0 ? newCookies : cookies
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function extractXsrfToken(cookies) {
  for (const c of cookies) {
    if (c.startsWith('XSRF-TOKEN=')) {
      return decodeURIComponent(c.substring('XSRF-TOKEN='.length));
    }
  }
  return '';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('1. Authenticating as Admin on remote API...');
  const loginRes = await makeRequest('POST', '/auth/login', {
    email: 'admin@example.com',
    password: 'Password123!'
  });

  if (loginRes.statusCode !== 200 || !loginRes.data?.user) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }

  const cookies = loginRes.cookies;
  const csrfToken = extractXsrfToken(cookies);
  const authHeaders = {
    'x-csrf-token': csrfToken
  };

  console.log('✓ Successfully authenticated as:', loginRes.data.user.email);
  console.log('Cookies received:', cookies.map(c => c.split('=')[0]));

  console.log('\n2. Waiting for Vercel deployment and invoking redistribute endpoint...');
  let maxAttempts = 20;
  let success = false;

  for (let i = 1; i <= maxAttempts; i++) {
    process.stdout.write(`Attempt ${i}/${maxAttempts}: Calling POST /api/workforce/redistribute-hire-dates... `);
    const res = await makeRequest('POST', '/workforce/redistribute-hire-dates', {}, cookies, authHeaders);

    if (res.statusCode === 200 && res.data?.success) {
      console.log('SUCCESS!');
      console.log('\n================ RESULT ================');
      console.log('Message:', res.data.message);
      console.log('Backup table created:', res.data.backupTable);
      console.log('Total employees:', res.data.totalEmployees);
      console.log('Active employees:', res.data.activeEmployees);
      console.log('\n--- Monthly Hiring Statistics (Last 6 Months) ---');
      console.table(res.data.monthlyHiringStats);
      success = true;
      break;
    } else if (res.statusCode === 404) {
      console.log('404 Not Found (Vercel still building/deploying). Retrying in 6s...');
      await sleep(6000);
    } else {
      console.log(`HTTP ${res.statusCode}:`, res.data);
      if (i < maxAttempts) {
        await sleep(5000);
      }
    }
  }

  if (!success) {
    console.error('\nFailed to execute migration within expected attempts.');
    process.exit(1);
  }

  console.log('\n3. Verifying live Dashboard API stats...');
  const dashRes = await makeRequest('GET', '/dashboard/stats', null, cookies, authHeaders);

  if (dashRes.statusCode === 200) {
    console.log('✓ Live Dashboard monthly hiring returned:');
    console.table(dashRes.data.monthlyHiring);
  } else {
    console.log('Dashboard fetch status:', dashRes.statusCode, dashRes.data);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
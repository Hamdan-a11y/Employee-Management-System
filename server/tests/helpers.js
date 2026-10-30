const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function makeRequest(method, path, body = null, cookies = [], headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
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

    const req = http.request(options, (res) => {
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
          cookies: newCookies
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

async function loginAsAdmin() {
  const res = await makeRequest('POST', '/auth/login', {
    email: 'admin@example.com',
    password: 'Password123!'
  });
  if (res.statusCode !== 200) {
    throw new Error(`Admin login failed with status ${res.statusCode}: ${JSON.stringify(res.data)}`);
  }
  const cookies = res.cookies;
  const csrf = extractXsrfToken(cookies);
  return {
    user: res.data.user,
    token: res.data.token,
    cookies,
    csrf,
    headers: { 'x-csrf-token': csrf }
  };
}

async function loginAsEmployee() {
  const res = await makeRequest('POST', '/auth/login', {
    email: 'muhammadhumdan43@gmail.com',
    password: 'Password123!'
  });
  if (res.statusCode !== 200) {
    throw new Error(`Employee login failed with status ${res.statusCode}: ${JSON.stringify(res.data)}`);
  }
  const cookies = res.cookies;
  const csrf = extractXsrfToken(cookies);
  return {
    user: res.data.user,
    token: res.data.token,
    cookies,
    csrf,
    headers: { 'x-csrf-token': csrf }
  };
}

async function loginAsHRManager() {
  const res = await makeRequest('POST', '/auth/login', {
    email: 'hr_manager@example.com',
    password: 'Password123!'
  });
  if (res.statusCode !== 200) {
    throw new Error(`HR Manager login failed with status ${res.statusCode}: ${JSON.stringify(res.data)}`);
  }
  const cookies = res.cookies;
  const csrf = extractXsrfToken(cookies);
  return {
    user: res.data.user,
    token: res.data.token,
    cookies,
    csrf,
    headers: { 'x-csrf-token': csrf }
  };
}

async function loginAsDeptManager1() {
  const res = await makeRequest('POST', '/auth/login', {
    email: 'manager_dept1@example.com',
    password: 'Password123!'
  });
  if (res.statusCode !== 200) {
    throw new Error(`Dept Manager 1 login failed with status ${res.statusCode}: ${JSON.stringify(res.data)}`);
  }
  const cookies = res.cookies;
  const csrf = extractXsrfToken(cookies);
  return {
    user: res.data.user,
    token: res.data.token,
    cookies,
    csrf,
    headers: { 'x-csrf-token': csrf }
  };
}

async function loginAsDeptManager2() {
  const res = await makeRequest('POST', '/auth/login', {
    email: 'manager_dept2@example.com',
    password: 'Password123!'
  });
  if (res.statusCode !== 200) {
    throw new Error(`Dept Manager 2 login failed with status ${res.statusCode}: ${JSON.stringify(res.data)}`);
  }
  const cookies = res.cookies;
  const csrf = extractXsrfToken(cookies);
  return {
    user: res.data.user,
    token: res.data.token,
    cookies,
    csrf,
    headers: { 'x-csrf-token': csrf }
  };
}

async function runTestQuery(sql, params = []) {
  const mysql = require('mysql2/promise');
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    database: process.env.DB_NAME || 'employee_db',
    port: process.env.DB_PORT || 3306
  });
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

module.exports = {
  BASE_URL,
  makeRequest,
  extractXsrfToken,
  loginAsAdmin,
  loginAsHRManager,
  loginAsDeptManager1,
  loginAsDeptManager2,
  loginAsEmployee,
  runTestQuery
};

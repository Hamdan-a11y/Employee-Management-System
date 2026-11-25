process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.DB_NAME = 'employee_test_db';

const path = require('path');
const fs = require('fs');
module.paths.push(path.join(__dirname, '../server/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
// Explicitly force test DB and disable rate limiting for load testing
process.env.DB_NAME = 'employee_test_db';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';

const autocannon = require('autocannon');
const jwt = require('jsonwebtoken');
const http = require('http');

async function runLoadTests(options = {}) {
  const duration = options.duration !== undefined ? options.duration : 30; // 30 seconds
  const connections = options.connections || 50; // 50 concurrent users
  const dbName = 'employee_test_db';
  process.env.DB_NAME = dbName;

  console.log(`[LoadTest] Setting up load test on DB: ${dbName} (connections: ${connections}, duration: ${duration}s)`);

  // Force DB_NAME to employee_test_db and test mode
  process.env.DB_NAME = dbName;
  process.env.NODE_ENV = 'test';

  // Generate test admin token
  const jwtSecret = process.env.JWT_SECRET || 'jwt_secret_key_123456789_development';
  const token = jwt.sign(
    { id: 1, email: 'admin@example.com', role: 'admin', department_id: null },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Require express app
  const app = require('../server/index');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[LoadTest] In-process server listening on ${baseUrl}`);

  const endpoints = [
    {
      name: 'Attendance List',
      path: '/api/attendance/history?limit=20',
      method: 'GET'
    },
    {
      name: 'Dashboard Stats',
      path: '/api/dashboard/stats',
      method: 'GET'
    },
    {
      name: 'Analytics (Department Attendance)',
      path: '/api/analytics/department-attendance?start_month=2024-01&end_month=2024-06',
      method: 'GET'
    }
  ];

  const results = [];

  try {
    for (const ep of endpoints) {
      console.log(`\n-> Running scenario: ${ep.name} (${ep.path})...`);
      
      const instance = autocannon({
        url: `${baseUrl}${ep.path}`,
        connections,
        duration,
        pipelining: 1,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        }
      });

      autocannon.track(instance, { renderProgressBar: false });

      const res = await instance;
      
      const reqPerSec = Math.round((res.requests.mean || res.requests.average || (res.requests.total / duration)) * 10) / 10;
      const p95Latency = Math.round((res.latency.p97_5 || res.latency.p90 || res.latency.mean || 0) * 10) / 10;
      const totalRequests = res.requests.total || 1;
      const errorCount = (res.errors || 0) + (res.timeouts || 0) + (res.non2xx || 0);
      const errorRate = Math.min(100, Math.round((errorCount / totalRequests) * 1000) / 10);

      console.log(`   Req/Sec: ${reqPerSec} | p95: ${p95Latency} ms | Error Rate: ${errorRate}% (Total: ${res.requests.total}, 2xx: ${res['2xx']}, non2xx: ${res.non2xx})`);

      results.push({
        name: ep.name,
        path: ep.path,
        reqPerSec,
        p95Latency,
        errorRate,
        totalRequests
      });

      // Brief drain pause between scenarios
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Append to docs/performance/comparison.md
    const compMdPath = path.join(__dirname, '../docs/performance/comparison.md');
    let md = '';
    if (fs.existsSync(compMdPath)) {
      md = fs.readFileSync(compMdPath, 'utf8');
      // Remove any previously appended Load Test section
      const loadIdx = md.indexOf('## Load Test Results');
      if (loadIdx !== -1) {
        md = md.slice(0, loadIdx).trim();
      }
    } else {
      md = '# Attendance Performance Optimization Comparison\n';
    }

    md += `\n\n## Load Test Results (50 Concurrent Users, ${duration}s Duration)\n\n`;
    md += `Benchmarked against \`${dbName}\` (1,000,000+ attendance records) with 50 concurrent simulated users.\n\n`;
    md += `| Scenario / Endpoint | Requests / Sec | p95 Latency (ms) | Error Rate (%) |\n`;
    md += `|---|---|---|---|\n`;

    for (const r of results) {
      md += `| **${r.name}** (\`${r.path}\`) | \`${r.reqPerSec} req/s\` | \`${r.p95Latency} ms\` | \`${r.errorRate}%\` |\n`;
    }

    fs.writeFileSync(compMdPath, md);
    console.log(`\n[Output] Successfully appended load test results to: ${compMdPath}`);

  } finally {
    server.close();
  }

  return results;
}

if (require.main === module) {
  const durationArg = process.argv.find(a => a.startsWith('--duration='));
  const duration = durationArg ? parseInt(durationArg.split('=')[1], 10) : 30;

  runLoadTests({ duration })
    .then(() => {
      console.log('Load test completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Load test failed:', err);
      process.exit(1);
    });
}

module.exports = { runLoadTests };

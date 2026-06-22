import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = 'http://host.docker.internal:8084/healthz';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>0'],
  },
};

export function handleSummary(data) {
  const ts = __ENV.K6_RUN_TIMESTAMP || (() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
           `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  })();
  return {
    [`/tests/reports/summary-${ts}.json`]: JSON.stringify(data, null, 2),
  };
}

export default function () {
  const res = http.get(TARGET_URL);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
  sleep(1);
}

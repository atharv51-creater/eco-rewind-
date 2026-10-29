import http from 'http';
import { ML_URL, ML_TIMEOUT_MS } from './config.js';

function sanitizedHeaders(req, url) {
  const headers = { ...req.headers, host: url.host };
  delete headers.authorization;
  delete headers.cookie;
  return headers;
}

/**
 * Proxy a request to the Python classifier. Used for public read-only
 * inference endpoints (/api/classify, /api/model-info, /api/sample).
 */
export function forwardToMl(req, res, targetPath) {
  const url = new URL(targetPath || req.originalUrl || req.url, ML_URL);
  const headers = sanitizedHeaders(req, url);

  let postBody = null;
  const isMultipart = req.is('multipart/form-data');
  if (req.body && Object.keys(req.body).length > 0 && !isMultipart) {
    postBody = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
    headers['content-length'] = Buffer.byteLength(postBody);
  }

  const proxyReq = http.request(
    url,
    { method: req.method, headers, timeout: ML_TIMEOUT_MS },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'ml_timeout' });
  });

  proxyReq.on('error', (err) => {
    console.warn('[ML] forwarding error:', err.message);
    if (res.headersSent) return;
    res.json({
      decision: 'rejected',
      reason: 'AI service warming up / chamber empty',
      label: 'other_invalid',
      display_label: 'Invalid item',
      confidence: 0.0,
      scores: { aluminium_can: 0.0, other_invalid: 1.0, plastic_bag: 0.0, plastic_bottle: 0.0 },
      rate_paise_per_gram: 0,
      rate_paise: 0,
      key: 'other_invalid',
      valid: false,
      model: '4-Class MobileNetV2',
    });
  });

  if (postBody) {
    proxyReq.write(postBody);
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}

/**
 * Classify a multipart scan request. Returns the classifier JSON, which
 * includes the echoed weight/user/machine fields for the Node reward engine.
 */
export function classifyFromRequest(req) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/scan', ML_URL);
    const headers = sanitizedHeaders(req, url);

    const proxyReq = http.request(
      url,
      { method: 'POST', headers, timeout: ML_TIMEOUT_MS },
      (proxyRes) => {
        let raw = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', (chunk) => {
          raw += chunk;
        });
        proxyRes.on('end', () => {
          if (proxyRes.statusCode >= 400) {
            return reject(new Error(`ML responded ${proxyRes.statusCode}`));
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error('ML returned invalid JSON'));
          }
        });
      }
    );

    proxyReq.on('timeout', () => proxyReq.destroy(new Error('ML timeout')));
    proxyReq.on('error', reject);
    req.pipe(proxyReq);
  });
}

/**
 * Read-only ML health probe. Never throws; used by the Node /api/health
 * endpoint so the UI can show classifier readiness without blocking.
 */
export function getMlHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const url = new URL('/health', ML_URL);
    const probe = http.get(url, { timeout: timeoutMs }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return resolve({ model_ready: false, model_detail: `ML responded ${res.statusCode}` });
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({ model_ready: false, model_detail: 'ML returned invalid JSON' });
        }
      });
    });
    probe.on('timeout', () => {
      probe.destroy();
      resolve({ model_ready: false, model_detail: 'ML health check timed out' });
    });
    probe.on('error', (err) => {
      resolve({ model_ready: false, model_detail: err.message });
    });
  });
}

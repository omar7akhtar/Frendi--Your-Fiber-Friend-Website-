const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // ── STEP 1: method check ─────────────────────────────────────────────────
  console.log('[subscribe] method:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    console.log('[subscribe] rejected: not POST');
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method not allowed.' }) };
  }

  // ── STEP 2: environment variable presence ────────────────────────────────
  const keyExists = Boolean(process.env.BREVO_API_KEY);
  const keyLength = keyExists ? process.env.BREVO_API_KEY.length : 0;
  console.log('[subscribe] BREVO_API_KEY present:', keyExists, '| length:', keyLength);

  if (!keyExists) {
    console.error('[subscribe] FATAL: BREVO_API_KEY is not set — aborting before Brevo call');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Server configuration error. Please try again later.' }),
    };
  }

  // ── STEP 3: parse request body ───────────────────────────────────────────
  console.log('[subscribe] raw body:', event.body);
  let email;
  try {
    ({ email } = JSON.parse(event.body || '{}'));
  } catch (parseErr) {
    console.error('[subscribe] body parse error:', parseErr.message);
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid request.' }) };
  }
  console.log('[subscribe] parsed email:', email);

  // ── STEP 4: validate email ───────────────────────────────────────────────
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    console.log('[subscribe] rejected: invalid email');
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Please enter a valid email address.' }),
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log('[subscribe] normalized email:', normalizedEmail);

  // ── STEP 5: build Brevo payload ──────────────────────────────────────────
  const brevoPayload = {
    email: normalizedEmail,
    listIds: [2],
    updateEnabled: true,
  };
  const payloadStr = JSON.stringify(brevoPayload);
  console.log('[subscribe] Brevo request payload:', payloadStr);
  console.log('[subscribe] Brevo endpoint: POST https://api.brevo.com/v3/contacts');
  console.log('[subscribe] List ID being used:', brevoPayload.listIds);

  // ── STEP 6: call Brevo ───────────────────────────────────────────────────
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/contacts',
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-length': Buffer.byteLength(payloadStr),
      },
    };

    console.log('[subscribe] opening HTTPS request to api.brevo.com/v3/contacts');

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        // ── STEP 7: log full Brevo response ─────────────────────────────
        console.log('[subscribe] Brevo HTTP status:', res.statusCode);
        console.log('[subscribe] Brevo response headers:', JSON.stringify(res.headers));
        console.log('[subscribe] Brevo response body:', body || '(empty)');

        if (res.statusCode === 201) {
          console.log('[subscribe] SUCCESS: new contact created');
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: "You're on the waitlist! We'll email you when Frendi launches.",
            }),
          });
        } else if (res.statusCode === 204) {
          console.log('[subscribe] SUCCESS: existing contact updated / re-added to list');
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: "You're on the waitlist! We'll email you when Frendi launches.",
            }),
          });
        } else {
          console.error('[subscribe] FAILURE: unexpected Brevo status', res.statusCode, '| body:', body);
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: false,
              message: "We couldn't add your email. Please try again.",
            }),
          });
        }
      });
    });

    req.on('error', (err) => {
      // ── STEP 8: network-level error (DNS, TLS, timeout, etc.) ───────────
      console.error('[subscribe] NETWORK ERROR reaching api.brevo.com:', err.message, '| code:', err.code);
      resolve({
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Something went wrong. Please try again.",
        }),
      });
    });

    req.write(payloadStr);
    req.end();
    console.log('[subscribe] request written and sent');
  });
};

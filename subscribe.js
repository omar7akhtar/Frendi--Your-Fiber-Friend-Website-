const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const payload = JSON.stringify({
    email: normalizedEmail,
    listIds: [2],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/contacts',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve({ statusCode: 200, headers, body: JSON.stringify({ status: 'subscribed' }) });
        } else if (res.statusCode === 400 && data.includes('duplicate_parameter')) {
          resolve({ statusCode: 200, headers, body: JSON.stringify({ status: 'already_subscribed' }) });
        } else {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'brevo_error' }) });
        }
      });
    });

    req.on('error', () => {
      resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'network_error' }) });
    });

    req.write(payload);
    req.end();
  });
};

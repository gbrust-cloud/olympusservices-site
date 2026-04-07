// Olympus Services Webhook v3
// 12 individual reports + Annual Intelligence Pass
const https = require('https');

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function generatePresignedUrl(bucket, key, accessKeyId, secretAccessKey, region) {
  const crypto = require('crypto');
  const expires = 3600;
  const date = new Date();
  const dateString = date.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const credentialScope = `${dateString}/${region}/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expires}`,
    `X-Amz-SignedHeaders=host`
  ].join('&');
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalRequest = [
    'GET',
    `/${key}`,
    queryParams,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateString), region), 's3'),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `https://${host}/${key}?${queryParams}&X-Amz-Signature=${signature}`;
}

// ─── REPORT MAPPING ───────────────────────────────────────────────────────────
// product_name in Stripe metadata must match exactly one of these keys.
// Annual Pass sends all 12.
const REPORT_MAP = {
  'mythic-ai':               'reports/mythic-ai-report.pdf',
  'chai-discovery':          'reports/chai-discovery-report.pdf',
  'luma-ai':                 'reports/luma-ai-report.pdf',
  'anysphere-cursor':        'reports/anysphere-cursor-report.pdf',
  'hippocratic-ai':          'reports/hippocratic-ai-report.pdf',
  'fireworks-ai':            'reports/fireworks-ai-report.pdf',
  'uniphore':                'reports/uniphore-report.pdf',
  'anthropic':               'reports/anthropic-report.pdf',
  'carrier-billing':         'reports/carrier-billing-economics-report.pdf',
  'crypto-tax':              'reports/crypto-tax-optimization-report.pdf',
  'algorithmic-edge':        'reports/algorithmic-edge-report.pdf',
  'agentic-affiliate':       'reports/agentic-affiliate-report.pdf',
};

const ALL_REPORTS = Object.values(REPORT_MAP);

function getReportFiles(productName) {
  const name = (productName || '').toLowerCase().trim();

  // Annual Intelligence Pass → all 12
  if (name.includes('annual')) {
    return ALL_REPORTS;
  }

  // Individual report lookup
  for (const [key, file] of Object.entries(REPORT_MAP)) {
    if (name === key) return [file];
  }

  // Fallback — log unknown product so you can debug
  console.warn(`Unknown product_name: "${productName}" — defaulting to mythic-ai`);
  return [REPORT_MAP['mythic-ai']];
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);

    if (payload.type !== 'checkout.session.completed' &&
        payload.type !== 'payment_intent.succeeded') {
      return { statusCode: 200, body: 'Event received' };
    }

    const session = payload.data.object;
    const customerEmail = session.customer_details?.email || session.receipt_email;
    const productName   = session.metadata?.product_name || '';

    if (!customerEmail) {
      console.log('No customer email found');
      return { statusCode: 200, body: 'No email' };
    }

    console.log(`Processing: product="${productName}" email="${customerEmail}"`);

    const bucket          = process.env.S3_BUCKET_NAME        || 'olympus-reports';
    const region          = process.env.MY_AWS_REGION         || 'us-east-2';
    const accessKeyId     = process.env.MY_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.MY_AWS_SECRET_ACCESS_KEY;

    const reportFiles  = getReportFiles(productName);
    const downloadLinks = reportFiles.map((file) => {
      const url        = generatePresignedUrl(bucket, file, accessKeyId, secretAccessKey, region);
      const reportName = file
        .replace('reports/', '')
        .replace('-report.pdf', '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      return `<li style="margin:10px 0;">
        <a href="${url}" style="color:#FFD700;font-weight:bold;">${reportName}</a>
        <span style="color:#888;font-size:12px;"> — link expires in 1 hour</span>
      </li>`;
    }).join('');

    const isAnnual    = (productName || '').toLowerCase().includes('annual');
    const reportLabel = isAnnual
      ? 'Your full 12-report library is ready for download.'
      : 'Your research report is ready for download.';

    const emailBody = JSON.stringify({
      from: 'Olympus Services <info@olympusservices.net>',
      to:   customerEmail,
      subject: 'Your Report Is Ready',
      html: `
        <div style="background:#09080a;color:#ffffff;font-family:'Georgia',serif;max-width:600px;margin:0 auto;padding:40px;">
          <div style="border-bottom:2px solid #FFD700;padding-bottom:20px;margin-bottom:30px;">
            <h1 style="color:#FFD700;font-size:28px;margin:0;">Olympus Services</h1>
            <p style="color:#888;margin:5px 0 0;">Institutional Intelligence &middot; Chicago, IL</p>
          </div>

          <h2 style="color:#ffffff;font-size:22px;">Your Report Is Ready</h2>
          <p style="color:#cccccc;line-height:1.7;">${reportLabel} Download links expire in 1 hour for security.</p>

          <div style="background:#1a1714;border:1px solid #FFD700;border-radius:6px;padding:24px;margin:24px 0;">
            <h3 style="color:#FFD700;margin:0 0 16px;">Download Your Report${reportFiles.length > 1 ? 's' : ''}:</h3>
            <ul style="color:#ffffff;padding-left:20px;">
              ${downloadLinks}
            </ul>
          </div>

          <p style="color:#cccccc;line-height:1.7;">Questions? Reply to this email or reach us at
            <a href="mailto:info@olympusservices.net" style="color:#FFD700;">info@olympusservices.net</a>.
          </p>
          <p style="color:#cccccc;">Ready to go deeper?
            <a href="https://calendly.com/olympusservices-info/30min" style="color:#FFD700;">Book a strategic advisory call.</a>
          </p>

          <div style="border-top:1px solid #333;margin-top:30px;padding-top:20px;">
            <p style="color:#666;font-size:12px;">
              &copy; 2025 Olympus Services Corporation &middot; Chicago, IL &middot;
              <a href="https://olympusservices.net" style="color:#666;">olympusservices.net</a>
            </p>
          </div>
        </div>
      `
    });

    const emailResponse = await httpsRequest({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(emailBody)
      }
    }, emailBody);

    console.log('Email sent:', emailResponse.status, emailResponse.body);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

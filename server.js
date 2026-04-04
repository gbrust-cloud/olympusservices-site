require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const AWS = require('aws-sdk');
const { Resend } = require('resend');
const path = require('path');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = 'olympus-reports';
const DOMAIN = process.env.DOMAIN || 'https://olympusservices.net';

// ─── PRODUCT CATALOG ────────────────────────────────────────────────────────
// To add more products: copy any block below, update name/price/s3Key/priceId
const PRODUCTS = {
  'mythic-ai-report': {
    name: 'Mythic AI Intelligence Report',
    price: 4900, // in cents ($49.00)
    s3Key: 'reports/mythic-ai-report.pdf',
    priceId: process.env.PRICE_MYTHIC_AI,
  },
  'luma-ai-report': {
    name: 'Luma AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/luma-ai-report.pdf',
    priceId: process.env.PRICE_LUMA_AI,
  },
  'anthropic-report': {
    name: 'Anthropic Intelligence Report',
    price: 4900,
    s3Key: 'reports/anthropic-report.pdf',
    priceId: process.env.PRICE_ANTHROPIC,
  },
  'chai-discovery-report': {
    name: 'Chai Discovery Intelligence Report',
    price: 4900,
    s3Key: 'reports/chai-discovery-report.pdf',
    priceId: process.env.PRICE_CHAI,
  },
  'anysphere-report': {
    name: 'Anysphere / Cursor Intelligence Report',
    price: 4900,
    s3Key: 'reports/anysphere-report.pdf',
    priceId: process.env.PRICE_ANYSPHERE,
  },
  'hippocratic-ai-report': {
    name: 'Hippocratic AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/hippocratic-ai-report.pdf',
    priceId: process.env.PRICE_HIPPOCRATIC,
  },
  'fireworks-ai-report': {
    name: 'Fireworks AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/fireworks-ai-report.pdf',
    priceId: process.env.PRICE_FIREWORKS,
  },
  'uniphore-report': {
    name: 'Uniphore Intelligence Report',
    price: 4900,
    s3Key: 'reports/uniphore-report.pdf',
    priceId: process.env.PRICE_UNIPHORE,
  },
  'sesame-report': {
    name: 'Sesame Intelligence Report',
    price: 4900,
    s3Key: 'reports/sesame-report.pdf',
    priceId: process.env.PRICE_SESAME,
  },
  'baseten-report': {
    name: 'Baseten Intelligence Report',
    price: 4900,
    s3Key: 'reports/baseten-report.pdf',
    priceId: process.env.PRICE_BASETEN,
  },
  'sierra-report': {
    name: 'Sierra Intelligence Report',
    price: 4900,
    s3Key: 'reports/sierra-report.pdf',
    priceId: process.env.PRICE_SIERRA,
  },
  'youcom-report': {
    name: 'You.com Intelligence Report',
    price: 4900,
    s3Key: 'reports/youcom-report.pdf',
    priceId: process.env.PRICE_YOUCOM,
  },
  'rigetti-report': {
    name: 'Rigetti Computing Intelligence Report',
    price: 4900,
    s3Key: 'reports/rigetti-report.pdf',
    priceId: process.env.PRICE_RIGETTI,
  },
  'openai-report': {
    name: 'OpenAI Intelligence Report',
    price: 4900,
    s3Key: 'reports/openai-report.pdf',
    priceId: process.env.PRICE_OPENAI,
  },
  'cohere-report': {
    name: 'Cohere Intelligence Report',
    price: 4900,
    s3Key: 'reports/cohere-report.pdf',
    priceId: process.env.PRICE_COHERE,
  },
  'scale-ai-report': {
    name: 'Scale AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/scale-ai-report.pdf',
    priceId: process.env.PRICE_SCALE_AI,
  },
  'inflection-ai-report': {
    name: 'Inflection AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/inflection-ai-report.pdf',
    priceId: process.env.PRICE_INFLECTION,
  },
  'perplexity-report': {
    name: 'Perplexity AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/perplexity-report.pdf',
    priceId: process.env.PRICE_PERPLEXITY,
  },
  'mistral-report': {
    name: 'Mistral AI Intelligence Report',
    price: 4900,
    s3Key: 'reports/mistral-report.pdf',
    priceId: process.env.PRICE_MISTRAL,
  },
};
// ─────────────────────────────────────────────────────────────────────────────

// Serve static files from root
app.use(express.static(path.join(__dirname)));

// Parse JSON for all routes EXCEPT webhook (which needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ─── CREATE CHECKOUT SESSION ─────────────────────────────────────────────────
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { productId } = req.body;
    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({ error: 'Product not found' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: product.name },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel`,
      metadata: { productId, s3Key: product.s3Key },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── STRIPE WEBHOOK ──────────────────────────────────────────────────────────
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const { productId, s3Key } = session.metadata;

    try {
      // Generate signed S3 URL (valid for 24 hours)
      const downloadUrl = s3.getSignedUrl('getObject', {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Expires: 86400,
      });

      // Send delivery email via Resend
      await resend.emails.send({
        from: 'Olympus Services <reports@olympusservices.net>',
        to: customerEmail,
        subject: `Your Report is Ready — ${PRODUCTS[productId]?.name || 'Olympus Intelligence Report'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">Your Report is Ready</h2>
            <p>Thank you for your purchase from Olympus Services Corporation.</p>
            <p>Your report: <strong>${PRODUCTS[productId]?.name}</strong></p>
            <p>
              <a href="${downloadUrl}" 
                 style="background: #c9a84c; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Download Your Report
              </a>
            </p>
            <p style="color: #666; font-size: 12px;">
              This link expires in 24 hours. Please download your report promptly.
            </p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              Olympus Services Corporation | Chicago, IL<br>
              olympusservices.net
            </p>
          </div>
        `,
      });

      console.log(`✅ Report delivered to ${customerEmail} for product ${productId}`);
    } catch (err) {
      console.error('Delivery error:', err);
    }
  }

  res.json({ received: true });
});

// ─── SUCCESS / CANCEL PAGES ───────────────────────────────────────────────────
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Purchase Successful — Olympus Services</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 60px; background: #0a0a1a; color: #fff; }
        h1 { color: #c9a84c; }
        a { color: #c9a84c; }
      </style>
    </head>
    <body>
      <h1>Thank You!</h1>
      <p>Your purchase was successful. Check your email for your download link.</p>
      <p>The link will arrive within a few minutes.</p>
      <p><a href="/">Return to Olympus Services</a></p>
    </body>
    </html>
  `);
});

app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Purchase Cancelled — Olympus Services</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 60px; background: #0a0a1a; color: #fff; }
        h1 { color: #c9a84c; }
        a { color: #c9a84c; }
      </style>
    </head>
    <body>
      <h1>Purchase Cancelled</h1>
      <p>Your purchase was not completed. No charge was made.</p>
      <p><a href="/">Return to Olympus Services</a></p>
    </body>
    </html>
  `);
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Olympus Services running on port ${PORT}`);
});

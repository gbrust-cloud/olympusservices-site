const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');

const s3 = new AWS.S3({
  accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  region: process.env.MY_AWS_REGION
});

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const customerEmail = session.customer_details.email;
    const productName = session.metadata.product_name;
    const s3Key = session.metadata.s3_key;

    const s3Params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 3600
    };

    const downloadUrl = s3.getSignedUrl('getObject', s3Params);

    const transporter = nodemailer.createTransport({
      SES: new AWS.SES({
        accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
        region: process.env.MY_AWS_REGION
      })
    });

    await transporter.sendMail({
      from: process.env.SES_FROM_EMAIL,
      to: customerEmail,
      subject: `Your Olympus Services Report: ${productName}`,
      html: `
        <h2>Thank you for your purchase!</h2>
        <p>Your report <strong>${productName}</strong> is ready.</p>
        <p><a href="${downloadUrl}">Click here to download your report</a></p>
        <p>This link expires in 1 hour.</p>
        <p>Thank you,<br>Olympus Services Corporation</p>
      `
    });
  }

  return { statusCode: 200, body: 'OK' };
};
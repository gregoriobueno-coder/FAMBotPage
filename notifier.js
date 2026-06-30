const axios = require('axios');
const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Sends a notification using enabled channels (Desktop, Telegram, Pushover, Email).
 * @param {string} message The body text of the alert.
 * @param {string} title The title/header of the alert.
 */
async function sendNotification(message, title = 'FAM Scout Alert') {
  console.log(`\n[ALERT] ${title}: ${message}\n`);

  const promises = [];

  // 1. Desktop Notification
  if (process.env.ENABLE_DESKTOP === 'true') {
    promises.push(new Promise((resolve) => {
      notifier.notify({
        title: title,
        message: message,
        sound: true, // play sound
        wait: false
      }, (err) => {
        if (err) console.error('Desktop notification error:', err);
        resolve();
      });
    }));
  }

  // 2. Telegram Notification
  if (process.env.ENABLE_TELEGRAM === 'true') {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (token && chatId) {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      promises.push(
        axios.post(url, {
          chat_id: chatId,
          text: `*${title}*\n${message}`,
          parse_mode: 'Markdown'
        })
        .then(() => console.log('Telegram notification sent.'))
        .catch(err => console.error('Telegram notification failed:', err.message))
      );
    } else {
      console.warn('Telegram enabled but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.');
    }
  }

  // 3. Pushover Notification
  if (process.env.ENABLE_PUSHOVER === 'true') {
    const userKey = process.env.PUSHOVER_USER_KEY;
    const token = process.env.PUSHOVER_API_TOKEN;
    
    if (userKey && token) {
      const url = 'https://api.pushover.net/1/messages.json';
      promises.push(
        axios.post(url, {
          token: token,
          user: userKey,
          message: message,
          title: title
        })
        .then(() => console.log('Pushover notification sent.'))
        .catch(err => console.error('Pushover notification failed:', err.message))
      );
    } else {
      console.warn('Pushover enabled but PUSHOVER_USER_KEY or PUSHOVER_API_TOKEN is missing.');
    }
  }

  // 4. Email Notification
  if (process.env.ENABLE_EMAIL === 'true') {
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || '587', 10);
    const secure = process.env.EMAIL_SECURE === 'true';
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const to = process.env.EMAIL_TO;

    if (user && pass && to) {
      const transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: secure,
        auth: {
          user: user,
          pass: pass
        }
      });

      const mailOptions = {
        from: `"FAM Scout" <${user}>`,
        to: to,
        subject: title,
        text: message
      };

      promises.push(
        transporter.sendMail(mailOptions)
        .then(() => console.log('Email notification sent successfully.'))
        .catch(err => console.error('Email notification failed:', err.message))
      );
    } else {
      console.warn('Email enabled but EMAIL_USER, EMAIL_PASS, or EMAIL_TO is missing.');
    }
  }

  await Promise.all(promises);
}

module.exports = { sendNotification };

const nodemailer = require('nodemailer');

class NodemailerComponent {
  constructor(email = process.env.GMAIL_USER, password = process.env.GMAIL_PASS) {
    if (!email || !password) {
      throw new Error('Gmail credentials not provided. Please set GMAIL_USER and GMAIL_PASS environment variables.');
    }
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: password
      }
    });
  }

  async sendMail(to, subject, text, html) {
    try {
      const mailOptions = {
        from: this.transporter.options.auth.user,
        to,
        subject,
        text,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent: ' + info.response);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
}

module.exports = NodemailerComponent;

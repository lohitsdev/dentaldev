const NodemailerComponent = require('./utils/nodemailerComponent');

const mailer = new NodemailerComponent();

mailer.sendMail(
  'dentalreception6@gmail.com',
  'Test Email from NodemailerComponent',
  'This is a test email sent from the NodemailerComponent we just created to the same email address.',
  '<h1>Test Email</h1><p>This is a test email sent from the NodemailerComponent we just created to the same email address.</p>'
)
  .then(info => console.log('Email sent successfully:', info))
  .catch(error => console.error('Error sending email:', error));

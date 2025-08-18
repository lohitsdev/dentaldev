

## 🏗️ Tech Stack

- **Language**: JavaScript (Node.js)
- **Framework**: Express.js
- **Voice Processing**: Telnyx
- **Email**: SendGrid
- **AI**: Custom keyword-based emergency detection + Optional OpenAI GPT
- **Storage**: File-based logging

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Start the Application
```bash
# Development
npm run dev

# Production
npm start

# With custom port
PORT=8080 npm start
```

### Set up ngrok for webhooks
```bash
npx ngrok http 3000
```

## 🔧 Environment Variables

### Required Variables

#### Core Server
- `PORT` - Server port number (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `BASE_URL` - Your ngrok URL or domain for webhooks


#### SendGrid Email (Required)
- `SENDGRID_API_KEY` - Your SendGrid API key for email notifications
- `FROM_EMAIL` - Email address for outgoing notifications
- `FROM_NAME` - Display name for email sender

#### Practice Configuration
- `PRACTICE_NAME` - Name of your dental practice
- `EMERGENCY_CONTACT` - Emergency contact phone number
- `ADMIN_EMAIL` - Admin email for notifications

#### Emergency Settings
- `PRIMARY_EMERGENCY_DOCTOR` - Emergency doctor's phone number
- `ENABLE_REAL_TRANSFERS` - Enable real call transfers (true/false)
- `ENABLE_SMS_NOTIFICATIONS` - Enable SMS notifications (true/false)

#### Performance
- `TTS_SPEED_MODE` - Enable fast TTS generation (true/false)
- `TTS_CACHE_ENABLED` - Enable TTS audio caching (true/false)

### Optional Variables

#### AI Enhancement
- `OPENAI_API_KEY` - OpenAI API key for advanced emergency analysis


## 📋 Example .env File

```env
# Core Server
PORT=3000
NODE_ENV=development
BASE_URL=https://your-domain.ngrok.io


# SendGrid Email
SENDGRID_API_KEY=SG.xxxxx
FROM_EMAIL=reception@yourpractice.com
FROM_NAME=Your Dental Clinic

# Practice Configuration
PRACTICE_NAME=Your Dental Clinic
EMERGENCY_CONTACT=+1234567890
ADMIN_EMAIL=admin@yourpractice.com

# Emergency Doctor Settings
PRIMARY_EMERGENCY_DOCTOR=+1234567890
ENABLE_REAL_TRANSFERS=true
ENABLE_SMS_NOTIFICATIONS=true


## 🔄 System Workflow

1. **Patient calls** → Telnyx webhook → AI receptionist
2. **Emergency detection** → Keyword analysis → Urgency classification
3. **Emergency cases** → Doctor connection + SMS alerts
4. **Non-emergency** → Appointment intake + Email notifications
5. **HIPAA logging** → All interactions logged for compliance

## 📞 Webhook Endpoints

- `POST /webhook/call` - Main AI receptionist (voice calls)
- `POST /webhook/sms` - SMS message processing
- `POST /webhook/emergency-intake` - Emergency information collection
- `POST /webhook/connect-doctor` - Emergency doctor connection

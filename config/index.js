require('dotenv').config();

const config = {
    // Server
    server: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
        baseUrl: process.env.BASE_URL || 'http://localhost:3000'
    },

    // Anthropic
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 2000
    },

    // Database
    database: {
        path: process.env.DATABASE_PATH || './data/chatbot.db',
        backupPath: process.env.DATABASE_BACKUP_PATH || './data/backups'
    },

    // WhatsApp
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0'
    },

    // Telegram
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL
    },

    // Slack
    slack: {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN
    },

    // Discord
    discord: {
        botToken: process.env.DISCORD_BOT_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID
    },

    // HubSpot
    hubspot: {
        apiKey: process.env.HUBSPOT_API_KEY,
        fromEmail: process.env.HUBSPOT_FROM_EMAIL
    },

    // Email
    email: {
        senderName: process.env.EMAIL_SENDER_NAME,
        senderTitle: process.env.EMAIL_SENDER_TITLE,
        calendarLink: process.env.CALENDAR_LINK
    },

    // Redis
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        filePath: process.env.LOG_FILE_PATH || './logs/app.log'
    },

    // Security
    security: {
        jwtSecret: process.env.JWT_SECRET,
        sessionSecret: process.env.SESSION_SECRET,
        encryptionKey: process.env.ENCRYPTION_KEY
    },

    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    },

    // Feature Flags
    features: {
        intentDetection: process.env.ENABLE_INTENT_DETECTION === 'true',
        multiLanguage: process.env.ENABLE_MULTI_LANGUAGE === 'true',
        voiceSupport: process.env.ENABLE_VOICE_SUPPORT === 'true',
        paymentIntegration: process.env.ENABLE_PAYMENT_INTEGRATION === 'true'
    }
};

// Validation
function validateConfig() {
    const required = [
        'anthropic.apiKey'
    ];

    const missing = required.filter(key => {
        const value = key.split('.').reduce((obj, k) => obj?.[k], config);
        return !value;
    });

    if (missing.length > 0) {
        console.error('❌ Missing required configuration:');
        missing.forEach(key => console.error(`   - ${key}`));
        process.exit(1);
    }

    console.log('✅ Configuration validated successfully');
}

// Only validate in non-test environments
if (process.env.NODE_ENV !== 'test') {
    validateConfig();
}

module.exports = config;
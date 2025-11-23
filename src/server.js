require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const Anthropic = require('@anthropic-ai/sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const KeywordMatcher = require('./services/keywordMatcher');
const IntentDetector = require('./services/intentDetector');
const FlowExecutor = require('./services/flowExecutor');
const WhatsAppIntegration = require('./integrations/whatsapp');
const TelegramIntegration = require('./integrations/telegram');

const app = express();
app.use(bodyParser.json());

const DB_PATH = path.join(__dirname, '../data/chatbot.db');

let db, keywordMatcher, intentDetector, flowExecutor;

async function initialize() {
    async function initialize() {
    db = new sqlite3.Database(DB_PATH);
    console.log('Database connected');
    
    keywordMatcher = new KeywordMatcher();
    await keywordMatcher.loadFromDatabase(db);
    console.log('Keyword matcher loaded');
    
    const anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });
    
    intentDetector = new IntentDetector(process.env.ANTHROPIC_API_KEY);
    flowExecutor = new FlowExecutor(db, anthropicClient);
    
    // Initialize platform integrations
    if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
        global.whatsappClient = new WhatsAppIntegration(
            process.env.WHATSAPP_PHONE_NUMBER_ID,
            process.env.WHATSAPP_ACCESS_TOKEN
        );
        console.log('WhatsApp integration initialized');
    }
    
    if (process.env.TELEGRAM_BOT_TOKEN) {
        global.telegramClient = new TelegramIntegration(
            process.env.TELEGRAM_BOT_TOKEN
        );
        console.log('Telegram integration initialized');
    }
    
    console.log('System initialized successfully');
}

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.post('/webhook/:platform', async (req, res) => {
    const platform = req.params.platform;
    
    try {
        const message = extractMessage(platform, req.body);
        
        if (!message) {
            return res.status(200).send('OK');
        }
        
        const response = await processMessage(message);
        
        await sendResponse(platform, message.sender, response);
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        console.error('Error stack:', error.stack);
        console.error('Request body:', req.body);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

function extractMessage(platform, payload) {
    switch (platform) {
        case 'whatsapp':
            if (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
                const msg = payload.entry[0].changes[0].value.messages[0];
                return {
                    platform: 'whatsapp',
                    sender: msg.from,
                    text: msg.text?.body || '',
                    messageId: msg.id
                };
            }
            break;
        
        case 'telegram':
            if (payload.message) {
                return {
                    platform: 'telegram',
                    sender: payload.message.from.id.toString(),
                    text: payload.message.text || '',
                    messageId: payload.message.message_id
                };
            }
            break;
        
        case 'slack':
            if (payload.event?.type === 'message') {
                return {
                    platform: 'slack',
                    sender: payload.event.user,
                    text: payload.event.text || '',
                    messageId: payload.event.ts
                };
            }
            break;
        
        case 'test':
            return {
                platform: 'test',
                sender: payload.userId || 'test-user',
                text: payload.message || '',
                messageId: Date.now().toString()
            };
    }
    
    return null;
}

async function processMessage(message) {
    const user = await getOrCreateUser(message.platform, message.sender);
    
    const activeConversation = await flowExecutor.getConversation(
        user.id,
        message.platform
    );
    
    if (activeConversation) {
        return await flowExecutor.continueFlow(
            activeConversation.id,
            message.text
        );
        // Ensure we return an array
        return Array.isArray(response) ? response : [response];
    } else {
        let match = keywordMatcher.match(message.text);
        
        if (!match) {
            const flows = await getActiveFlows();
            const intent = await intentDetector.detectIntent(message.text, flows);
            
            if (intent.flowName) {
                match = { flowName: intent.flowName };
            }
        }
        
        if (match) {
            const result = await flowExecutor.startFlow(
            user.id,
            message.platform,
            match.flowName
            );
            // Ensure we return an array
            return Array.isArray(result.response) ? result.response : [result.response];
        } else {
            return [{
                type: 'message',
                content: 'Hi! How can I help you today?'
            }, {
                type: 'buttons',
                options: [
                    { label: 'Request Demo', value: 'demo' },
                    { label: 'Get Pricing', value: 'pricing' },
                    { label: 'Talk to Support', value: 'support' }
                ]
            }];
        }
    }
}

async function getOrCreateUser(platform, platformUserId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE platform = ? AND platform_user_id = ?',
            [platform, platformUserId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve(row);
                } else {
                    db.run(
                        'INSERT INTO users (platform, platform_user_id) VALUES (?, ?)',
                        [platform, platformUserId],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({ id: this.lastID, platform, platform_user_id: platformUserId });
                            }
                        }
                    );
                }
            }
        );
    });
}

async function getActiveFlows() {
    return new Promise((resolve, reject) => {
        db.all('SELECT name, description FROM flows WHERE is_active = 1', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function sendResponse(platform, recipient, responses) {
    for (const response of responses) {
        if (response.type === 'message') {
            await sendTextMessage(platform, recipient, response.content);
        } else if (response.type === 'buttons') {
            await sendButtons(platform, recipient, response.options);
        }
    }
}

async function sendTextMessage(platform, recipient, text) {
    switch (platform) {
        case 'whatsapp':
            if (global.whatsappClient) {
                await global.whatsappClient.sendMessage(recipient, text);
            } else {
                console.log(`[${platform}] To ${recipient}: ${text}`);
            }
            break;
        
        case 'telegram':
            if (global.telegramClient) {
                await global.telegramClient.sendMessage(recipient, text);
            } else {
                console.log(`[${platform}] To ${recipient}: ${text}`);
            }
            break;
        
        default:
            console.log(`[${platform}] To ${recipient}: ${text}`);
    }
}

async function sendButtons(platform, recipient, options) {
    const buttonText = 'Please select an option:';
    
    switch (platform) {
        case 'whatsapp':
            if (global.whatsappClient) {
                await global.whatsappClient.sendButtons(recipient, buttonText, options);
            } else {
                console.log(`[${platform}] Buttons to ${recipient}:`, options.map(o => o.label).join(', '));
            }
            break;
        
        case 'telegram':
            if (global.telegramClient) {
                await global.telegramClient.sendButtons(recipient, buttonText, options);
            } else {
                console.log(`[${platform}] Buttons to ${recipient}:`, options.map(o => o.label).join(', '));
            }
            break;
        
        default:
            console.log(`[${platform}] Buttons to ${recipient}:`, options.map(o => o.label).join(', '));
    }
}

const PORT = process.env.PORT || 3000;

initialize().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/:platform`);
    });
}).catch(error => {
    console.error('Failed to initialize:', error);
    process.exit(1);
});
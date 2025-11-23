const axios = require('axios');

class TelegramIntegration {
    constructor(botToken) {
        this.botToken = botToken;
        this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    }

    async sendMessage(chatId, text) {
        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Telegram send error:', error);
            throw error;
        }
    }

    async sendButtons(chatId, text, buttons) {
        const keyboard = {
            inline_keyboard: buttons.map(btn => [{
                text: btn.label,
                callback_data: btn.value
            }])
        };

        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text: text,
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Telegram send buttons error:', error);
            throw error;
        }
    }

    async setWebhook(url) {
        try {
            await axios.post(`${this.baseUrl}/setWebhook`, {
                url: url
            });
            console.log('Telegram webhook set successfully');
        } catch (error) {
            console.error('Telegram webhook setup error:', error);
            throw error;
        }
    }
}

module.exports = TelegramIntegration;
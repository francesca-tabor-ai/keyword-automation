const axios = require('axios');

class WhatsAppIntegration {
    constructor(phoneNumberId, accessToken) {
        this.phoneNumberId = phoneNumberId;
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.facebook.com/v18.0';
    }

    async sendMessage(to, text) {
        try {
            await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: to,
                    type: 'text',
                    text: { body: text }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('WhatsApp send error:', error);
            throw error;
        }
    }

    async sendButtons(to, bodyText, buttons) {
        const buttonComponents = buttons.slice(0, 3).map(btn => ({
            type: 'reply',
            reply: {
                id: btn.value,
                title: btn.label.slice(0, 20)
            }
        }));

        try {
            await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: to,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: { text: bodyText },
                        action: {
                            buttons: buttonComponents
                        }
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('WhatsApp send buttons error:', error);
            throw error;
        }
    }
}

module.exports = WhatsAppIntegration;
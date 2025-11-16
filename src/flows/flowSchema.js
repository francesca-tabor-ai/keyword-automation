// Example flow structure
const exampleFlow = {
    name: 'demo_request',
    description: 'Handle demo requests',
    steps: [
        {
            id: 'welcome',
            type: 'message',
            content: "Thanks for your interest! I'd love to help you schedule a demo.",
            next: 'ask_industry'
        },
        {
            id: 'ask_industry',
            type: 'question',
            content: 'What industry are you in?',
            inputType: 'text',
            saveAs: 'industry',
            next: 'ask_company_size'
        },
        {
            id: 'ask_company_size',
            type: 'question',
            content: 'How many employees does your company have?',
            inputType: 'buttons',
            options: [
                { label: '1-10', value: 'small', next: 'small_company_path' },
                { label: '11-50', value: 'medium', next: 'medium_company_path' },
                { label: '51-200', value: 'large', next: 'large_company_path' },
                { label: '200+', value: 'enterprise', next: 'enterprise_path' }
            ],
            saveAs: 'company_size'
        },
        {
            id: 'small_company_path',
            type: 'message',
            content: 'Perfect for a growing business! Let me connect you with our startup specialist.',
            actions: [
                { type: 'tag', value: 'small-business-lead' },
                { type: 'notify', channel: 'slack', message: 'New small business demo request' }
            ],
            next: 'schedule_demo'
        },
        {
            id: 'schedule_demo',
            type: 'message',
            content: "Here's a link to book a time: https://calendly.com/demo",
            actions: [
                { type: 'track', event: 'demo_link_sent' }
            ],
            next: 'end'
        },
        {
            id: 'end',
            type: 'end',
            content: 'Looking forward to speaking with you!'
        }
    ]
};

module.exports = { exampleFlow };
const Anthropic = require('@anthropic-ai/sdk');

class FlowExecutor {
    constructor(db, anthropicClient) {
        this.db = db;
        this.client = anthropicClient;
    }

    async getConversation(userId, platform) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM conversations WHERE user_id = ? AND platform = ? AND status = ? ORDER BY last_activity DESC LIMIT 1',
                [userId, platform, 'active'],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    async startFlow(userId, platform, flowName) {
         const flow = await this.loadFlow(flowName);
    
        if (!flow) {
            throw new Error('Flow ' + flowName + ' not found');
        }

        const conversationId = await this.createConversation(userId, platform, flowName);

        const firstStep = flow.steps[0];
        
        // Set the current step ID in context
        const context = { currentStepId: firstStep.id };
        await this.updateConversation(conversationId, context);
        
        const response = await this.executeStep(conversationId, flow, firstStep, context);

        return { conversationId, response };
    }

    async continueFlow(conversationId, userInput) {
        const conversation = await this.getConversationById(conversationId);
        const flow = await this.loadFlow(conversation.current_flow);
        const context = JSON.parse(conversation.context || '{}');

        const currentStep = flow.steps.find(s => s.id === context.currentStepId);
        
        if (!currentStep) {
            throw new Error('Invalid flow state');
        }

        if (currentStep.saveAs) {
            context[currentStep.saveAs] = userInput;
        }

        let nextStepId;
        
        if (currentStep.type === 'question' && currentStep.inputType === 'buttons') {
            const button = currentStep.options.find(opt => 
                opt.label.toLowerCase() === userInput.toLowerCase() ||
                opt.value.toLowerCase() === userInput.toLowerCase()
            );
            nextStepId = button ? button.next : currentStep.next;
        } else {
            nextStepId = currentStep.next;
        }

        const nextStep = flow.steps.find(s => s.id === nextStepId);

        if (!nextStep) {
            return this.endFlow(conversationId);
        }

        context.currentStepId = nextStep.id;
        await this.updateConversation(conversationId, context);

        return await this.executeStep(conversationId, flow, nextStep, context);
    }

    async executeStep(conversationId, flow, step, context) {
        const responses = [];

        let content = step.content;
        
        if (step.dynamic && context) {
            content = await this.generateDynamicContent(step, context);
        }

        responses.push({
            type: 'message',
            content: content
        });

        if (step.type === 'question' && step.options) {
            responses.push({
                type: 'buttons',
                options: step.options.map(opt => ({
                    label: opt.label,
                    value: opt.value
                }))
            });
        }

        if (step.actions) {
            for (const action of step.actions) {
                await this.executeAction(conversationId, action, context);
            }
        }

        if (step.type === 'end') {
            await this.endFlow(conversationId);
        }

        return responses;
    }

    async generateDynamicContent(step, context) {
        const prompt = 'Generate a personalized message for the following scenario:\n\nTemplate: ' + step.content + '\n\nUser context: ' + JSON.stringify(context, null, 2) + '\n\nInstructions: ' + (step.dynamicInstructions || 'Personalize the message based on user context') + '\n\nRespond with ONLY the personalized message text, no additional formatting.';

        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
        });

        return response.content[0].text.trim();
    }

    async executeAction(conversationId, action, context) {
        switch (action.type) {
            case 'tag':
                await this.addUserTag(conversationId, action.value);
                break;
            
            case 'notify':
                console.log('Notification: ' + action.message);
                break;
            
            case 'track':
                await this.trackEvent(conversationId, action.event, context);
                break;
            
            case 'api_call':
                break;
        }
    }

    async loadFlow(flowName) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM flows WHERE name = ? AND is_active = 1',
                [flowName],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else if (row) {
                        resolve({
                            ...row,
                            steps: JSON.parse(row.flow_definition)
                        });
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    async createConversation(userId, platform, flowName) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO conversations (user_id, platform, current_flow, context) VALUES (?, ?, ?, ?)',
                [userId, platform, flowName, JSON.stringify({ currentStepId: null })],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    async updateConversation(conversationId, context) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE conversations SET context = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(context), conversationId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async endFlow(conversationId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE conversations SET status = ? WHERE id = ?',
                ['completed', conversationId],
                (err) => {
                    if (err) reject(err);
                    else resolve({ ended: true });
                }
            );
        });
    }

    async addUserTag(conversationId, tag) {
        console.log('Adding tag: ' + tag + ' to conversation ' + conversationId);
    }

    async trackEvent(conversationId, eventName, context) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO analytics (event_type, conversation_id, metadata) VALUES (?, ?, ?)',
                [eventName, conversationId, JSON.stringify(context)],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getConversationById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM conversations WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
}

module.exports = FlowExecutor;
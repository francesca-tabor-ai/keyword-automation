# Building a ManyChat-Style Automation System with Claude Code & MCP Servers

## Executive Summary

This guide shows you how to build a keyword-triggered chatbot automation system similar to ManyChat, but using Claude Code and MCP servers. This approach can save **70-90% in costs** compared to commercial platforms like ManyChat.

**Cost Comparison:**
- ManyChat Pro: $15-$150+/month depending on contacts
- Your system: ~$5-20/month (API costs + hosting)

**What you'll build:**
- Keyword detection and intent routing
- Multi-channel support (WhatsApp, Telegram, Discord, Slack)
- Flow automation with branching logic
- CRM integration
- Analytics and monitoring
- User tagging and segmentation

---

## Architecture Overview

```
┌─────────────────┐
│   Chat Platform │  (WhatsApp, Telegram, Discord, Slack)
│   (via Webhooks)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         Webhook Receiver (Express.js)           │
│  - Receives incoming messages                    │
│  - Validates signatures                          │
│  - Routes to keyword processor                   │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│      Keyword Detection Engine                   │
│  - Pattern matching (regex)                     │
│  - Claude-powered intent detection               │
│  - Flow routing logic                            │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         Flow Execution Engine                   │
│  - Execute multi-step flows                     │
│  - Handle branching logic                       │
│  - Manage conversation state                    │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│          MCP Server Layer                       │
│  - CRM integration (via MCP)                    │
│  - Database operations                          │
│  - External API calls                           │
│  - Email/SMS triggers                           │
└─────────────────────────────────────────────────┘
```

---

## Step 1: Set Up Your Development Environment

### 1.1 Install Prerequisites

```bash
# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python (for MCP servers)
sudo apt-get install python3 python3-pip

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify installations
node --version
python3 --version
claude-code --version
```

### 1.2 Create Project Structure

```bash
mkdir chatbot-automation
cd chatbot-automation

# Create directory structure
mkdir -p src/{routes,services,flows,utils,mcp-servers}
mkdir -p config
mkdir -p logs
mkdir -p data

# Initialize project
npm init -y
```

### 1.3 Install Core Dependencies

```bash
npm install express body-parser dotenv
npm install axios node-fetch
npm install sqlite3 sequelize
npm install winston  # Logging
npm install bull redis  # Job queue
npm install @anthropic-ai/sdk
npm install zod  # Schema validation

# Development dependencies
npm install --save-dev nodemon typescript @types/node @types/express
```

---

## Step 2: Set Up Database Schema

### 2.1 Database Design

Create `src/database/schema.sql`:

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform VARCHAR(50) NOT NULL,  -- 'whatsapp', 'telegram', 'discord', 'slack'
    platform_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    tags TEXT,  -- JSON array of tags
    custom_fields TEXT,  -- JSON object for custom data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, platform_user_id)
);

-- Conversations table
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    platform VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',  -- 'active', 'completed', 'abandoned'
    current_flow VARCHAR(255),
    current_step INTEGER DEFAULT 0,
    context TEXT,  -- JSON object for conversation state
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Messages table
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    direction VARCHAR(10) NOT NULL,  -- 'inbound', 'outbound'
    content TEXT NOT NULL,
    metadata TEXT,  -- JSON for attachments, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Flows table
CREATE TABLE flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    trigger_keywords TEXT NOT NULL,  -- JSON array
    flow_definition TEXT NOT NULL,  -- JSON flow structure
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table
CREATE TABLE analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER,
    conversation_id INTEGER,
    flow_name VARCHAR(255),
    metadata TEXT,  -- JSON for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_platform_user_id ON users(platform, platform_user_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_analytics_event_type ON analytics(event_type);
CREATE INDEX idx_analytics_created_at ON analytics(created_at);
```

### 2.2 Initialize Database

Create `src/database/init.js`:

```javascript
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('Connected to SQLite database');
            
            // Read and execute schema
            const schema = fs.readFileSync(
                path.join(__dirname, 'schema.sql'),
                'utf8'
            );
            
            db.exec(schema, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log('Database schema created successfully');
                resolve(db);
            });
        });
    });
}

module.exports = { initDatabase, DB_PATH };
```

---

## Step 3: Build the Keyword Detection Engine

### 3.1 Simple Pattern Matcher

Create `src/services/keywordMatcher.js`:

```javascript
class KeywordMatcher {
    constructor() {
        this.keywords = new Map();
        this.regexPatterns = new Map();
    }

    // Register a keyword with its flow
    registerKeyword(keyword, flowName, options = {}) {
        const config = {
            matchType: options.matchType || 'contains', // 'exact', 'contains', 'regex'
            caseSensitive: options.caseSensitive || false,
            priority: options.priority || 0
        };

        if (config.matchType === 'regex') {
            this.regexPatterns.set(flowName, {
                pattern: new RegExp(keyword, config.caseSensitive ? '' : 'i'),
                priority: config.priority
            });
        } else {
            const key = config.caseSensitive ? keyword : keyword.toLowerCase();
            
            if (!this.keywords.has(key)) {
                this.keywords.set(key, []);
            }
            
            this.keywords.get(key).push({
                flowName,
                matchType: config.matchType,
                priority: config.priority
            });
        }
    }

    // Match incoming message against keywords
    match(message) {
        const matches = [];
        const processedMessage = message.toLowerCase().trim();

        // Check exact and contains matches
        for (const [keyword, flows] of this.keywords.entries()) {
            for (const flow of flows) {
                let isMatch = false;

                if (flow.matchType === 'exact') {
                    isMatch = processedMessage === keyword;
                } else if (flow.matchType === 'contains') {
                    isMatch = processedMessage.includes(keyword);
                }

                if (isMatch) {
                    matches.push({
                        flowName: flow.flowName,
                        keyword: keyword,
                        priority: flow.priority,
                        matchType: flow.matchType
                    });
                }
            }
        }

        // Check regex patterns
        for (const [flowName, config] of this.regexPatterns.entries()) {
            if (config.pattern.test(message)) {
                matches.push({
                    flowName,
                    keyword: 'regex',
                    priority: config.priority,
                    matchType: 'regex'
                });
            }
        }

        // Sort by priority (highest first)
        matches.sort((a, b) => b.priority - a.priority);

        return matches.length > 0 ? matches[0] : null;
    }

    // Load keywords from database
    async loadFromDatabase(db) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM flows WHERE is_active = 1', (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const flow of rows) {
                    const keywords = JSON.parse(flow.trigger_keywords);
                    
                    for (const keywordConfig of keywords) {
                        this.registerKeyword(
                            keywordConfig.keyword,
                            flow.name,
                            keywordConfig.options || {}
                        );
                    }
                }

                console.log(`Loaded ${rows.length} flows with keywords`);
                resolve();
            });
        });
    }
}

module.exports = KeywordMatcher;
```

### 3.2 Claude-Powered Intent Detection

Create `src/services/intentDetector.js`:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

class IntentDetector {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
    }

    async detectIntent(message, availableFlows) {
        const flowDescriptions = availableFlows.map(f => 
            `- ${f.name}: ${f.description}`
        ).join('\n');

        const prompt = `You are an intent classifier for a chatbot system. 

Available flows:
${flowDescriptions}

User message: "${message}"

Analyze the user's intent and respond with ONLY a JSON object in this exact format:
{
  "flowName": "the most appropriate flow name or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

If no flow matches well (confidence < 0.5), set flowName to null.`;

        try {
            const response = await this.client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content[0].text.trim();
            const json = JSON.parse(text);

            return {
                flowName: json.confidence >= 0.5 ? json.flowName : null,
                confidence: json.confidence,
                reasoning: json.reasoning
            };
        } catch (error) {
            console.error('Intent detection error:', error);
            return { flowName: null, confidence: 0, reasoning: 'Error' };
        }
    }
}

module.exports = IntentDetector;
```

---

## Step 4: Build the Flow Execution Engine

### 4.1 Flow Definition Schema

Create `src/flows/flowSchema.js`:

```javascript
// Example flow structure
const exampleFlow = {
    name: 'demo_request',
    description: 'Handle demo requests',
    steps: [
        {
            id: 'welcome',
            type: 'message',
            content: 'Thanks for your interest! I\'d love to help you schedule a demo.',
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
            content: 'Here\'s a link to book a time: https://calendly.com/demo',
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
```

### 4.2 Flow Executor

Create `src/services/flowExecutor.js`:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

class FlowExecutor {
    constructor(db, anthropicClient) {
        this.db = db;
        this.client = anthropicClient;
    }

    // Get or create conversation
    async getConversation(userId, platform) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM conversations 
                 WHERE user_id = ? AND platform = ? AND status = 'active'
                 ORDER BY last_activity DESC LIMIT 1`,
                [userId, platform],
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

    // Start a new flow
    async startFlow(userId, platform, flowName) {
        const flow = await this.loadFlow(flowName);
        
        if (!flow) {
            throw new Error(`Flow ${flowName} not found`);
        }

        // Create new conversation
        const conversationId = await this.createConversation(userId, platform, flowName);

        // Execute first step
        const firstStep = flow.steps[0];
        const response = await this.executeStep(conversationId, flow, firstStep, null);

        return { conversationId, response };
    }

    // Continue an existing flow
    async continueFlow(conversationId, userInput) {
        const conversation = await this.getConversationById(conversationId);
        const flow = await this.loadFlow(conversation.current_flow);
        const context = JSON.parse(conversation.context || '{}');

        // Get current step
        const currentStep = flow.steps.find(s => s.id === context.currentStepId);
        
        if (!currentStep) {
            throw new Error('Invalid flow state');
        }

        // Save user input if needed
        if (currentStep.saveAs) {
            context[currentStep.saveAs] = userInput;
        }

        // Determine next step
        let nextStepId;
        
        if (currentStep.type === 'question' && currentStep.inputType === 'buttons') {
            // Find matching button
            const button = currentStep.options.find(opt => 
                opt.label.toLowerCase() === userInput.toLowerCase() ||
                opt.value.toLowerCase() === userInput.toLowerCase()
            );
            nextStepId = button ? button.next : currentStep.next;
        } else {
            nextStepId = currentStep.next;
        }

        // Get next step
        const nextStep = flow.steps.find(s => s.id === nextStepId);

        if (!nextStep) {
            return this.endFlow(conversationId);
        }

        // Update context
        context.currentStepId = nextStep.id;
        await this.updateConversation(conversationId, context);

        // Execute next step
        return await this.executeStep(conversationId, flow, nextStep, context);
    }

    // Execute a single step
    async executeStep(conversationId, flow, step, context) {
        const responses = [];

        // Process step content (may use Claude for dynamic content)
        let content = step.content;
        
        if (step.dynamic && context) {
            content = await this.generateDynamicContent(step, context);
        }

        responses.push({
            type: 'message',
            content: content
        });

        // Add buttons if question type
        if (step.type === 'question' && step.options) {
            responses.push({
                type: 'buttons',
                options: step.options.map(opt => ({
                    label: opt.label,
                    value: opt.value
                }))
            });
        }

        // Execute actions
        if (step.actions) {
            for (const action of step.actions) {
                await this.executeAction(conversationId, action, context);
            }
        }

        // Handle end step
        if (step.type === 'end') {
            await this.endFlow(conversationId);
        }

        return responses;
    }

    // Generate dynamic content using Claude
    async generateDynamicContent(step, context) {
        const prompt = `Generate a personalized message for the following scenario:

Template: ${step.content}

User context: ${JSON.stringify(context, null, 2)}

Instructions: ${step.dynamicInstructions || 'Personalize the message based on user context'}

Respond with ONLY the personalized message text, no additional formatting.`;

        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }]
        });

        return response.content[0].text.trim();
    }

    // Execute actions (tags, notifications, API calls)
    async executeAction(conversationId, action, context) {
        switch (action.type) {
            case 'tag':
                await this.addUserTag(conversationId, action.value);
                break;
            
            case 'notify':
                // Implement notification logic (Slack, email, etc.)
                console.log(`Notification: ${action.message}`);
                break;
            
            case 'track':
                await this.trackEvent(conversationId, action.event, context);
                break;
            
            case 'api_call':
                // Call external API via MCP server
                break;
        }
    }

    // Database helper methods
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
                `INSERT INTO conversations (user_id, platform, current_flow, context)
                 VALUES (?, ?, ?, ?)`,
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
                `UPDATE conversations 
                 SET context = ?, last_activity = CURRENT_TIMESTAMP
                 WHERE id = ?`,
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
                `UPDATE conversations SET status = 'completed' WHERE id = ?`,
                [conversationId],
                (err) => {
                    if (err) reject(err);
                    else resolve({ ended: true });
                }
            );
        });
    }

    async addUserTag(conversationId, tag) {
        // Implementation for adding tags
    }

    async trackEvent(conversationId, eventName, context) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO analytics (event_type, conversation_id, metadata)
                 VALUES (?, ?, ?)`,
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
```

---

## Step 5: Build MCP Servers for Integrations

### 5.1 CRM Integration MCP Server

Create `src/mcp-servers/crm-server.py`:

```python
#!/usr/bin/env python3
"""
MCP Server for CRM Integration
Handles contacts, deals, notes, and tasks
"""

import asyncio
import json
from typing import Any
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types
import sqlite3
import os

# Simple in-memory CRM for demo (replace with real CRM API)
class SimpleCRM:
    def __init__(self, db_path):
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT,
                phone TEXT,
                company TEXT,
                tags TEXT,
                custom_fields TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER,
                title TEXT,
                value REAL,
                stage TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contact_id) REFERENCES contacts(id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def create_contact(self, name, email=None, phone=None, company=None, tags=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO contacts (name, email, phone, company, tags)
               VALUES (?, ?, ?, ?, ?)''',
            (name, email, phone, company, json.dumps(tags or []))
        )
        
        contact_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return contact_id
    
    def get_contact(self, contact_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM contacts WHERE id = ?', (contact_id,))
        row = cursor.fetchone()
        
        conn.close()
        
        if row:
            return {
                'id': row[0],
                'name': row[1],
                'email': row[2],
                'phone': row[3],
                'company': row[4],
                'tags': json.loads(row[5] or '[]')
            }
        return None
    
    def create_deal(self, contact_id, title, value, stage='new'):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO deals (contact_id, title, value, stage)
               VALUES (?, ?, ?, ?)''',
            (contact_id, title, value, stage)
        )
        
        deal_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return deal_id

# Initialize MCP server
server = Server("crm-integration")
crm = SimpleCRM(os.path.join(os.path.dirname(__file__), '../../data/crm.db'))

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available CRM tools"""
    return [
        types.Tool(
            name="create_contact",
            description="Create a new contact in the CRM",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "company": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["name"]
            }
        ),
        types.Tool(
            name="get_contact",
            description="Retrieve contact information",
            inputSchema={
                "type": "object",
                "properties": {
                    "contact_id": {"type": "integer"}
                },
                "required": ["contact_id"]
            }
        ),
        types.Tool(
            name="create_deal",
            description="Create a new deal for a contact",
            inputSchema={
                "type": "object",
                "properties": {
                    "contact_id": {"type": "integer"},
                    "title": {"type": "string"},
                    "value": {"type": "number"},
                    "stage": {"type": "string"}
                },
                "required": ["contact_id", "title", "value"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool execution"""
    
    if name == "create_contact":
        contact_id = crm.create_contact(
            name=arguments["name"],
            email=arguments.get("email"),
            phone=arguments.get("phone"),
            company=arguments.get("company"),
            tags=arguments.get("tags")
        )
        return [types.TextContent(
            type="text",
            text=json.dumps({"contact_id": contact_id, "status": "created"})
        )]
    
    elif name == "get_contact":
        contact = crm.get_contact(arguments["contact_id"])
        return [types.TextContent(
            type="text",
            text=json.dumps(contact)
        )]
    
    elif name == "create_deal":
        deal_id = crm.create_deal(
            contact_id=arguments["contact_id"],
            title=arguments["title"],
            value=arguments["value"],
            stage=arguments.get("stage", "new")
        )
        return [types.TextContent(
            type="text",
            text=json.dumps({"deal_id": deal_id, "status": "created"})
        )]
    
    raise ValueError(f"Unknown tool: {name}")

async def main():
    """Run the MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="crm-integration",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={}
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
```

### 5.2 Analytics MCP Server

Create `src/mcp-servers/analytics-server.py`:

```python
#!/usr/bin/env python3
"""
MCP Server for Analytics
Track events, generate reports, calculate metrics
"""

import asyncio
import json
from datetime import datetime, timedelta
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types
import sqlite3
import os

class Analytics:
    def __init__(self, db_path):
        self.db_path = db_path
    
    def track_event(self, event_type, metadata):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO analytics (event_type, metadata)
               VALUES (?, ?)''',
            (event_type, json.dumps(metadata))
        )
        
        conn.commit()
        conn.close()
    
    def get_metrics(self, days=7):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        since_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        # Total conversations
        cursor.execute(
            '''SELECT COUNT(*) FROM conversations 
               WHERE created_at >= ?''',
            (since_date,)
        )
        total_conversations = cursor.fetchone()[0]
        
        # Completed flows
        cursor.execute(
            '''SELECT COUNT(*) FROM conversations 
               WHERE status = 'completed' AND created_at >= ?''',
            (since_date,)
        )
        completed_flows = cursor.fetchone()[0]
        
        # Most triggered flows
        cursor.execute(
            '''SELECT current_flow, COUNT(*) as count 
               FROM conversations 
               WHERE created_at >= ?
               GROUP BY current_flow
               ORDER BY count DESC
               LIMIT 5''',
            (since_date,)
        )
        top_flows = cursor.fetchall()
        
        conn.close()
        
        return {
            'period_days': days,
            'total_conversations': total_conversations,
            'completed_flows': completed_flows,
            'completion_rate': completed_flows / total_conversations if total_conversations > 0 else 0,
            'top_flows': [{'flow': f[0], 'count': f[1]} for f in top_flows]
        }

server = Server("analytics")
analytics = Analytics(os.path.join(os.path.dirname(__file__), '../../data/chatbot.db'))

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="track_event",
            description="Track a custom event",
            inputSchema={
                "type": "object",
                "properties": {
                    "event_type": {"type": "string"},
                    "metadata": {"type": "object"}
                },
                "required": ["event_type"]
            }
        ),
        types.Tool(
            name="get_metrics",
            description="Get conversation metrics",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "default": 7}
                }
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    
    if name == "track_event":
        analytics.track_event(
            arguments["event_type"],
            arguments.get("metadata", {})
        )
        return [types.TextContent(
            type="text",
            text=json.dumps({"status": "tracked"})
        )]
    
    elif name == "get_metrics":
        metrics = analytics.get_metrics(arguments.get("days", 7))
        return [types.TextContent(
            type="text",
            text=json.dumps(metrics, indent=2)
        )]
    
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="analytics",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={}
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Step 6: Build the Main Application Server

### 6.1 Express Server with Webhook Receivers

Create `src/server.js`:

```javascript
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const Anthropic = require('@anthropic-ai/sdk');
const { initDatabase } = require('./database/init');
const KeywordMatcher = require('./services/keywordMatcher');
const IntentDetector = require('./services/intentDetector');
const FlowExecutor = require('./services/flowExecutor');

const app = express();
app.use(bodyParser.json());

// Initialize services
let db, keywordMatcher, intentDetector, flowExecutor;

async function initialize() {
    // Initialize database
    db = await initDatabase();
    
    // Initialize keyword matcher
    keywordMatcher = new KeywordMatcher();
    await keywordMatcher.loadFromDatabase(db);
    
    // Initialize intent detector
    const anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });
    
    intentDetector = new IntentDetector(process.env.ANTHROPIC_API_KEY);
    flowExecutor = new FlowExecutor(db, anthropicClient);
    
    console.log('System initialized successfully');
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Generic webhook receiver for all platforms
app.post('/webhook/:platform', async (req, res) => {
    const platform = req.params.platform;
    
    try {
        // Extract message details based on platform
        const message = extractMessage(platform, req.body);
        
        if (!message) {
            return res.status(200).send('OK');
        }
        
        // Process message
        const response = await processMessage(message);
        
        // Send response back to platform
        await sendResponse(platform, message.sender, response);
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// Extract message from platform-specific format
function extractMessage(platform, payload) {
    switch (platform) {
        case 'whatsapp':
            // WhatsApp webhook format
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
            // Telegram webhook format
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
            // Slack webhook format
            if (payload.event?.type === 'message') {
                return {
                    platform: 'slack',
                    sender: payload.event.user,
                    text: payload.event.text || '',
                    messageId: payload.event.ts
                };
            }
            break;
    }
    
    return null;
}

// Process incoming message
async function processMessage(message) {
    // Get or create user
    const user = await getOrCreateUser(message.platform, message.sender);
    
    // Check for active conversation
    const activeConversation = await flowExecutor.getConversation(
        user.id,
        message.platform
    );
    
    if (activeConversation) {
        // Continue existing flow
        return await flowExecutor.continueFlow(
            activeConversation.id,
            message.text
        );
    } else {
        // Try keyword matching first
        let match = keywordMatcher.match(message.text);
        
        // If no keyword match, try intent detection
        if (!match) {
            const flows = await getActiveFlows();
            const intent = await intentDetector.detectIntent(message.text, flows);
            
            if (intent.flowName) {
                match = { flowName: intent.flowName };
            }
        }
        
        if (match) {
            // Start matched flow
            const result = await flowExecutor.startFlow(
                user.id,
                message.platform,
                match.flowName
            );
            return result.response;
        } else {
            // Fallback response
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

// Get or create user
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
                    // Create new user
                    db.run(
                        `INSERT INTO users (platform, platform_user_id)
                         VALUES (?, ?)`,
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

// Get active flows
async function getActiveFlows() {
    return new Promise((resolve, reject) => {
        db.all('SELECT name, description FROM flows WHERE is_active = 1', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Send response to platform
async function sendResponse(platform, recipient, responses) {
    // Implement platform-specific sending logic
    for (const response of responses) {
        if (response.type === 'message') {
            await sendTextMessage(platform, recipient, response.content);
        } else if (response.type === 'buttons') {
            await sendButtons(platform, recipient, response.options);
        }
    }
}

async function sendTextMessage(platform, recipient, text) {
    // Implementation depends on platform
    console.log(`Sending to ${platform} user ${recipient}: ${text}`);
}

async function sendButtons(platform, recipient, options) {
    // Implementation depends on platform
    console.log(`Sending buttons to ${platform} user ${recipient}:`, options);
}

// Start server
const PORT = process.env.PORT || 3000;

initialize().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(error => {
    console.error('Failed to initialize:', error);
    process.exit(1);
});
```

---

## Step 7: Set Up Platform Integrations

### 7.1 WhatsApp Integration

Create `src/integrations/whatsapp.js`:

```javascript
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
                title: btn.label.slice(0, 20)  // Max 20 chars
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
```

### 7.2 Telegram Integration

Create `src/integrations/telegram.js`:

```javascript
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
```

---

## Step 8: Create Configuration & Environment

### 8.1 Environment Variables

Create `.env`:

```env
# Anthropic API
ANTHROPIC_API_KEY=your_api_key_here

# Server
PORT=3000
NODE_ENV=development

# WhatsApp (Meta Business)
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# Slack
SLACK_BOT_TOKEN=your_bot_token
SLACK_SIGNING_SECRET=your_signing_secret

# Discord
DISCORD_BOT_TOKEN=your_bot_token

# Database
DATABASE_PATH=./data/chatbot.db

# MCP Servers
MCP_CRM_SERVER=python3 src/mcp-servers/crm-server.py
MCP_ANALYTICS_SERVER=python3 src/mcp-servers/analytics-server.py

# Redis (for job queue)
REDIS_URL=redis://localhost:6379
```

### 8.2 Package.json Scripts

Update `package.json`:

```json
{
  "name": "chatbot-automation",
  "version": "1.0.0",
  "description": "ManyChat-style automation with Claude and MCP",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "init-db": "node src/database/init.js",
    "test": "jest",
    "mcp:crm": "python3 src/mcp-servers/crm-server.py",
    "mcp:analytics": "python3 src/mcp-servers/analytics-server.py"
  },
  "keywords": ["chatbot", "automation", "claude", "mcp"],
  "author": "",
  "license": "MIT"
}
```

---

## Step 9: Create Sample Flows

### 9.1 Seed Database with Flows

Create `src/database/seed.js`:

```javascript
const { initDatabase } = require('./init');

async function seedFlows() {
    const db = await initDatabase();

    const flows = [
        {
            name: 'demo_request',
            description: 'Handle demo requests',
            trigger_keywords: JSON.stringify([
                { keyword: 'demo', options: { matchType: 'contains' } },
                { keyword: 'schedule demo', options: { matchType: 'contains' } },
                { keyword: 'book demo', options: { matchType: 'contains' } }
            ]),
            flow_definition: JSON.stringify([
                {
                    id: 'welcome',
                    type: 'message',
                    content: '👋 Thanks for your interest in a demo! Let me gather a few details.',
                    next: 'ask_name'
                },
                {
                    id: 'ask_name',
                    type: 'question',
                    content: 'What\'s your name?',
                    inputType: 'text',
                    saveAs: 'name',
                    next: 'ask_company'
                },
                {
                    id: 'ask_company',
                    type: 'question',
                    content: 'What company do you work for?',
                    inputType: 'text',
                    saveAs: 'company',
                    next: 'ask_size'
                },
                {
                    id: 'ask_size',
                    type: 'question',
                    content: 'How many employees?',
                    inputType: 'buttons',
                    options: [
                        { label: '1-10', value: 'small', next: 'small_path' },
                        { label: '11-50', value: 'medium', next: 'medium_path' },
                        { label: '51+', value: 'large', next: 'large_path' }
                    ],
                    saveAs: 'company_size'
                },
                {
                    id: 'small_path',
                    type: 'message',
                    content: 'Perfect! Our startup plan would be ideal for you.',
                    actions: [
                        { type: 'tag', value: 'small-business' },
                        { type: 'track', event: 'demo_small_business' }
                    ],
                    next: 'calendar'
                },
                {
                    id: 'medium_path',
                    type: 'message',
                    content: 'Great! Our growth plan is perfect for mid-sized teams.',
                    actions: [
                        { type: 'tag', value: 'medium-business' },
                        { type: 'track', event: 'demo_medium_business' }
                    ],
                    next: 'calendar'
                },
                {
                    id: 'large_path',
                    type: 'message',
                    content: 'Excellent! Let me connect you with our enterprise team.',
                    actions: [
                        { type: 'tag', value: 'enterprise' },
                        { type: 'track', event: 'demo_enterprise' }
                    ],
                    next: 'calendar'
                },
                {
                    id: 'calendar',
                    type: 'message',
                    content: 'Book a time here: https://calendly.com/your-link',
                    next: 'end'
                },
                {
                    id: 'end',
                    type: 'end',
                    content: 'Looking forward to showing you what we can do! 🚀'
                }
            ])
        },
        {
            name: 'pricing_inquiry',
            description: 'Provide pricing information',
            trigger_keywords: JSON.stringify([
                { keyword: 'pricing', options: { matchType: 'contains' } },
                { keyword: 'price', options: { matchType: 'contains' } },
                { keyword: 'cost', options: { matchType: 'contains' } },
                { keyword: 'how much', options: { matchType: 'contains' } }
            ]),
            flow_definition: JSON.stringify([
                {
                    id: 'welcome',
                    type: 'message',
                    content: 'I\'d be happy to share our pricing with you!',
                    next: 'ask_plan'
                },
                {
                    id: 'ask_plan',
                    type: 'question',
                    content: 'Which plan are you interested in?',
                    inputType: 'buttons',
                    options: [
                        { label: 'Starter', value: 'starter', next: 'starter_price' },
                        { label: 'Growth', value: 'growth', next: 'growth_price' },
                        { label: 'Enterprise', value: 'enterprise', next: 'enterprise_price' }
                    ],
                    saveAs: 'plan_interest'
                },
                {
                    id: 'starter_price',
                    type: 'message',
                    content: 'Our Starter plan is $49/month and includes:\n• 1,000 conversations/month\n• Basic integrations\n• Email support',
                    next: 'offer_demo'
                },
                {
                    id: 'growth_price',
                    type: 'message',
                    content: 'Our Growth plan is $149/month and includes:\n• 10,000 conversations/month\n• Advanced integrations\n• Priority support',
                    next: 'offer_demo'
                },
                {
                    id: 'enterprise_price',
                    type: 'message',
                    content: 'Our Enterprise plan is custom priced and includes:\n• Unlimited conversations\n• White-label options\n• Dedicated support',
                    next: 'offer_demo'
                },
                {
                    id: 'offer_demo',
                    type: 'question',
                    content: 'Would you like to schedule a demo?',
                    inputType: 'buttons',
                    options: [
                        { label: 'Yes', value: 'yes', next: 'demo_link' },
                        { label: 'No', value: 'no', next: 'end' }
                    ]
                },
                {
                    id: 'demo_link',
                    type: 'message',
                    content: 'Great! Book here: https://calendly.com/your-link',
                    actions: [
                        { type: 'track', event: 'pricing_to_demo' }
                    ],
                    next: 'end'
                },
                {
                    id: 'end',
                    type: 'end',
                    content: 'Feel free to reach out if you have more questions!'
                }
            ])
        }
    ];

    for (const flow of flows) {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO flows (name, description, trigger_keywords, flow_definition)
                 VALUES (?, ?, ?, ?)`,
                [flow.name, flow.description, flow.trigger_keywords, flow.flow_definition],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    console.log('Flows seeded successfully');
    db.close();
}

seedFlows().catch(console.error);
```

Run: `node src/database/seed.js`

---

## Step 10: Deploy and Test

### 10.1 Local Testing

```bash
# Start the server
npm run dev

# Test with curl
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "from": {"id": 12345},
      "text": "I want a demo",
      "message_id": 1
    }
  }'
```

### 10.2 Deploy to Production

**Option 1: Railway.app (Recommended)**

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set ANTHROPIC_API_KEY=your_key

# Deploy
railway up
```

**Option 2: DigitalOcean App Platform**

```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin your-repo-url
git push -u origin main

# Then deploy via DigitalOcean dashboard
# Connect GitHub repo
# Add environment variables
# Deploy
```

**Option 3: AWS EC2**

```bash
# SSH to EC2 instance
ssh -i your-key.pem ubuntu@your-ip

# Clone repo
git clone your-repo
cd your-repo

# Install dependencies
npm install

# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name chatbot-automation
pm2 save
pm2 startup
```

### 10.3 Set Up Webhooks

**WhatsApp:**
1. Go to Meta for Developers
2. Configure webhook URL: `https://your-domain.com/webhook/whatsapp`
3. Add verify token from .env
4. Subscribe to messages

**Telegram:**
```bash
curl -X POST https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook/telegram"}'
```

---

## Step 11: Monitor and Optimize

### 11.1 Add Logging

Create `src/utils/logger.js`:

```javascript
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

module.exports = logger;
```

### 11.2 Create Analytics Dashboard

Create `src/routes/dashboard.js`:

```javascript
const express = require('express');
const router = express.Router();

router.get('/dashboard', async (req, res) => {
    // Query analytics from database
    const metrics = await getMetrics();
    
    res.json({
        total_users: metrics.total_users,
        active_conversations: metrics.active_conversations,
        flows_triggered: metrics.flows_triggered,
        top_keywords: metrics.top_keywords,
        conversion_rate: metrics.conversion_rate
    });
});

async function getMetrics() {
    // Implementation
    return {
        total_users: 150,
        active_conversations: 12,
        flows_triggered: 340,
        top_keywords: ['demo', 'pricing', 'help'],
        conversion_rate: 0.45
    };
}

module.exports = router;
```

---

## Cost Analysis

### ManyChat Pro Plan
- $15-50/month for 500-1,000 contacts
- $150+/month for 5,000+ contacts
- Limited customization
- Platform lock-in

### Your Custom System
- **Anthropic API**: ~$5-15/month (500-2,000 completions)
- **Hosting**: $5-10/month (Railway/DigitalOcean)
- **Total**: ~$10-25/month
- **Savings**: 70-90%

### Cost Per Conversation
- ManyChat: $0.03-0.05
- Your system: $0.005-0.01
- **5-10x cheaper**

---

---

## Step 12: Add Survey Functionality with Personalized Email Outreach

### 12.1 Survey Flow Builder

Create `src/flows/surveyFlow.js`:

```javascript
class SurveyFlow {
    constructor() {
        this.surveyDefinitions = new Map();
    }

    // Define a survey with multiple questions
    createSurvey(surveyName, config) {
        const surveySteps = [];
        
        // Welcome step
        surveySteps.push({
            id: 'survey_welcome',
            type: 'message',
            content: config.welcomeMessage || 'Thanks for taking our survey! This will only take a few minutes.',
            next: `question_1`
        });

        // Generate question steps
        config.questions.forEach((question, index) => {
            const questionId = `question_${index + 1}`;
            const nextQuestionId = index < config.questions.length - 1 
                ? `question_${index + 2}` 
                : 'survey_complete';

            surveySteps.push({
                id: questionId,
                type: 'question',
                content: question.text,
                inputType: question.type, // 'text', 'buttons', 'scale', 'multiselect'
                options: question.options,
                saveAs: question.saveAs,
                validation: question.validation,
                next: nextQuestionId
            });
        });

        // Survey completion step
        surveySteps.push({
            id: 'survey_complete',
            type: 'message',
            content: config.completionMessage || 'Thank you for completing the survey!',
            actions: [
                { type: 'tag', value: `survey_${surveyName}_completed` },
                { type: 'track', event: 'survey_completed', metadata: { survey: surveyName } },
                { type: 'trigger_email_flow', surveyName: surveyName }
            ],
            next: 'end'
        });

        surveySteps.push({
            id: 'end',
            type: 'end',
            content: config.farewellMessage || 'We appreciate your feedback! 🙏'
        });

        const flow = {
            name: `survey_${surveyName}`,
            description: config.description,
            trigger_keywords: config.triggerKeywords || [],
            flow_definition: JSON.stringify(surveySteps)
        };

        this.surveyDefinitions.set(surveyName, flow);
        return flow;
    }

    // Save survey responses
    async saveSurveyResponse(db, userId, surveyName, responses) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO survey_responses (user_id, survey_name, responses, completed_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, surveyName, JSON.stringify(responses)],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    // Get survey responses for a user
    async getSurveyResponses(db, userId, surveyName) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM survey_responses 
                 WHERE user_id = ? AND survey_name = ?
                 ORDER BY completed_at DESC LIMIT 1`,
                [userId, surveyName],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? { ...row, responses: JSON.parse(row.responses) } : null);
                }
            );
        });
    }
}

module.exports = SurveyFlow;
```

### 12.2 Update Database Schema for Surveys

Create `src/database/surveys-schema.sql`:

```sql
-- Survey responses table
CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    survey_name VARCHAR(255) NOT NULL,
    responses TEXT NOT NULL,  -- JSON object with all responses
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    email_sent BOOLEAN DEFAULT 0,
    email_sent_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    trigger_survey VARCHAR(255),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email outreach log
CREATE TABLE IF NOT EXISTS email_outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_via VARCHAR(50),  -- 'hubspot', 'sendgrid', 'manual'
    external_id VARCHAR(255),  -- HubSpot email ID, etc.
    status VARCHAR(50) DEFAULT 'sent',  -- 'sent', 'opened', 'clicked', 'replied'
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (template_id) REFERENCES email_templates(id)
);

CREATE INDEX idx_survey_responses_user ON survey_responses(user_id);
CREATE INDEX idx_survey_responses_survey ON survey_responses(survey_name);
CREATE INDEX idx_email_outreach_user ON email_outreach(user_id);
CREATE INDEX idx_email_outreach_status ON email_outreach(status);
```

### 12.3 HubSpot Integration MCP Server

Create `src/mcp-servers/hubspot-server.py`:

```python
#!/usr/bin/env python3
"""
MCP Server for HubSpot Integration
Handles contacts, deals, emails, and custom properties
"""

import asyncio
import json
import os
from typing import Any, Optional
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types
import requests
from datetime import datetime

class HubSpotClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.hubapi.com"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def create_or_update_contact(self, email: str, properties: dict) -> dict:
        """Create or update a contact in HubSpot"""
        url = f"{self.base_url}/crm/v3/objects/contacts"
        
        # Prepare properties
        hubspot_properties = {
            "email": email
        }
        
        # Map common properties
        property_mapping = {
            "name": "firstname",
            "last_name": "lastname",
            "company": "company",
            "phone": "phone",
            "industry": "industry",
            "company_size": "company_size",
            "role": "jobtitle"
        }
        
        for key, value in properties.items():
            if key in property_mapping:
                hubspot_properties[property_mapping[key]] = value
            else:
                # Custom property
                hubspot_properties[key] = value
        
        payload = {
            "properties": hubspot_properties
        }
        
        # Try to find existing contact first
        search_url = f"{self.base_url}/crm/v3/objects/contacts/search"
        search_payload = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "email",
                    "operator": "EQ",
                    "value": email
                }]
            }]
        }
        
        response = requests.post(search_url, headers=self.headers, json=search_payload)
        
        if response.status_code == 200 and response.json().get("results"):
            # Update existing contact
            contact_id = response.json()["results"][0]["id"]
            update_url = f"{self.base_url}/crm/v3/objects/contacts/{contact_id}"
            response = requests.patch(update_url, headers=self.headers, json=payload)
        else:
            # Create new contact
            response = requests.post(url, headers=self.headers, json=payload)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            raise Exception(f"HubSpot API error: {response.status_code} - {response.text}")
    
    def send_email(self, contact_email: str, subject: str, body: str, from_email: str = None) -> dict:
        """Send an email through HubSpot"""
        # First, get the contact ID
        search_url = f"{self.base_url}/crm/v3/objects/contacts/search"
        search_payload = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "email",
                    "operator": "EQ",
                    "value": contact_email
                }]
            }]
        }
        
        response = requests.post(search_url, headers=self.headers, json=search_payload)
        
        if response.status_code != 200 or not response.json().get("results"):
            raise Exception(f"Contact not found: {contact_email}")
        
        contact_id = response.json()["results"][0]["id"]
        
        # Send email via HubSpot Single Send API
        email_url = f"{self.base_url}/marketing/v3/transactional/single-email/send"
        
        email_payload = {
            "emailId": None,  # Use custom email content
            "message": {
                "to": contact_email,
                "from": from_email or "noreply@yourdomain.com",
                "subject": subject,
                "html": body
            },
            "contactProperties": {
                "hs_object_id": contact_id
            }
        }
        
        response = requests.post(email_url, headers=self.headers, json=email_payload)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            raise Exception(f"HubSpot email error: {response.status_code} - {response.text}")
    
    def create_deal(self, contact_email: str, deal_name: str, amount: float, stage: str = "appointmentscheduled") -> dict:
        """Create a deal in HubSpot"""
        # Get contact ID
        search_url = f"{self.base_url}/crm/v3/objects/contacts/search"
        search_payload = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "email",
                    "operator": "EQ",
                    "value": contact_email
                }]
            }]
        }
        
        response = requests.post(search_url, headers=self.headers, json=search_payload)
        
        if response.status_code != 200 or not response.json().get("results"):
            raise Exception(f"Contact not found: {contact_email}")
        
        contact_id = response.json()["results"][0]["id"]
        
        # Create deal
        deal_url = f"{self.base_url}/crm/v3/objects/deals"
        deal_payload = {
            "properties": {
                "dealname": deal_name,
                "amount": str(amount),
                "dealstage": stage,
                "pipeline": "default"
            },
            "associations": [{
                "to": {"id": contact_id},
                "types": [{
                    "associationCategory": "HUBSPOT_DEFINED",
                    "associationTypeId": 3  # Deal to Contact
                }]
            }]
        }
        
        response = requests.post(deal_url, headers=self.headers, json=deal_payload)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            raise Exception(f"HubSpot deal error: {response.status_code} - {response.text}")
    
    def add_note(self, contact_email: str, note_body: str) -> dict:
        """Add a note to a contact"""
        # Get contact ID
        search_url = f"{self.base_url}/crm/v3/objects/contacts/search"
        search_payload = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "email",
                    "operator": "EQ",
                    "value": contact_email
                }]
            }]
        }
        
        response = requests.post(search_url, headers=self.headers, json=search_payload)
        
        if response.status_code != 200 or not response.json().get("results"):
            raise Exception(f"Contact not found: {contact_email}")
        
        contact_id = response.json()["results"][0]["id"]
        
        # Create note
        note_url = f"{self.base_url}/crm/v3/objects/notes"
        note_payload = {
            "properties": {
                "hs_timestamp": datetime.now().isoformat(),
                "hs_note_body": note_body
            },
            "associations": [{
                "to": {"id": contact_id},
                "types": [{
                    "associationCategory": "HUBSPOT_DEFINED",
                    "associationTypeId": 10  # Note to Contact
                }]
            }]
        }
        
        response = requests.post(note_url, headers=self.headers, json=note_payload)
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            raise Exception(f"HubSpot note error: {response.status_code} - {response.text}")

# Initialize MCP server
server = Server("hubspot-integration")
hubspot_client = None

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available HubSpot tools"""
    return [
        types.Tool(
            name="create_or_update_contact",
            description="Create or update a contact in HubSpot with survey data",
            inputSchema={
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Contact email address"},
                    "properties": {
                        "type": "object",
                        "description": "Contact properties including survey responses"
                    }
                },
                "required": ["email", "properties"]
            }
        ),
        types.Tool(
            name="send_personalized_email",
            description="Send a personalized email through HubSpot",
            inputSchema={
                "type": "object",
                "properties": {
                    "contact_email": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                    "from_email": {"type": "string"}
                },
                "required": ["contact_email", "subject", "body"]
            }
        ),
        types.Tool(
            name="create_deal",
            description="Create a deal for a contact",
            inputSchema={
                "type": "object",
                "properties": {
                    "contact_email": {"type": "string"},
                    "deal_name": {"type": "string"},
                    "amount": {"type": "number"},
                    "stage": {"type": "string"}
                },
                "required": ["contact_email", "deal_name", "amount"]
            }
        ),
        types.Tool(
            name="add_note",
            description="Add a note to a contact's record",
            inputSchema={
                "type": "object",
                "properties": {
                    "contact_email": {"type": "string"},
                    "note_body": {"type": "string"}
                },
                "required": ["contact_email", "note_body"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    """Handle tool execution"""
    
    global hubspot_client
    
    if hubspot_client is None:
        api_key = os.getenv("HUBSPOT_API_KEY")
        if not api_key:
            return [types.TextContent(
                type="text",
                text=json.dumps({"error": "HUBSPOT_API_KEY not set"})
            )]
        hubspot_client = HubSpotClient(api_key)
    
    try:
        if name == "create_or_update_contact":
            result = hubspot_client.create_or_update_contact(
                arguments["email"],
                arguments["properties"]
            )
            return [types.TextContent(
                type="text",
                text=json.dumps(result)
            )]
        
        elif name == "send_personalized_email":
            result = hubspot_client.send_email(
                arguments["contact_email"],
                arguments["subject"],
                arguments["body"],
                arguments.get("from_email")
            )
            return [types.TextContent(
                type="text",
                text=json.dumps(result)
            )]
        
        elif name == "create_deal":
            result = hubspot_client.create_deal(
                arguments["contact_email"],
                arguments["deal_name"],
                arguments["amount"],
                arguments.get("stage", "appointmentscheduled")
            )
            return [types.TextContent(
                type="text",
                text=json.dumps(result)
            )]
        
        elif name == "add_note":
            result = hubspot_client.add_note(
                arguments["contact_email"],
                arguments["note_body"]
            )
            return [types.TextContent(
                type="text",
                text=json.dumps(result)
            )]
        
        raise ValueError(f"Unknown tool: {name}")
    
    except Exception as e:
        return [types.TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]

async def main():
    """Run the MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="hubspot-integration",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={}
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
```

### 12.4 Email Personalization Service with Claude

Create `src/services/emailPersonalizer.js`:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

class EmailPersonalizer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
    }

    async generatePersonalizedEmail(surveyResponses, userProfile, templateConfig) {
        const prompt = `You are an expert email copywriter creating personalized outreach emails.

USER PROFILE:
${JSON.stringify(userProfile, null, 2)}

SURVEY RESPONSES:
${JSON.stringify(surveyResponses, null, 2)}

EMAIL TEMPLATE CONFIGURATION:
- Purpose: ${templateConfig.purpose}
- Tone: ${templateConfig.tone || 'professional and friendly'}
- Call-to-action: ${templateConfig.cta}
- Key points to mention: ${templateConfig.keyPoints?.join(', ')}

INSTRUCTIONS:
1. Write a highly personalized email that references specific details from the survey responses
2. Use the person's name and company naturally
3. Address their specific pain points or interests mentioned in the survey
4. Keep it concise (200-300 words)
5. Include a clear call-to-action
6. Make it feel genuine and human, not templated
7. Use the specified tone throughout

Respond with a JSON object containing:
{
  "subject": "compelling subject line (max 60 characters)",
  "body": "full email body in HTML format",
  "personalization_points": ["list of specific personalizations used"]
}

CRITICAL: Output ONLY valid JSON, no additional text.`;

        try {
            const response = await this.client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content[0].text.trim();
            // Strip markdown code blocks if present
            const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const emailData = JSON.parse(jsonText);

            return emailData;
        } catch (error) {
            console.error('Email personalization error:', error);
            throw error;
        }
    }

    async generateFollowUpEmail(previousEmail, surveyResponses, userProfile, context) {
        const prompt = `You are creating a follow-up email based on a previous interaction.

PREVIOUS EMAIL:
${previousEmail}

USER PROFILE:
${JSON.stringify(userProfile, null, 2)}

SURVEY RESPONSES:
${JSON.stringify(surveyResponses, null, 2)}

CONTEXT:
${context}

Create a natural follow-up email that:
1. References the previous email naturally
2. Provides additional value based on their survey responses
3. Moves the conversation forward
4. Maintains personalization
5. 150-250 words

Respond with JSON:
{
  "subject": "subject line",
  "body": "email body in HTML"
}`;

        const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = response.content[0].text.trim();
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonText);
    }
}

module.exports = EmailPersonalizer;
```

### 12.5 Email Orchestration Service

Create `src/services/emailOrchestrator.js`:

```javascript
const EmailPersonalizer = require('./emailPersonalizer');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class EmailOrchestrator {
    constructor(db, anthropicApiKey) {
        this.db = db;
        this.personalizer = new EmailPersonalizer(anthropicApiKey);
    }

    async triggerEmailFromSurvey(userId, surveyName) {
        try {
            // Get user profile
            const user = await this.getUserById(userId);
            
            // Get survey responses
            const surveyData = await this.getSurveyResponses(userId, surveyName);
            
            if (!surveyData || !user.email) {
                console.log('Missing email or survey data');
                return;
            }

            // Get email template for this survey
            const template = await this.getEmailTemplate(surveyName);
            
            if (!template) {
                console.log(`No email template configured for survey: ${surveyName}`);
                return;
            }

            // Prepare user profile
            const userProfile = {
                name: user.username,
                email: user.email,
                phone: user.phone,
                company: user.custom_fields?.company,
                tags: user.tags
            };

            // Generate personalized email
            const emailData = await this.personalizer.generatePersonalizedEmail(
                surveyData.responses,
                userProfile,
                {
                    purpose: template.purpose || 'follow-up after survey',
                    tone: template.tone || 'professional and friendly',
                    cta: template.cta || 'schedule a call',
                    keyPoints: template.key_points ? JSON.parse(template.key_points) : []
                }
            );

            // Update contact in HubSpot with survey data
            await this.syncToHubSpot(user, surveyData.responses);

            // Send email via HubSpot
            await this.sendViaHubSpot(user.email, emailData.subject, emailData.body);

            // Log the email
            await this.logEmail(userId, template.id, emailData.subject, emailData.body, 'hubspot');

            // Mark survey as email sent
            await this.markSurveyEmailSent(surveyData.id);

            console.log(`Personalized email sent to ${user.email}`);
            
            return {
                success: true,
                emailData,
                recipient: user.email
            };

        } catch (error) {
            console.error('Email orchestration error:', error);
            throw error;
        }
    }

    async syncToHubSpot(user, surveyResponses) {
        // Prepare properties for HubSpot
        const properties = {
            name: user.username,
            email: user.email,
            phone: user.phone,
            ...surveyResponses
        };

        // Call HubSpot MCP server
        const command = `echo '${JSON.stringify({
            email: user.email,
            properties: properties
        })}' | python3 src/mcp-servers/hubspot-server.py create_or_update_contact`;

        try {
            const { stdout } = await execPromise(command);
            return JSON.parse(stdout);
        } catch (error) {
            console.error('HubSpot sync error:', error);
            throw error;
        }
    }

    async sendViaHubSpot(contactEmail, subject, body) {
        const command = `echo '${JSON.stringify({
            contact_email: contactEmail,
            subject: subject,
            body: body
        })}' | python3 src/mcp-servers/hubspot-server.py send_personalized_email`;

        try {
            const { stdout } = await execPromise(command);
            return JSON.parse(stdout);
        } catch (error) {
            console.error('HubSpot email send error:', error);
            throw error;
        }
    }

    async scheduleFollowUp(userId, surveyName, delayDays = 3) {
        // Schedule a follow-up email after delay
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + delayDays);

        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO scheduled_emails (user_id, survey_name, scheduled_for, status)
                 VALUES (?, ?, ?, 'pending')`,
                [userId, surveyName, followUpDate.toISOString()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    // Database helper methods
    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getSurveyResponses(userId, surveyName) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM survey_responses 
                 WHERE user_id = ? AND survey_name = ?
                 ORDER BY completed_at DESC LIMIT 1`,
                [userId, surveyName],
                (err, row) => {
                    if (err) reject(err);
                    else if (row) {
                        resolve({
                            ...row,
                            responses: JSON.parse(row.responses)
                        });
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    async getEmailTemplate(surveyName) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM email_templates 
                 WHERE trigger_survey = ? AND is_active = 1`,
                [surveyName],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async logEmail(userId, templateId, subject, body, sentVia) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO email_outreach (user_id, template_id, subject, body, sent_via)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, templateId, subject, body, sentVia],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async markSurveyEmailSent(surveyResponseId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE survey_responses 
                 SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [surveyResponseId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

module.exports = EmailOrchestrator;
```

### 12.6 Example Survey Flow Implementation

Create `src/flows/examples/leadQualificationSurvey.js`:

```javascript
const leadQualificationSurvey = {
    name: 'lead_qualification',
    welcomeMessage: '👋 Thanks for your interest! I have a few quick questions to help us provide the best solution for you.',
    completionMessage: 'Perfect! Based on your responses, I\'ll send you a personalized proposal within 24 hours.',
    farewellMessage: 'Looking forward to helping you achieve your goals! 🚀',
    description: 'Qualify leads and gather information for personalized outreach',
    triggerKeywords: [
        { keyword: 'interested', options: { matchType: 'contains' } },
        { keyword: 'learn more', options: { matchType: 'contains' } },
        { keyword: 'tell me more', options: { matchType: 'contains' } }
    ],
    questions: [
        {
            text: 'First, what\'s your name?',
            type: 'text',
            saveAs: 'name',
            validation: { required: true, minLength: 2 }
        },
        {
            text: 'What\'s your work email?',
            type: 'text',
            saveAs: 'email',
            validation: { required: true, pattern: 'email' }
        },
        {
            text: 'What company do you work for?',
            type: 'text',
            saveAs: 'company',
            validation: { required: true }
        },
        {
            text: 'What\'s your role?',
            type: 'buttons',
            saveAs: 'role',
            options: [
                { label: 'Founder/CEO', value: 'founder' },
                { label: 'Marketing', value: 'marketing' },
                { label: 'Sales', value: 'sales' },
                { label: 'Operations', value: 'operations' },
                { label: 'Other', value: 'other' }
            ]
        },
        {
            text: 'What\'s your company size?',
            type: 'buttons',
            saveAs: 'company_size',
            options: [
                { label: '1-10 employees', value: 'startup' },
                { label: '11-50 employees', value: 'small' },
                { label: '51-200 employees', value: 'medium' },
                { label: '200+ employees', value: 'enterprise' }
            ]
        },
        {
            text: 'What\'s your biggest challenge right now?',
            type: 'text',
            saveAs: 'biggest_challenge',
            validation: { required: true, minLength: 10 }
        },
        {
            text: 'What\'s your timeline for implementing a solution?',
            type: 'buttons',
            saveAs: 'timeline',
            options: [
                { label: 'Urgent (within 1 month)', value: 'urgent' },
                { label: 'Soon (1-3 months)', value: 'soon' },
                { label: 'Planning (3-6 months)', value: 'planning' },
                { label: 'Exploring (6+ months)', value: 'exploring' }
            ]
        },
        {
            text: 'What\'s your approximate budget range?',
            type: 'buttons',
            saveAs: 'budget',
            options: [
                { label: 'Under $5k', value: 'low' },
                { label: '$5k - $20k', value: 'medium' },
                { label: '$20k - $50k', value: 'high' },
                { label: '$50k+', value: 'enterprise' },
                { label: 'Not sure yet', value: 'unknown' }
            ]
        },
        {
            text: 'Is there anything else you\'d like us to know?',
            type: 'text',
            saveAs: 'additional_notes',
            validation: { required: false }
        }
    ]
};

module.exports = leadQualificationSurvey;
```

### 12.7 Seed Email Templates

Create `src/database/seedEmailTemplates.js`:

```javascript
const { initDatabase } = require('./init');

async function seedEmailTemplates() {
    const db = await initDatabase();

    const templates = [
        {
            name: 'lead_qualification_followup',
            subject_template: 'Your Personalized Proposal, {{name}}',
            body_template: `<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <p>Hi {{name}},</p>
    
    <p>Thanks for taking the time to share more about {{company}} and your goals.</p>
    
    <p>Based on what you told me about {{biggest_challenge}}, I've put together a customized approach that I think will be perfect for your {{company_size}} team.</p>
    
    <p><strong>Here's what I'm thinking:</strong></p>
    
    {{personalized_solution}}
    
    <p>Given your {{timeline}} timeline and {{budget}} budget, I recommend we start with:</p>
    
    {{recommended_package}}
    
    <p>I'd love to walk you through this in more detail. Are you free for a quick 20-minute call this week?</p>
    
    <p><a href="{{calendar_link}}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Schedule a Call</a></p>
    
    <p>Looking forward to helping {{company}} achieve its goals!</p>
    
    <p>Best regards,<br>
    {{sender_name}}<br>
    {{sender_title}}</p>
</body>
</html>`,
            trigger_survey: 'lead_qualification',
            purpose: 'Send personalized proposal after lead qualification survey',
            tone: 'professional yet warm',
            cta: 'schedule a call',
            key_points: JSON.stringify([
                'Reference their specific challenge',
                'Match solution to company size',
                'Address their timeline concerns',
                'Respect their budget constraints',
                'Show you listened to their needs'
            ])
        },
        {
            name: 'customer_feedback_thank_you',
            subject_template: 'Thanks for Your Feedback, {{name}}!',
            body_template: `<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <p>Hi {{name}},</p>
    
    <p>Thank you so much for taking the time to share your thoughts with us!</p>
    
    <p>Your feedback about {{feedback_topic}} is incredibly valuable and will help us improve.</p>
    
    {{personalized_response}}
    
    <p>As a token of our appreciation, here's a special offer just for you:</p>
    
    {{special_offer}}
    
    <p>If you have any other suggestions or need anything else, just reply to this email.</p>
    
    <p>Thanks again!</p>
    
    <p>Best,<br>
    {{sender_name}}</p>
</body>
</html>`,
            trigger_survey: 'customer_feedback',
            purpose: 'Thank customers for feedback and provide value',
            tone: 'grateful and appreciative',
            cta: 'reply with more feedback',
            key_points: JSON.stringify([
                'Express genuine gratitude',
                'Reference specific feedback',
                'Show how feedback will be used',
                'Provide value or offer',
                'Keep door open for more input'
            ])
        }
    ];

    for (const template of templates) {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO email_templates 
                 (name, subject_template, body_template, trigger_survey, is_active)
                 VALUES (?, ?, ?, ?, 1)`,
                [
                    template.name,
                    template.subject_template,
                    template.body_template,
                    template.trigger_survey
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    console.log('Email templates seeded successfully');
    db.close();
}

seedEmailTemplates().catch(console.error);
```

### 12.8 Update Flow Executor to Handle Trigger Email Action

Update `src/services/flowExecutor.js` to add email trigger handling:

```javascript
// Add to executeAction method in FlowExecutor class

async executeAction(conversationId, action, context) {
    switch (action.type) {
        case 'tag':
            await this.addUserTag(conversationId, action.value);
            break;
        
        case 'notify':
            console.log(`Notification: ${action.message}`);
            break;
        
        case 'track':
            await this.trackEvent(conversationId, action.event, context);
            break;
        
        case 'trigger_email_flow':
            // NEW: Trigger personalized email
            const conversation = await this.getConversationById(conversationId);
            const EmailOrchestrator = require('./emailOrchestrator');
            const orchestrator = new EmailOrchestrator(this.db, this.client.apiKey);
            
            await orchestrator.triggerEmailFromSurvey(
                conversation.user_id,
                action.surveyName
            );
            break;
        
        case 'api_call':
            // Call external API via MCP server
            break;
    }
}
```

### 12.9 Complete Integration Example

Create `src/examples/completeSurveyEmailFlow.js`:

```javascript
/**
 * Complete example: Survey → HubSpot → Personalized Email
 * 
 * This shows the full workflow:
 * 1. User completes survey in chat
 * 2. Responses saved to database
 * 3. Contact created/updated in HubSpot
 * 4. Claude generates personalized email
 * 5. Email sent via HubSpot
 * 6. Activity logged for analytics
 */

const { initDatabase } = require('../database/init');
const SurveyFlow = require('../flows/surveyFlow');
const EmailOrchestrator = require('../services/emailOrchestrator');
const leadQualificationSurvey = require('../flows/examples/leadQualificationSurvey');

async function runCompleteExample() {
    console.log('🚀 Starting complete survey → email workflow example\n');

    // Initialize
    const db = await initDatabase();
    const surveyFlow = new SurveyFlow();
    const orchestrator = new EmailOrchestrator(db, process.env.ANTHROPIC_API_KEY);

    // 1. Create survey flow
    console.log('📋 Step 1: Creating survey flow...');
    const flow = surveyFlow.createSurvey('lead_qualification', leadQualificationSurvey);
    console.log('✅ Survey flow created\n');

    // 2. Simulate user completing survey
    console.log('👤 Step 2: Simulating user survey completion...');
    const mockUserId = 1;
    const mockSurveyResponses = {
        name: 'Sarah Johnson',
        email: 'sarah.johnson@techstartup.com',
        company: 'TechStartup Inc',
        role: 'founder',
        company_size: 'small',
        biggest_challenge: 'We need to scale our customer support without hiring more people. Currently spending 20+ hours/week on repetitive questions.',
        timeline: 'urgent',
        budget: 'medium',
        additional_notes: 'Looking for something that integrates with our existing tools (Slack, HubSpot)'
    };

    await surveyFlow.saveSurveyResponse(
        db,
        mockUserId,
        'lead_qualification',
        mockSurveyResponses
    );
    console.log('✅ Survey responses saved\n');

    // 3. Trigger email workflow
    console.log('📧 Step 3: Generating personalized email with Claude...');
    const result = await orchestrator.triggerEmailFromSurvey(
        mockUserId,
        'lead_qualification'
    );

    console.log('✅ Email generated and sent!\n');
    console.log('📩 Email Preview:');
    console.log('─'.repeat(60));
    console.log(`Subject: ${result.emailData.subject}`);
    console.log('─'.repeat(60));
    console.log(result.emailData.body.replace(/<[^>]*>/g, '').substring(0, 500) + '...');
    console.log('─'.repeat(60));
    console.log(`\n✨ Personalization points used:`);
    result.emailData.personalization_points.forEach((point, i) => {
        console.log(`   ${i + 1}. ${point}`);
    });

    console.log('\n🎯 Workflow completed successfully!');
    console.log('\nWhat happened:');
    console.log('1. ✅ Survey responses collected');
    console.log('2. ✅ Contact synced to HubSpot');
    console.log('3. ✅ AI-generated personalized email');
    console.log('4. ✅ Email sent via HubSpot');
    console.log('5. ✅ Activity logged for analytics');

    db.close();
}

// Run the example
if (require.main === module) {
    runCompleteExample().catch(console.error);
}

module.exports = runCompleteExample;
```

### 12.10 Update Environment Variables

Add to `.env`:

```env
# HubSpot
HUBSPOT_API_KEY=your_hubspot_api_key_here
HUBSPOT_FROM_EMAIL=noreply@yourdomain.com

# Email Configuration
EMAIL_SENDER_NAME=Your Name
EMAIL_SENDER_TITLE=Sales Director
CALENDAR_LINK=https://calendly.com/your-link
```

### 12.11 Usage Guide

**To implement this in your chatbot:**

1. **Initialize survey flow:**
```javascript
const surveyFlow = new SurveyFlow();
const flow = surveyFlow.createSurvey('lead_qualification', leadQualificationSurvey);
```

2. **When user completes survey, trigger email:**
```javascript
// In your flow executor, when survey ends:
actions: [
    { type: 'trigger_email_flow', surveyName: 'lead_qualification' }
]
```

3. **Email is automatically:**
   - Generated by Claude with personalization
   - Contact synced to HubSpot
   - Sent via HubSpot
   - Logged for analytics

---

## Advanced Features to Add

1. **A/B Testing**: Test different flow variations
2. **NLP Improvements**: Use Claude for better intent detection
3. **Multi-language**: Detect language and respond accordingly
4. **Voice Integration**: Add speech-to-text
5. **Payment Integration**: Accept payments in chat
6. **Live Agent Handoff**: Route to human when needed
7. **Broadcast Messages**: Send campaigns
8. **Drip Campaigns**: Time-based sequences
9. **Advanced Email Sequences**: Multi-touch campaigns with conditional logic
10. **Dynamic Content Blocks**: Reusable email components based on user segments

---

## Troubleshooting

### Issue: Flows not triggering
- Check keyword registration in database
- Verify keyword matcher is loading correctly
- Test with exact keyword match first

### Issue: Claude API errors
- Check API key is valid
- Monitor rate limits (API quota)
- Add retry logic with exponential backoff

### Issue: Database locks
- Use connection pooling
- Add transaction handling
- Consider PostgreSQL for production

### Issue: Webhook not receiving messages
- Verify webhook URL is public and HTTPS
- Check platform webhook configuration
- Review webhook logs

---

## Security Checklist

- [ ] Use HTTPS for all webhooks
- [ ] Validate webhook signatures
- [ ] Sanitize user inputs
- [ ] Rate limit API endpoints
- [ ] Encrypt sensitive data in database
- [ ] Use environment variables for secrets
- [ ] Implement user authentication for dashboard
- [ ] Add CORS protection
- [ ] Regular security audits
- [ ] Keep dependencies updated

---

## Next Steps

1. **Week 1**: Set up basic system and test locally
2. **Week 2**: Deploy to production and connect one platform
3. **Week 3**: Add MCP servers for integrations
4. **Week 4**: Build analytics and optimize flows

---

## Resources

- [Anthropic API Documentation](https://docs.anthropic.com)
- [MCP Documentation](https://modelcontextprotocol.io)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Claude Code Documentation](https://docs.claude.com/claude-code)

---

## Conclusion

You've now built a powerful, cost-effective chatbot automation system that rivals ManyChat's capabilities. The key advantages:

✅ **70-90% cost savings**
✅ **Full control and customization**
✅ **No vendor lock-in**
✅ **Unlimited scalability**
✅ **Advanced AI capabilities with Claude**
✅ **Open architecture for any integration**

This system handles keyword automation, flow execution, multi-platform support, and integrations—all the core features of ManyChat—but with more flexibility and at a fraction of the cost.

Happy building! 🚀

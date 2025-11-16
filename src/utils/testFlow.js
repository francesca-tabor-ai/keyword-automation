const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { exampleFlow } = require('../flows/flowSchema');
const FlowExecutor = require('../services/flowExecutor');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

async function testFlow() {
    const db = new sqlite3.Database(DB_PATH);
    
    console.log('Connected to existing database');
    
    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });
    
    await new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO flows (name, description, trigger_keywords, flow_definition, is_active) VALUES (?, ?, ?, ?, ?)',
            [
                exampleFlow.name,
                exampleFlow.description,
                JSON.stringify([{ keyword: 'demo', options: {} }]),
                JSON.stringify(exampleFlow.steps),
                1
            ],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
    
    console.log('Flow inserted into database');
    
    const userId = await new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO users (platform, platform_user_id, username) VALUES (?, ?, ?)',
            ['test', 'user123', 'TestUser'],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
    
    console.log('Test user created with ID: ' + userId);
    
    const executor = new FlowExecutor(db, anthropic);
    const result = await executor.startFlow(userId, 'test', 'demo_request');
    
    console.log('\nFlow started! First message:');
    console.log(JSON.stringify(result.response, null, 2));
    
    db.close();
}

testFlow().catch(console.error);
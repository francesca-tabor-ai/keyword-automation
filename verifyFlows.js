const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

function verifyFlows() {
    const db = new sqlite3.Database(DB_PATH);

    db.all('SELECT name, description, trigger_keywords FROM flows WHERE is_active = 1', (err, rows) => {
        if (err) {
            console.error('Error:', err);
            return;
        }

        console.log(`\n📋 Found ${rows.length} active flows:\n`);

        rows.forEach((flow, index) => {
            const keywords = JSON.parse(flow.trigger_keywords);
            console.log(`${index + 1}. ${flow.name}`);
            console.log(`   Description: ${flow.description}`);
            console.log(`   Keywords: ${keywords.map(k => k.keyword).join(', ')}`);
            console.log('');
        });

        db.close();
    });
}

verifyFlows();
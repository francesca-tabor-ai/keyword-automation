const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Use absolute path relative to project root
const DB_PATH = path.join(__dirname, '../../data/chatbot.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function initDatabase() {
    return new Promise((resolve, reject) => {
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('✅ Created data directory');
        }

        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('✅ Connected to SQLite database');
            
            // Read and execute schema
            const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
            
            db.exec(schema, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log('✅ Database schema created successfully');
                resolve(db);
            });
        });
    });
}

// If run directly
if (require.main === module) {
    initDatabase()
        .then((db) => {
            console.log('\n✨ Database initialized!');
            db.close();
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Database initialization failed:', error);
            process.exit(1);
        });
}

module.exports = { initDatabase, DB_PATH };
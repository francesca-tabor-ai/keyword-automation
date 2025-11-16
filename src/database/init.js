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
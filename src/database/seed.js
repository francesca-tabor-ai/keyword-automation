const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Import DB_PATH from init
const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

async function seedFlows() {
    console.log('🌱 Starting database seeding...\n');
    
    const db = await initDatabase();

    // Clear existing flows (optional - remove in production)
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM flows', (err) => {
            if (err) reject(err);
            else {
                console.log('✅ Cleared existing flows');
                resolve();
            }
        });
    });

    const flows = [
        // Flow 1: Demo Request
        {
            name: 'demo_request',
            description: 'Handle demo requests and schedule calls',
            trigger_keywords: JSON.stringify([
                { keyword: 'demo', options: { matchType: 'contains', priority: 10 } },
                { keyword: 'schedule demo', options: { matchType: 'contains', priority: 15 } },
                { keyword: 'book demo', options: { matchType: 'contains', priority: 15 } },
                { keyword: 'request demo', options: { matchType: 'contains', priority: 15 } }
            ]),
            flow_definition: JSON.stringify([
                {
                    id: 'welcome',
                    type: 'message',
                    content: '👋 Thanks for your interest in a demo!',
                    next: 'ask_name'
                },
                {
                    id: 'ask_name',
                    type: 'question',
                    content: 'What\'s your name?',
                    inputType: 'text',
                    saveAs: 'name',
                    next: 'end'
                },
                {
                    id: 'end',
                    type: 'end',
                    content: 'Thanks! We\'ll be in touch soon.'
                }
            ])
        },

        // Flow 2: Pricing
        {
            name: 'pricing_inquiry',
            description: 'Provide pricing information',
            trigger_keywords: JSON.stringify([
                { keyword: 'pricing', options: { matchType: 'contains', priority: 10 } },
                { keyword: 'price', options: { matchType: 'contains', priority: 8 } },
                { keyword: 'cost', options: { matchType: 'contains', priority: 8 } }
            ]),
            flow_definition: JSON.stringify([
                {
                    id: 'welcome',
                    type: 'message',
                    content: '💰 Here are our pricing plans...',
                    next: 'end'
                },
                {
                    id: 'end',
                    type: 'end',
                    content: 'Any questions?'
                }
            ])
        }
    ];

    // Insert flows
    let successCount = 0;
    for (const flow of flows) {
        try {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO flows (name, description, trigger_keywords, flow_definition, is_active)
                     VALUES (?, ?, ?, ?, 1)`,
                    [flow.name, flow.description, flow.trigger_keywords, flow.flow_definition],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            console.log(`✅ Seeded flow: ${flow.name}`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to seed flow ${flow.name}:`, error.message);
        }
    }

    console.log(`\n🎉 Successfully seeded ${successCount}/${flows.length} flows!`);

    db.close();
}

// Run if called directly
if (require.main === module) {
    seedFlows()
        .then(() => {
            console.log('\n✨ Database seeding complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Seeding failed:', error);
            process.exit(1);
        });
}

module.exports = { seedFlows };
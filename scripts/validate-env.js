#!/usr/bin/env node
/**
 * Environment Configuration Validator
 * Checks all required and optional environment variables
 * and provides detailed feedback on configuration status
 */

const fs = require('fs');
const path = require('path');

// Load .env file manually (no dependency on dotenv package)
function loadEnvFile() {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
        return false;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
        // Skip comments and empty lines
        if (!line || line.trim().startsWith('#') || !line.includes('=')) {
            continue;
        }
        
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        // Only set if not already in environment
        if (!process.env[key.trim()]) {
            process.env[key.trim()] = cleanValue;
        }
    }
    
    return true;
}

// Try to load .env file
const envLoaded = loadEnvFile();

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

// Configuration schema
const configSchema = {
    required: [
        {
            key: 'ANTHROPIC_API_KEY',
            description: 'Anthropic API key for Claude',
            validate: (val) => val && val.startsWith('sk-ant-'),
            errorMsg: 'Invalid format. Should start with "sk-ant-"'
        },
        {
            key: 'PORT',
            description: 'Server port',
            validate: (val) => !isNaN(val) && parseInt(val) > 0 && parseInt(val) < 65536,
            errorMsg: 'Must be a valid port number (1-65535)',
            default: '3000'
        },
        {
            key: 'DATABASE_PATH',
            description: 'Path to SQLite database',
            validate: (val) => val && val.length > 0,
            errorMsg: 'Must be a valid file path',
            default: './data/chatbot.db'
        }
    ],
    optional: {
        messaging: [
            {
                key: 'WHATSAPP_PHONE_NUMBER_ID',
                description: 'WhatsApp Business phone number ID',
                note: 'For WhatsApp integration'
            },
            {
                key: 'WHATSAPP_ACCESS_TOKEN',
                description: 'WhatsApp Business access token',
                note: 'For WhatsApp integration'
            },
            {
                key: 'WHATSAPP_VERIFY_TOKEN',
                description: 'WhatsApp webhook verification token',
                note: 'For WhatsApp webhook setup'
            },
            {
                key: 'TELEGRAM_BOT_TOKEN',
                description: 'Telegram bot token',
                note: 'For Telegram integration'
            },
            {
                key: 'SLACK_BOT_TOKEN',
                description: 'Slack bot token',
                note: 'For Slack integration'
            },
            {
                key: 'SLACK_SIGNING_SECRET',
                description: 'Slack signing secret',
                note: 'For Slack webhook verification'
            },
            {
                key: 'DISCORD_BOT_TOKEN',
                description: 'Discord bot token',
                note: 'For Discord integration'
            }
        ],
        crm: [
            {
                key: 'HUBSPOT_API_KEY',
                description: 'HubSpot API key',
                note: 'For CRM integration and email sending'
            },
            {
                key: 'HUBSPOT_FROM_EMAIL',
                description: 'Default sender email for HubSpot',
                note: 'For email campaigns'
            }
        ],
        email: [
            {
                key: 'EMAIL_SENDER_NAME',
                description: 'Email sender name',
                note: 'For email personalization'
            },
            {
                key: 'EMAIL_SENDER_TITLE',
                description: 'Email sender title',
                note: 'For email signature'
            },
            {
                key: 'CALENDAR_LINK',
                description: 'Calendly or booking link',
                note: 'For scheduling CTAs'
            }
        ],
        infrastructure: [
            {
                key: 'REDIS_URL',
                description: 'Redis connection URL',
                note: 'For job queue (optional but recommended)'
            },
            {
                key: 'NODE_ENV',
                description: 'Environment mode',
                validate: (val) => ['development', 'production', 'test'].includes(val),
                errorMsg: 'Must be "development", "production", or "test"',
                default: 'development'
            }
        ]
    }
};

class ConfigValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.successes = [];
    }

    log(message, color = colors.reset) {
        console.log(`${color}${message}${colors.reset}`);
    }

    validateRequired() {
        this.log('\n📋 Required Configuration:', colors.bold + colors.cyan);
        
        for (const config of configSchema.required) {
            const value = process.env[config.key];
            const hasDefault = config.default !== undefined;
            const actualValue = value || config.default;

            if (!actualValue) {
                this.errors.push({
                    key: config.key,
                    message: `${config.description} is required but not set`,
                    fix: `Add ${config.key} to your .env file`
                });
                this.log(`  ❌ ${config.key}: Not configured`, colors.red);
                this.log(`     ${config.description}`, colors.red);
            } else if (config.validate && !config.validate(actualValue)) {
                this.errors.push({
                    key: config.key,
                    message: `${config.description}: ${config.errorMsg}`,
                    fix: `Fix ${config.key} in your .env file`
                });
                this.log(`  ❌ ${config.key}: Invalid value`, colors.red);
                this.log(`     ${config.errorMsg}`, colors.red);
            } else {
                this.successes.push(config.key);
                const suffix = hasDefault && !value ? ' (using default)' : '';
                this.log(`  ✅ ${config.key}: Configured${suffix}`, colors.green);
            }
        }
    }

    validateOptional() {
        this.log('\n🔧 Optional Configuration:', colors.bold + colors.cyan);
        
        for (const [category, configs] of Object.entries(configSchema.optional)) {
            this.log(`\n  ${this.getCategoryIcon(category)} ${this.getCategoryName(category)}:`, colors.blue);
            
            let categoryConfigured = 0;
            for (const config of configs) {
                const value = process.env[config.key];
                
                if (value) {
                    if (config.validate && !config.validate(value)) {
                        this.warnings.push({
                            key: config.key,
                            message: `${config.description}: ${config.errorMsg}`,
                            fix: `Check ${config.key} value in .env`
                        });
                        this.log(`  ⚠️  ${config.key}: Invalid value`, colors.yellow);
                        this.log(`     ${config.errorMsg}`, colors.yellow);
                    } else {
                        categoryConfigured++;
                        this.log(`  ✅ ${config.key}: Configured`, colors.green);
                    }
                } else {
                    this.log(`  ⚠️  ${config.key}: Not configured`, colors.yellow);
                    this.log(`     ${config.note}`, colors.yellow);
                }
            }
            
            // Summary for category
            const total = configs.length;
            const percentage = Math.round((categoryConfigured / total) * 100);
            this.log(`     → ${categoryConfigured}/${total} configured (${percentage}%)`, colors.cyan);
        }
    }

    checkDatabasePath() {
        this.log('\n💾 Database Check:', colors.bold + colors.cyan);
        
        const dbPath = process.env.DATABASE_PATH || './data/chatbot.db';
        const dbDir = path.dirname(dbPath);
        
        // Check if directory exists
        if (!fs.existsSync(dbDir)) {
            this.warnings.push({
                key: 'DATABASE_PATH',
                message: `Database directory does not exist: ${dbDir}`,
                fix: `Run: mkdir -p ${dbDir}`
            });
            this.log(`  ⚠️  Directory missing: ${dbDir}`, colors.yellow);
            this.log(`     Run: mkdir -p ${dbDir}`, colors.yellow);
        } else {
            this.log(`  ✅ Database directory exists: ${dbDir}`, colors.green);
        }

        // Check if database file exists
        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            this.log(`  ✅ Database file exists: ${dbPath} (${sizeMB} MB)`, colors.green);
        } else {
            this.log(`  ℹ️  Database file will be created: ${dbPath}`, colors.cyan);
        }
    }

    checkMCPServers() {
        this.log('\n🔌 MCP Servers Check:', colors.bold + colors.cyan);
        
        const mcpServers = [
            { name: 'CRM Server', path: 'src/mcp-servers/crm-server.py' },
            { name: 'Analytics Server', path: 'src/mcp-servers/analytics-server.py' },
            { name: 'HubSpot Server', path: 'src/mcp-servers/hubspot-server.py' }
        ];

        for (const server of mcpServers) {
            if (fs.existsSync(server.path)) {
                this.log(`  ✅ ${server.name}: Found`, colors.green);
            } else {
                this.warnings.push({
                    key: server.name,
                    message: `MCP server not found: ${server.path}`,
                    fix: `Create the server file or check path`
                });
                this.log(`  ⚠️  ${server.name}: Not found (${server.path})`, colors.yellow);
            }
        }
    }

    checkPythonDependencies() {
        this.log('\n🐍 Python Dependencies:', colors.bold + colors.cyan);
        
        try {
            const { execSync } = require('child_process');
            
            // Check Python version
            try {
                const pythonVersion = execSync('python3 --version', { encoding: 'utf8' }).trim();
                this.log(`  ✅ ${pythonVersion}`, colors.green);
            } catch (e) {
                this.warnings.push({
                    key: 'Python',
                    message: 'Python 3 not found',
                    fix: 'Install Python 3: sudo apt-get install python3'
                });
                this.log(`  ❌ Python 3 not found`, colors.red);
            }

            // Check for MCP package
            try {
                execSync('python3 -c "import mcp"', { stdio: 'ignore' });
                this.log(`  ✅ MCP package installed`, colors.green);
            } catch (e) {
                this.warnings.push({
                    key: 'MCP Package',
                    message: 'MCP package not installed',
                    fix: 'Install: pip install anthropic-mcp --break-system-packages'
                });
                this.log(`  ⚠️  MCP package not installed`, colors.yellow);
                this.log(`     Run: pip install anthropic-mcp --break-system-packages`, colors.yellow);
            }
        } catch (e) {
            this.log(`  ⚠️  Could not check Python dependencies`, colors.yellow);
        }
    }

    getCategoryIcon(category) {
        const icons = {
            messaging: '💬',
            crm: '👥',
            email: '📧',
            infrastructure: '⚙️'
        };
        return icons[category] || '📦';
    }

    getCategoryName(category) {
        const names = {
            messaging: 'Messaging Platforms',
            crm: 'CRM Integration',
            email: 'Email Configuration',
            infrastructure: 'Infrastructure'
        };
        return names[category] || category;
    }

    printSummary() {
        this.log('\n' + '='.repeat(60), colors.cyan);
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            this.log('✅ Configuration validation passed!', colors.bold + colors.green);
            this.log('All required settings are properly configured.', colors.green);
        } else if (this.errors.length > 0) {
            this.log('❌ Configuration validation failed!', colors.bold + colors.red);
            this.log(`Found ${this.errors.length} critical error(s):\n`, colors.red);
            
            for (const error of this.errors) {
                this.log(`  • ${error.message}`, colors.red);
                this.log(`    Fix: ${error.fix}`, colors.yellow);
            }
        } else {
            this.log('⚠️  Configuration validation passed with warnings', colors.bold + colors.yellow);
            this.log(`Found ${this.warnings.length} warning(s):`, colors.yellow);
            
            for (const warning of this.warnings) {
                this.log(`  • ${warning.message}`, colors.yellow);
            }
        }

        this.log('='.repeat(60), colors.cyan);
        
        // Next steps
        if (this.errors.length === 0) {
            this.log('\n📝 Next Steps:', colors.bold + colors.cyan);
            this.log('  1. Initialize database: npm run init-db', colors.cyan);
            this.log('  2. Seed sample flows: node src/database/seed.js', colors.cyan);
            this.log('  3. Start server: npm start', colors.cyan);
            
            if (this.warnings.length > 0) {
                this.log('\n💡 Optional improvements:', colors.cyan);
                this.log('  • Configure messaging platforms for multi-channel support', colors.cyan);
                this.log('  • Set up HubSpot for CRM and email integration', colors.cyan);
                this.log('  • Add Redis for production job queue', colors.cyan);
            }
        } else {
            this.log('\n🔧 To fix errors:', colors.bold + colors.red);
            this.log('  1. Create or update .env file in project root', colors.red);
            this.log('  2. Add missing required variables', colors.red);
            this.log('  3. Run validation again: npm run validate-env', colors.red);
        }

        this.log('');
    }

    run() {
        this.log('🔍 Validating environment configuration...', colors.bold + colors.cyan);
        
        // Check if .env was loaded
        if (!envLoaded) {
            this.log('\n⚠️  No .env file found in current directory', colors.yellow);
            this.log('   Create one by copying: cp .env.example .env', colors.yellow);
            this.log('   Or set environment variables manually\n', colors.yellow);
        }
        
        this.validateRequired();
        this.validateOptional();
        this.checkDatabasePath();
        this.checkMCPServers();
        this.checkPythonDependencies();
        this.printSummary();

        // Exit with error code if critical errors found
        if (this.errors.length > 0) {
            process.exit(1);
        }
    }
}

// Run validation
const validator = new ConfigValidator();
validator.run();
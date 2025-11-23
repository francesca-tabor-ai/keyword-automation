#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating environment configuration...\n');

// Check .env file exists
const envPath = path.join(__dirname, '../../.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    console.log('💡 Copy .env.example to .env and fill in your values');
    process.exit(1);
}

// Load config
require('dotenv').config();

// Required keys
const requiredKeys = {
    'ANTHROPIC_API_KEY': 'Get from https://console.anthropic.com/settings/keys',
    'PORT': 'Server port (default: 3000)',
    'DATABASE_PATH': 'Path to SQLite database'
};

// Optional but recommended
const recommendedKeys = {
    'WHATSAPP_PHONE_NUMBER_ID': 'For WhatsApp integration',
    'TELEGRAM_BOT_TOKEN': 'For Telegram integration',
    'HUBSPOT_API_KEY': 'For CRM integration'
};

let hasErrors = false;
let hasWarnings = false;

// Check required keys
console.log('Required Configuration:');
Object.entries(requiredKeys).forEach(([key, description]) => {
    const value = process.env[key];
    if (!value) {
        console.log(`  ❌ ${key}: Missing`);
        console.log(`     ${description}`);
        hasErrors = true;
    } else {
        console.log(`  ✅ ${key}: Configured`);
    }
});

console.log('\nOptional Configuration:');
Object.entries(recommendedKeys).forEach(([key, description]) => {
    const value = process.env[key];
    if (!value) {
        console.log(`  ⚠️  ${key}: Not configured`);
        console.log(`     ${description}`);
        hasWarnings = true;
    } else {
        console.log(`  ✅ ${key}: Configured`);
    }
});

// Test Anthropic API key format
if (process.env.ANTHROPIC_API_KEY) {
    if (!process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
        console.log('\n⚠️  ANTHROPIC_API_KEY format looks incorrect');
        console.log('   Should start with "sk-ant-"');
        hasWarnings = true;
    }
}

console.log('\n' + '='.repeat(60));
if (hasErrors) {
    console.log('❌ Configuration validation FAILED');
    console.log('Please fix the errors above before continuing');
    process.exit(1);
} else if (hasWarnings) {
    console.log('⚠️  Configuration validation passed with warnings');
    console.log('Some optional integrations are not configured');
    process.exit(0);
} else {
    console.log('✅ All configuration validated successfully!');
    process.exit(0);
}
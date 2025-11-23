#!/usr/bin/env node

/**
 * Simple Environment File Encryption
 * 
 * Usage:
 *   node simple-encrypt-env.js encrypt .env.production
 *   node simple-encrypt-env.js decrypt .env.production.encrypted
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

class EnvEncryption {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async getPassword(prompt = 'Enter encryption password: ') {
        return new Promise((resolve) => {
            // Hide password input
            const stdin = process.stdin;
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');

            let password = '';
            process.stdout.write(prompt);

            stdin.on('data', function handler(char) {
                if (char === '\n' || char === '\r' || char === '\u0004') {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener('data', handler);
                    process.stdout.write('\n');
                    resolve(password);
                } else if (char === '\u0003') {
                    process.exit();
                } else if (char === '\x7f' || char === '\b') {
                    // Backspace
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                } else {
                    password += char;
                    process.stdout.write('*');
                }
            });
        });
    }

    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
    }

    encrypt(text, password) {
        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);
        
        // Derive key from password
        const key = this.deriveKey(password, salt);
        
        // Create cipher
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        // Encrypt
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Get auth tag
        const authTag = cipher.getAuthTag();
        
        // Combine salt + iv + authTag + encrypted
        return Buffer.concat([
            salt,
            iv,
            authTag,
            Buffer.from(encrypted, 'hex')
        ]).toString('base64');
    }

    decrypt(encryptedData, password) {
        // Decode from base64
        const buffer = Buffer.from(encryptedData, 'base64');
        
        // Extract components
        const salt = buffer.slice(0, SALT_LENGTH);
        const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        
        // Derive key
        const key = this.deriveKey(password, salt);
        
        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString('utf8');
    }

    async encryptFile(inputFile) {
        try {
            // Check if file exists
            if (!fs.existsSync(inputFile)) {
                throw new Error(`File not found: ${inputFile}`);
            }

            // Read file
            const content = fs.readFileSync(inputFile, 'utf8');
            
            console.log(`\n🔐 Encrypting: ${inputFile}`);
            console.log(`File size: ${content.length} bytes`);
            
            // Get password
            const password = await this.getPassword('Enter encryption password: ');
            const confirmPassword = await this.getPassword('Confirm password: ');
            
            if (password !== confirmPassword) {
                throw new Error('Passwords do not match!');
            }
            
            if (password.length < 8) {
                throw new Error('Password must be at least 8 characters long');
            }
            
            // Encrypt
            const encrypted = this.encrypt(content, password);
            
            // Write encrypted file
            const outputFile = `${inputFile}.encrypted`;
            fs.writeFileSync(outputFile, encrypted, 'utf8');
            
            console.log(`✅ Encrypted file created: ${outputFile}`);
            console.log(`\n⚠️  IMPORTANT:`);
            console.log(`   1. Store your password securely (1Password, LastPass, etc.)`);
            console.log(`   2. You can safely commit ${outputFile} to git`);
            console.log(`   3. Keep ${inputFile} out of version control`);
            console.log(`   4. To decrypt: node simple-encrypt-env.js decrypt ${outputFile}`);
            
            this.rl.close();
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            this.rl.close();
            process.exit(1);
        }
    }

    async decryptFile(inputFile) {
        try {
            // Check if file exists
            if (!fs.existsSync(inputFile)) {
                throw new Error(`File not found: ${inputFile}`);
            }

            // Read encrypted file
            const encrypted = fs.readFileSync(inputFile, 'utf8');
            
            console.log(`\n🔓 Decrypting: ${inputFile}`);
            
            // Get password
            const password = await this.getPassword('Enter decryption password: ');
            
            // Decrypt
            const decrypted = this.decrypt(encrypted, password);
            
            // Determine output filename
            const outputFile = inputFile.replace('.encrypted', '');
            
            // Write decrypted file
            fs.writeFileSync(outputFile, decrypted, 'utf8');
            
            console.log(`✅ Decrypted file created: ${outputFile}`);
            console.log(`\n⚠️  Remember to keep ${outputFile} secure and out of git!`);
            
            this.rl.close();
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            if (error.message.includes('Unsupported state or unable to authenticate data')) {
                console.error(`   This usually means the password is incorrect.`);
            }
            this.rl.close();
            process.exit(1);
        }
    }
}

// CLI
const command = process.argv[2];
const file = process.argv[3];

if (!command || !file) {
    console.log(`
Simple Environment File Encryption Tool

Usage:
  node simple-encrypt-env.js encrypt <file>
  node simple-encrypt-env.js decrypt <file>

Examples:
  node simple-encrypt-env.js encrypt .env.production
  node simple-encrypt-env.js decrypt .env.production.encrypted

Security Features:
  ✅ AES-256-GCM encryption
  ✅ PBKDF2 key derivation (100,000 iterations)
  ✅ Random salt and IV for each encryption
  ✅ Authentication tag for integrity verification
`);
    process.exit(0);
}

const encryption = new EnvEncryption();

if (command === 'encrypt') {
    encryption.encryptFile(file);
} else if (command === 'decrypt') {
    encryption.decryptFile(file);
} else {
    console.error(`❌ Unknown command: ${command}`);
    console.error(`   Use 'encrypt' or 'decrypt'`);
    process.exit(1);
}
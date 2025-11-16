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
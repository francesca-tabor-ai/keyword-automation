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
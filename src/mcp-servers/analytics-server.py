#!/usr/bin/env python3
"""
MCP Server for Analytics
Track events, generate reports, calculate metrics
"""

import asyncio
import json
from datetime import datetime, timedelta
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types
import sqlite3
import os

class Analytics:
    def __init__(self, db_path):
        self.db_path = db_path
    
    def track_event(self, event_type, metadata):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO analytics (event_type, metadata)
               VALUES (?, ?)''',
            (event_type, json.dumps(metadata))
        )
        
        conn.commit()
        conn.close()
    
    def get_metrics(self, days=7):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        since_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        
        # Total conversations
        cursor.execute(
            '''SELECT COUNT(*) FROM conversations 
               WHERE created_at >= ?''',
            (since_date,)
        )
        total_conversations = cursor.fetchone()[0]
        
        # Completed flows
        cursor.execute(
            '''SELECT COUNT(*) FROM conversations 
               WHERE status = 'completed' AND created_at >= ?''',
            (since_date,)
        )
        completed_flows = cursor.fetchone()[0]
        
        # Most triggered flows
        cursor.execute(
            '''SELECT current_flow, COUNT(*) as count 
               FROM conversations 
               WHERE created_at >= ?
               GROUP BY current_flow
               ORDER BY count DESC
               LIMIT 5''',
            (since_date,)
        )
        top_flows = cursor.fetchall()
        
        conn.close()
        
        return {
            'period_days': days,
            'total_conversations': total_conversations,
            'completed_flows': completed_flows,
            'completion_rate': completed_flows / total_conversations if total_conversations > 0 else 0,
            'top_flows': [{'flow': f[0], 'count': f[1]} for f in top_flows]
        }

server = Server("analytics")
analytics = Analytics(os.path.join(os.path.dirname(__file__), '../../data/chatbot.db'))

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="track_event",
            description="Track a custom event",
            inputSchema={
                "type": "object",
                "properties": {
                    "event_type": {"type": "string"},
                    "metadata": {"type": "object"}
                },
                "required": ["event_type"]
            }
        ),
        types.Tool(
            name="get_metrics",
            description="Get conversation metrics",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "default": 7}
                }
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    
    if name == "track_event":
        analytics.track_event(
            arguments["event_type"],
            arguments.get("metadata", {})
        )
        return [types.TextContent(
            type="text",
            text=json.dumps({"status": "tracked"})
        )]
    
    elif name == "get_metrics":
        metrics = analytics.get_metrics(arguments.get("days", 7))
        return [types.TextContent(
            type="text",
            text=json.dumps(metrics, indent=2)
        )]
    
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="analytics",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={}
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
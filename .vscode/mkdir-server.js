#!/usr/bin/env node
'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line.trim()); } catch (e) { return; }
  if (!msg || !msg.method) return;

  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'dir-creator', version: '1.0.0' }
    }});
  } else if (msg.method === 'notifications/initialized') {
    // notification, no response
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [
      {
        name: 'create_directory',
        description: 'Create a directory and all parent directories',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path to create' }
          },
          required: ['path']
        }
      }
    ]}});
  } else if (msg.method === 'tools/call') {
    if (msg.params && msg.params.name === 'create_directory') {
      const dirPath = msg.params.arguments.path;
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: exists ? 'Created: ' + dirPath : 'Failed silently: ' + dirPath }]
        }});
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true
        }});
      }
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown tool' }});
    }
  } else {
    if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' }});
    }
  }
});

process.on('uncaughtException', () => {});

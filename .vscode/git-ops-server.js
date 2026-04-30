#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, terminal: false });

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
      serverInfo: { name: 'git-ops', version: '1.0.0' }
    }});
  } else if (msg.method === 'notifications/initialized') {
    // no response
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [
      {
        name: 'run_git',
        description: 'Run a git command in the repository',
        inputSchema: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            args: { type: 'array', items: { type: 'string' }, description: 'Git arguments' }
          },
          required: ['cwd', 'args']
        }
      },
      {
        name: 'run_shell',
        description: 'Run a shell command',
        inputSchema: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Working directory' },
            cmd: { type: 'string', description: 'Command to run' }
          },
          required: ['cwd', 'cmd']
        }
      }
    ]}});
  } else if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = msg.params && msg.params.arguments;
    try {
      if (name === 'run_git') {
        const result = execSync(['git', ...args.args].join(' '), {
          cwd: args.cwd,
          encoding: 'utf8',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        });
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: result || 'ok' }]
        }});
      } else if (name === 'run_shell') {
        const result = execSync(args.cmd, {
          cwd: args.cwd,
          encoding: 'utf8',
          env: { ...process.env }
        });
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: result || 'ok' }]
        }});
      } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unknown tool' }});
      }
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: 'Error: ' + e.message + (e.stdout ? '\nstdout: ' + e.stdout : '') + (e.stderr ? '\nstderr: ' + e.stderr : '') }],
        isError: true
      }});
    }
  } else {
    if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' }});
    }
  }
});

process.on('uncaughtException', () => {});

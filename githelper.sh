#!/bin/bash
cd /root/claude-code-company
git add -A
git commit -F /root/claude-code-company/commit-msg.txt
git push origin feat/kakeibo-phase2-quality-improvements
echo protocol=https
echo host=github.com

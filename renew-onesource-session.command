#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "=================================================="
echo "🐻 Renewing OneSource Session State..."
echo "=================================================="
echo "1. A browser window will open."
echo "2. Please log in manually to OneSource."
echo "3. Once you see the rates homepage, return here and press [ENTER]."
echo "=================================================="
node auth.js onesource
if [ $? -eq 0 ]; then
  echo "=================================================="
  echo "✅ Session renewed successfully!"
  echo "Pushing updated session state to GitHub..."
  git add auth/onesource-state.json
  git commit -m "chore: renew OneSource session state"
  git push origin main
  echo "=================================================="
  echo "🚀 Pushed! Firebase will redeploy in 2 minutes."
else
  echo "❌ Failed to renew session."
fi
echo "Press any key to close."
read -n 1

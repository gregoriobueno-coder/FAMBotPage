#!/bin/bash
cd "$(dirname "$0")"
echo "=================================================="
echo "🐻 Starting Wandering Bear FAM Scout Scan..."
echo "=================================================="
node scout.js
echo "=================================================="
echo "✅ Scan completed! Press any key to close."
read -n 1

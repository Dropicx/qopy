#!/bin/bash

echo "🚀 Railway Install Script"
echo "========================"

# Check npm version
echo "📦 Checking npm version..."
node scripts/check-npm-version.js

# Remove existing package-lock.json if it exists
if [ -f "package-lock.json" ]; then
    echo "🗑️ Removing existing package-lock.json..."
    rm package-lock.json
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Verify installation
echo "✅ Installation completed"
echo "📊 Installed packages:"
npm list --depth=0

echo "🎉 Railway build ready!" 
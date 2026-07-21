#!/bin/bash

echo "=========================================="
echo "   Dameer Webhook Gateway - Git Manager   "
echo "=========================================="
echo "Select option:"
echo "1) Pull latest changes (Ghar/Office baithte hi code lene ke liye)"
echo "2) Push changes to GitHub (Kaam khatam karke code bhejne ke liye)"
echo "=========================================="
read -p "Enter your choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo "🔄 Pulling latest changes..."
    git pull origin main
    
    # Auto update backend venv if needed
    if [ -d "backend" ] && [ -f "backend/.venv/bin/activate" ]; then
        echo "⚙️ Updating backend dependencies..."
        cd backend && source .venv/bin/activate && pip install -r requirements.txt --quiet && cd ..
    fi
    
    # Auto update frontend if needed
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        echo "⚙️ Checking frontend packages..."
        cd frontend && npm install --silent && cd ..
    fi
    
    echo "✨ Sync & Pull completed successfully!"

elif [ "$choice" == "2" ]; then
    read -p "Enter commit message (or press enter for default): " msg
    if [ -z "$msg" ]; then
        msg="Auto update project code"
    fi
    
    echo "🚀 Pushing changes to GitHub..."
    git add .
    git commit -m "$msg"
    git push origin main
    echo "✨ Successfully pushed to GitHub!"

else
    echo "❌ Invalid choice! Please run again and select 1 or 2."
fi
#!/bin/bash
CURRENT_BRANCH=$(git branch --show-current)
echo "=========================================="
echo "   Dameer Gateway - Advanced Git Manager  "
echo "=========================================="
echo -e "Ì≥ç Current Active Branch: \033[1;32m[$CURRENT_BRANCH]\033[0m"
echo "------------------------------------------"
echo "Select option:"
echo "1) Pull latest changes (Code download/sync karne ke liye)"
echo "2) Push changes to current branch (Kaam save karke bhejne ke liye)"
echo "3) Create & Switch to a NEW branch (Naya independent workspace shuru karne ke liye)"
echo "4) Merge another branch into current branch (Kisi doosri branch ka code merge karne ke liye)"
echo "5) Switch to an EXISTING branch (List dekh kar kisi purani branch par jana)"
echo "=========================================="
read -p "Enter your choice (1-5): " choice

if [ "$choice" == "1" ]; then
    echo "Ì¥Ñ Pulling latest changes for [$CURRENT_BRANCH] from GitHub..."
    git pull origin "$CURRENT_BRANCH"
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        cp .env.example .env
    fi
    if docker ps --format '{{.Names}}' | grep -q "webhook_backend"; then
        docker exec webhook_backend alembic upgrade head
    fi
    if [ -d "backend" ] && [ -f "backend/.venv/bin/activate" ]; then
        cd backend && source .venv/bin/activate && pip install -r requirements.txt --quiet && cd ..
    fi
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        cd frontend && npm install --silent && cd ..
    fi
    echo "‚ú® Sync & Pull completed successfully!"

elif [ "$choice" == "2" ]; then
    read -p "Enter commit message (or press enter for default): " msg
    if [ -z "$msg" ]; then
        msg="Auto update project code on $CURRENT_BRANCH"
    fi
    git add .
    git commit -m "$msg"
    git push origin "$CURRENT_BRANCH"
    echo "‚ú® Successfully pushed to GitHub!"

elif [ "$choice" == "3" ]; then
    read -p "Enter the name of the new branch (e.g. feature-dashboard): " new_branch
    if [ -z "$new_branch" ]; then
        echo "‚ùå Branch name cannot be empty!"
        exit 1
    fi
    git checkout -b "$new_branch"
    git push -u origin "$new_branch"
    echo "‚ú® Successfully created branch '$new_branch' and published to GitHub!"

elif [ "$choice" == "4" ]; then
    read -p "Enter the name of the branch you want to merge INTO '$CURRENT_BRANCH': " source_branch
    if [ -z "$source_branch" ]; then
        echo "‚ùå Source branch name cannot be empty!"
        exit 1
    fi
    git pull origin "$source_branch"
    git merge "$source_branch"
    read -p "Do you want to push the merged changes to GitHub? (y/n): " push_confirm
    if [ "$push_confirm" == "y" ] || [ "$push_confirm" == "Y" ]; then
        git push origin "$CURRENT_BRANCH"
        echo "‚ú® Merge completed and pushed to GitHub successfully!"
    else
        echo "‚ú® Local merge completed successfully!"
    fi

elif [ "$choice" == "5" ]; then
    echo "Ì¥Ñ Fetching latest branches from remote..."
    git fetch --all --prune
    echo "------------------------------------------"
    echo "Ìºø Available Branches:"
    echo "------------------------------------------"
    
    branches=($(git branch -a | grep -v HEAD | sed 's/remotes\/origin\//origin\//g' | sed 's/^[ *]*//' | sort -u))
    
    i=1
    for b in "${branches[@]}"; do
        clean_name=$(echo "$b" | sed 's/origin\//(remote) /g')
        if [[ "$b" == "$CURRENT_BRANCH" ]]; then
            echo -e "$i) \033[1;32m$clean_name [CURRENT]\033[0m"
        else
            echo "$i) $clean_name"
        fi
        i=$((i+1))
    done
    
    echo "------------------------------------------"
    read -p "Enter the number of the branch you want to switch to: " branch_num
    
    selected_branch="${branches[$((branch_num-1))]}"
    
    if [ -z "$selected_branch" ]; then
        echo "‚ùå Invalid selection!"
        exit 1
    fi
    
    local_name=$(echo "$selected_branch" | sed 's/^origin\///')
    
    echo "Ì∫Ä Switching to branch: $local_name..."
    git checkout "$local_name" || git checkout -b "$local_name" "$selected_branch"
    echo "‚ú® Successfully switched to [$local_name]!"

else
    echo "‚ùå Invalid choice! Please run again and select between 1 to 5."
fi

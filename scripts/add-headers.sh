#!/bin/bash

# Script to add copyright headers to source code files
# Usage: ./add-headers.sh

HEADER_FILE="../header-template.txt"

echo "Adding copyright headers to source code files..."

# Find all JavaScript, TypeScript, JSX, and TSX files
find .. -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | while read file; do
    # Skip node_modules and other directories
    if [[ "$file" == *"node_modules"* ]] || [[ "$file" == *".git"* ]]; then
        continue
    fi
    
    # Check if file already has copyright header
    if ! grep -q "Copyright" "$file"; then
        echo "Adding header to: $file"
        # Create temporary file with header + content
        cat "$HEADER_FILE" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    else
        echo "Skipping (already has header): $file"
    fi
done

echo "Header addition complete!" 
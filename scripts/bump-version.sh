#!/bin/bash
# Bump version in all relevant files and update build info
#
# Usage: ./scripts/bump-version.sh [--no-git]
#   --no-git: Skip git commit of version changes

set -e

# Files containing version numbers
VERSION_FILES=(
    "app/sw.js"
    "app/api.js"
    "app/version.js"
    "server/app.py"
)

# Get current version from sw.js (portable - works on macOS and Linux)
CURRENT_VERSION=$(grep -o "whereish-v[0-9]*" app/sw.js | head -1 | grep -o "[0-9]*")
NEW_VERSION=$((CURRENT_VERSION + 1))

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"

# Update sw.js
sed -i '' "s/CACHE_NAME = 'whereish-v$CURRENT_VERSION'/CACHE_NAME = 'whereish-v$NEW_VERSION'/" app/sw.js
sed -i '' "s/const APP_VERSION = $CURRENT_VERSION;/const APP_VERSION = $NEW_VERSION;/" app/sw.js
# Also handle APP_VERSION with trailing comment
sed -i '' "s/const APP_VERSION = $CURRENT_VERSION;  \/\//const APP_VERSION = $NEW_VERSION;  \/\//" app/sw.js

# Update api.js
sed -i '' "s/const APP_VERSION = $CURRENT_VERSION;/const APP_VERSION = $NEW_VERSION;/" app/api.js

# Update server/app.py
sed -i '' "s/APP_VERSION', '$CURRENT_VERSION'/APP_VERSION', '$NEW_VERSION'/" server/app.py
sed -i '' "s/MIN_APP_VERSION', '$CURRENT_VERSION'/MIN_APP_VERSION', '$NEW_VERSION'/" server/app.py

# Update version.js with build info
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

cat > app/version.js << EOF
/**
 * Whereish Version Information
 *
 * This file is updated by the build process.
 * Do not edit manually - use 'make bump-version' instead.
 */

/* exported BUILD_INFO */
const BUILD_INFO = {
    version: $NEW_VERSION,
    buildTime: '$BUILD_TIME',
    gitCommit: '$GIT_COMMIT'
};
EOF

echo "Updated files:"
echo "  - app/sw.js: CACHE_NAME = 'whereish-v$NEW_VERSION'"
echo "  - app/sw.js: APP_VERSION = $NEW_VERSION"
echo "  - app/api.js: APP_VERSION = $NEW_VERSION"
echo "  - app/version.js: version = $NEW_VERSION, buildTime = $BUILD_TIME, gitCommit = $GIT_COMMIT"
echo "  - server/app.py: APP_VERSION = '$NEW_VERSION'"
echo "  - server/app.py: MIN_APP_VERSION = '$NEW_VERSION'"

if [[ "$1" != "--no-git" ]]; then
    echo ""
    echo "To commit these changes:"
    echo "  git add -A && git commit -m 'Bump version to $NEW_VERSION'"
fi

echo ""
echo "✓ Version bumped to $NEW_VERSION"

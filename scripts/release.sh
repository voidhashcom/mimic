#!/bin/bash

set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo "Creating release for $TAG..."

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag $TAG already exists"
  exit 1
fi

# Create and push the tag
git tag "$TAG"
git push origin "$TAG"

# Check if this is a pre-release (contains alpha, beta, rc, etc.)
PRERELEASE_FLAG=""
if [[ "$VERSION" =~ (alpha|beta|rc|dev|canary) ]]; then
  PRERELEASE_FLAG="--prerelease"
  echo "Detected pre-release version"
fi

# Create GitHub release
gh release create "$TAG" \
  --title "$TAG" \
  --generate-notes \
  $PRERELEASE_FLAG

echo "Release $TAG created successfully!"

#!/usr/bin/env bash
# Reset test fixtures for mobile smoke tests.
# Run before each full smoke-test session to ensure clean state.
#
# Usage: bash docs/qa/reset-test-fixtures.sh
#
# What it does:
#   1. Cleans up any prior smoke-test PR branch
#   2. Creates a fresh branch + trivial commit + open PR (for W8: merge flow)
#   3. Deletes local drafts from previous runs (for W2/W3/W4: draft flows)
#   4. Reports fixture state
#
# Prerequisites: gh CLI authenticated, sqlite3 available

set -euo pipefail

REPO="mean-weasel/issuectl-test-repo"
BRANCH="smoke-test-fixture"
DB="$HOME/.issuectl/issuectl.db"

echo "=== issuectl smoke-test fixture reset ==="
echo ""

# --- Step 1: Clean up prior fixture PR and branch ---
echo "[1/4] Cleaning up prior fixture PR..."
EXISTING_PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
if [ -n "$EXISTING_PR" ]; then
  echo "  Closing existing PR #$EXISTING_PR..."
  gh pr close "$EXISTING_PR" --repo "$REPO" --delete-branch 2>/dev/null || true
fi

# Delete remote branch if it still exists
if gh api "repos/$REPO/branches/$BRANCH" --silent 2>/dev/null; then
  echo "  Deleting remote branch $BRANCH..."
  gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" 2>/dev/null || true
fi

# --- Step 2: Create fresh PR ---
echo "[2/4] Creating fixture branch + PR..."

# Get main branch SHA
MAIN_SHA=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha')

# Create branch from main
gh api -X POST "repos/$REPO/git/refs" \
  -f "ref=refs/heads/$BRANCH" \
  -f "sha=$MAIN_SHA" --silent

# Create a trivial file change via the API (no local clone needed)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CONTENT=$(printf "Smoke test fixture\nCreated: %s\n" "$TIMESTAMP" | base64)
FILE_SHA=$(gh api "repos/$REPO/contents/smoke-test-fixture.md?ref=$BRANCH" --jq '.sha' 2>/dev/null || echo "")
if [ -n "$FILE_SHA" ]; then
  gh api -X PUT "repos/$REPO/contents/smoke-test-fixture.md" \
    -f "message=chore: smoke test fixture ($TIMESTAMP)" \
    -f "content=$CONTENT" \
    -f "branch=$BRANCH" \
    -f "sha=$FILE_SHA" --silent
else
  gh api -X PUT "repos/$REPO/contents/smoke-test-fixture.md" \
    -f "message=chore: smoke test fixture ($TIMESTAMP)" \
    -f "content=$CONTENT" \
    -f "branch=$BRANCH" --silent
fi

# Create PR
PR_URL=$(gh pr create --repo "$REPO" \
  --head "$BRANCH" \
  --title "chore: smoke test fixture" \
  --body "Automated fixture for mobile smoke tests. Safe to merge or close." \
  2>&1 | grep -o 'https://.*')

echo "  Created: $PR_URL"

# --- Step 3: Clean up local drafts from prior runs ---
echo "[3/4] Cleaning local drafts from prior smoke tests..."
if [ -f "$DB" ]; then
  DRAFT_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM drafts WHERE title LIKE '%smoke%' OR title LIKE '%Mobile draft%' OR title LIKE '%Test draft%' OR title LIKE '%Desktop draft%';")
  if [ "$DRAFT_COUNT" -gt 0 ]; then
    sqlite3 "$DB" "DELETE FROM drafts WHERE title LIKE '%smoke%' OR title LIKE '%Mobile draft%' OR title LIKE '%Test draft%' OR title LIKE '%Desktop draft%';"
    echo "  Deleted $DRAFT_COUNT smoke-test drafts"
  else
    echo "  No smoke-test drafts to clean"
  fi
else
  echo "  DB not found at $DB — skipping"
fi

# --- Step 4: Report ---
echo "[4/4] Fixture state:"
echo ""
OPEN_ISSUES=$(gh api "repos/$REPO/issues?state=open&per_page=100" --jq 'length')
OPEN_PRS=$(gh api "repos/$REPO/pulls?state=open&per_page=100" --jq 'length')
LOCAL_DRAFTS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM drafts;" 2>/dev/null || echo "?")
echo "  Test repo:     $REPO"
echo "  Open issues:   $OPEN_ISSUES"
echo "  Open PRs:      $OPEN_PRS (includes fixture PR)"
echo "  Local drafts:  $LOCAL_DRAFTS"
echo "  Fixture PR:    $PR_URL"
echo ""
echo "Ready for smoke tests!"

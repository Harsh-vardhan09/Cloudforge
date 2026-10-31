#!/usr/bin/env bash
set -Eeuo pipefail

# IdleLab: rebuild the repository history as 20 modular commits and push.
#
# Unlike the earlier version of this script, which split a dirty working tree,
# this one starts from a CLEAN tree and rewrites history: it opens an orphan
# branch, then re-adds the tree in 20 logical groups that follow the build
# order of the stack (shared config -> backend core -> backend features ->
# host agent -> frontend -> deployment). File contents are untouched; only
# the commit history is rewritten.
#
# Run from Git Bash in the gpuSharing project root.

EXPECTED_BRANCH="main"
REMOTE="origin"
EXPECTED_COMMITS=20

# Set SKIP_PUSH=1 to rebuild and verify the history locally without touching
# the remote. Useful for inspecting the result before the force-push.
SKIP_PUSH="${SKIP_PUSH:-0}"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: Expected branch $EXPECTED_BRANCH, got $BRANCH."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is not clean. Commit or stash your changes first,"
  echo "       then re-run: this script rewrites history and needs a known tree."
  git status --short
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_BRANCH="pre-split-backup-${STAMP}"

# ---------------------------------------------------------------
# Safety net: keep the history we are about to replace.
# ---------------------------------------------------------------
echo "Saving current history on branch: $BACKUP_BRANCH"
git branch "$BACKUP_BRANCH" "$EXPECTED_BRANCH"

echo "Opening an orphan branch and unstaging the tree..."
git checkout -q --orphan split-main
git reset -q

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------
COMMIT_COUNT=0

# Stage the given paths and commit them under the given message. Paths that
# match nothing are reported and skipped, so the script stays usable as files
# move around.
commit_group() {
  local message="$1"; shift
  local paths=() p
  for p in "$@"; do
    if [[ -e "$p" ]] || compgen -G "$p" >/dev/null; then
      paths+=("$p")
    else
      echo "  (skipping unknown path: $p)"
    fi
  done

  if [[ ${#paths[@]} -gt 0 ]]; then
    git add -A -- "${paths[@]}"
  fi

  if git diff --cached --quiet; then
    echo "SKIP: $message (nothing to stage)"
    return 0
  fi

  COMMIT_COUNT=$((COMMIT_COUNT + 1))
  printf '\n[%02d] %s\n' "$COMMIT_COUNT" "$message"
  git diff --cached --stat | tail -1
  git commit -q -m "$message"
}

# ---------------------------------------------------------------
# The 20 commits, in build order
# ---------------------------------------------------------------

# -- Shared configuration ---------------------------------------
commit_group "chore: initialize repository tooling and environment template" \
  .gitignore .env.example

# -- Backend core -----------------------------------------------
commit_group "feat(backend): add server scaffold, database connection and logging" \
  backend/package.json backend/package-lock.json backend/.gitignore \
  backend/loadEnv.js backend/Dbconnect.js \
  backend/utils/logger.js backend/utils/Errorhandler.js

commit_group "feat(auth): add user model and JWT authentication" \
  backend/models/user.model.js backend/middlewares/auth.js \
  backend/controllers/auth.controller.js backend/routers/auth.router.js

commit_group "feat(security): add encryption and network validation helpers" \
  backend/utils/cipher.js backend/utils/network.js

# -- Backend features -------------------------------------------
commit_group "feat(gpu): add GPU host registry and availability tracking" \
  backend/models/gpu.model.js backend/controllers/gpu.controller.js \
  backend/routers/gpu.router.js

commit_group "feat(storage): add S3-backed object storage for job artifacts" \
  backend/utils/objectStorage.js backend/create_bucket.js \
  backend/OBJECT_STORAGE.md

commit_group "feat(jobs): add job model, queue and lease-based scheduling" \
  backend/models/job.model.js backend/utils/queue.js \
  backend/controllers/jobs.controller.js backend/routers/jobs.router.js

commit_group "feat(realtime): add socket transport and live log streaming" \
  backend/utils/socket.js backend/utils/logEmitter.js

commit_group "feat(notifications): add notification model and delivery" \
  backend/models/notification.model.js backend/utils/notifications.js \
  backend/controllers/notifications.controller.js \
  backend/routers/notifications.router.js

commit_group "feat(billing): add wallet, transactions and payment verification" \
  backend/models/billing.model.js backend/models/transaction.model.js \
  backend/controllers/billing.controller.js backend/routers/billing.router.js

commit_group "feat(ai): add model assistance and diagnostics endpoints" \
  backend/controllers/ai.controller.js backend/routers/ai.router.js

commit_group "feat(api-market): add LLM resource proxy with usage metering" \
  backend/models/apiResource.model.js backend/models/apiUsage.model.js \
  backend/controllers/apiResource.controller.js \
  backend/routers/apiResource.router.js

commit_group "feat(backend): wire server bootstrap, routes and lease monitor" \
  backend/server.js

commit_group "build(backend): add production container image" \
  backend/Dockerfile backend/.dockerignore

# -- Host agent -------------------------------------------------
commit_group "feat(agent): add configuration, GPU discovery and heartbeat" \
  agent/config.py agent/gpu_info.py agent/heartbeat.py \
  agent/requirements.txt agent/.env.example

commit_group "feat(agent): add Docker job runner and agent HTTP service" \
  agent/docker_runner.py agent/main.py

commit_group "docs(agent): add installation guide and container build" \
  agent/README.md agent/Dockerfile agent/.dockerignore

# -- Frontend ---------------------------------------------------
commit_group "feat(frontend): scaffold React application, routing and auth context" \
  frontend/package.json frontend/package-lock.json frontend/.gitignore \
  frontend/README.md frontend/index.html frontend/vite.config.js \
  frontend/eslint.config.js frontend/src/main.jsx frontend/src/App.jsx \
  frontend/src/App.css frontend/src/index.css frontend/src/services/api.js \
  frontend/src/context/AuthContext.jsx frontend/src/assets frontend/public

commit_group "feat(frontend): add dashboard, jobs, host, billing and market pages" \
  frontend/src/components frontend/src/pages

# -- Deployment -------------------------------------------------
commit_group "build: add web container, reverse proxy and service orchestration" \
  frontend/Dockerfile frontend/nginx.conf frontend/.dockerignore \
  docker-compose.yml script.sh

# ---------------------------------------------------------------
# Verification
# ---------------------------------------------------------------
echo
echo "Verifying that every tracked file landed in a commit..."
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  echo "ERROR: Files remain outside the commit groups. Add them to a group above."
  echo "       Your previous history is intact on branch $BACKUP_BRANCH."
  exit 1
fi

echo "Verifying the commit count..."
if [[ "$COMMIT_COUNT" -ne "$EXPECTED_COMMITS" ]]; then
  echo "ERROR: Made $COMMIT_COUNT commits, expected $EXPECTED_COMMITS."
  echo "       Your previous history is intact on branch $BACKUP_BRANCH."
  exit 1
fi

echo "Verifying that the rebuilt tree matches the old one exactly..."
if ! git diff --quiet "$BACKUP_BRANCH" HEAD; then
  echo "ERROR: The rebuilt tree differs from $BACKUP_BRANCH:"
  git diff --stat "$BACKUP_BRANCH" HEAD
  exit 1
fi

echo "Verifying that no environment file entered the history..."
if git log --name-only --pretty=format: HEAD | grep -qE '(^|/)\.env$'; then
  echo "ERROR: A .env file is present in the new history. Refusing to push."
  exit 1
fi

git branch -M "$EXPECTED_BRANCH"

echo
echo "New history:"
git log --oneline

# ---------------------------------------------------------------
# Push
# ---------------------------------------------------------------
if [[ "$SKIP_PUSH" == "1" ]]; then
  echo
  echo "SKIP_PUSH=1 set: history rebuilt locally, nothing pushed."
  echo "Review it, then push with: git push --force-with-lease $REMOTE $EXPECTED_BRANCH"
  echo "Previous history is kept locally on: $BACKUP_BRANCH"
  exit 0
fi

echo
echo "Pushing to $REMOTE/$EXPECTED_BRANCH (history rewrite, so force is required)..."
if git ls-remote --exit-code --heads "$REMOTE" "$EXPECTED_BRANCH" >/dev/null 2>&1; then
  git push --force-with-lease "$REMOTE" "$EXPECTED_BRANCH"
else
  git push -u "$REMOTE" "$EXPECTED_BRANCH"
fi

echo
echo "Done. $COMMIT_COUNT commits pushed."
echo "Previous history is kept locally on: $BACKUP_BRANCH"
echo "Delete it once you are satisfied: git branch -D $BACKUP_BRANCH"

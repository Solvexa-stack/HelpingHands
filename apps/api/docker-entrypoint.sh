#!/bin/sh
set -e

# Runs as root so it can fix ownership of the `uploads` named volume, which
# may still contain files from before this image ran as a non-root user.
# Idempotent: a no-op once everything is already owned by nestjs.
if [ -d /app/uploads ]; then
  chown -R nestjs:nodejs /app/uploads
fi

exec su-exec nestjs "$@"

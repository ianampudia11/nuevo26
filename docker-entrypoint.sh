#!/bin/bash
set -e

echo "🚀 Starting application initialization..."

# Parse DATABASE_URL to extract connection parameters
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL is not set"
    exit 1
fi

echo "📝 Parsing DATABASE_URL..."

# Extract components from DATABASE_URL
# Format: postgres://user:password@host:port/database?options
DB_USER=$(echo "$DATABASE_URL" | sed -n 's#postgres://\([^:]*\):.*#\1#p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's#postgres://[^:]*:\([^@]*\)@.*#\1#p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's#.*@\([^:]*\):.*#\1#p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's#.*:\([0-9]*\)/.*#\1#p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's#.*/\([^?]*\).*#\1#p')

echo "📊 Database connection details:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
RETRIES=60
until PGPASSWORD="$DB_PASS" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q || [ $RETRIES -eq 0 ]; do
  echo "  Waiting for PostgreSQL... ($RETRIES attempts left)"
  RETRIES=$((RETRIES-1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
    echo "❌ ERROR: PostgreSQL did not become ready in time"
    exit 1
fi

echo "✅ PostgreSQL is ready!"

# Check if this is the first run by looking for migration status
MIGRATION_STATUS_FILE="/app/data/.migration_status"
MIGRATIONS_DIR="/app/migrations"

# Function to check if migration has been applied
is_migration_applied() {
    local migration_file=$1
    if [ -f "$MIGRATION_STATUS_FILE" ]; then
        grep -q "^${migration_file}:applied:" "$MIGRATION_STATUS_FILE"
    else
        return 1
    fi
}

# Function to mark migration as applied
mark_migration_applied() {
    local migration_file=$1
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [ ! -f "$MIGRATION_STATUS_FILE" ]; then
        mkdir -p "$(dirname "$MIGRATION_STATUS_FILE")"
        echo "# Migration Status - Auto-generated" > "$MIGRATION_STATUS_FILE"
    fi
    
    if grep -q "^${migration_file}:" "$MIGRATION_STATUS_FILE"; then
        sed -i "s/^${migration_file}:.*/${migration_file}:applied:${timestamp}/" "$MIGRATION_STATUS_FILE"
    else
        echo "${migration_file}:applied:${timestamp}" >> "$MIGRATION_STATUS_FILE"
    fi
    
    echo "  ✓ Marked migration as applied: $migration_file"
}

# Run migrations
echo "📦 Checking for pending migrations..."

if [ -d "$MIGRATIONS_DIR" ]; then
    MIGRATION_COUNT=0
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            migration_name=$(basename "$migration_file")
            
            if ! is_migration_applied "$migration_name"; then
                echo "  ⚙️  Applying migration: $migration_name"
                if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" 2>&1 | grep -v "NOTICE"; then
                    mark_migration_applied "$migration_name"
                    MIGRATION_COUNT=$((MIGRATION_COUNT+1))
                else
                    echo "  ❌ Migration failed: $migration_name"
                    exit 1
                fi
            else
                echo "  ⏭️  Migration already applied: $migration_name"
            fi
        fi
    done
    
    if [ $MIGRATION_COUNT -gt 0 ]; then
        echo "✅ Applied $MIGRATION_COUNT migration(s) successfully!"
    else
        echo "✅ All migrations up to date!"
    fi
else
    echo "⚠️  No migrations directory found, skipping migrations"
fi

# Start the application
echo "🎯 Starting the application..."
exec "$@"

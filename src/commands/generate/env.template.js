// Environment Configuration Template
// Usage: Generate .env files for different environments

export const envTemplate = `# ============================================
# Environment Configuration
# ============================================
# Copy this file to .env and update with your values
# Never commit .env to version control!

# ============================================
# Application
# ============================================
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
API_URL=http://localhost:5000/api

# ============================================
# Database (MongoDB)
# ============================================
MONGODB_URI=mongodb://localhost:27017/your-database
MONGODB_CONNECTION_TIMEOUT=10000
MONGODB_POOL_SIZE=10

# ============================================
# Authentication
# ============================================
JWT_SECRET=change-this-to-a-secure-random-string
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ============================================
# Security
# ============================================
CORS_ORIGIN=http://localhost:3000
CSRF_SECRET=change-this-to-a-secure-random-string
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# ============================================
# Email (SMTP)
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@your-app.com

# ============================================
# File Upload
# ============================================
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf

# ============================================
# Logging
# ============================================
LOG_LEVEL=info
LOG_FORMAT=combined
LOG_DIR=./logs

# ============================================
# Redis (for caching/sessions)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# ============================================
# External Services
# ============================================
# STRIPE_SECRET_KEY=sk_test_your_key
# SENTRY_DSN=https://your-dsn@sentry.io/project
# AWS_ACCESS_KEY_ID=your-key
# AWS_SECRET_ACCESS_KEY=your-secret
# AWS_REGION=us-east-1
# AWS_BUCKET_NAME=your-bucket

# ============================================
# Feature Flags
# ============================================
ENABLE_EMAIL_VERIFICATION=true
ENABLE_TWO_FACTOR_AUTH=false
ENABLE_USER_REGISTRATION=true
ENABLE_PUBLIC_API=true

# ============================================
# Development Tools
# ============================================
ENABLE_DEV_TOOLS=true
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_SWAGGER_DOCS=true
`;

export const gitignoreTemplate = `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
/coverage

# Production
/build
/dist

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage
.grunt

# Bower directory
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions
.vscode-test

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Backup files
.loom-backup-*
.fsk-backup-*

# Local files
*.local
`;

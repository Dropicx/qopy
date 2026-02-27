# Qopy Documentation

Index of all documentation in this directory. For AI and developer context (commands, architecture summary), see the root [CLAUDE.md](../CLAUDE.md).

## Getting started

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide: Railway, environment variables, security checklist, CSP notes. |
| [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) | Database migration: automatic migration on startup, manual steps, testing. |

## Architecture and design

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Current application structure (server, routes, services) and future direction. |
| [CHUNK_UPLOAD_ARCHITECTURE.md](CHUNK_UPLOAD_ARCHITECTURE.md) | Chunk upload design: 5MB chunks, multer limits, assembly flow. |
| [PERFORMANCE.md](PERFORMANCE.md) | Performance optimizations: indexes, parallel processing, best practices. |

## Security

| Document | Description |
|----------|-------------|
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Security review: threat model, controls, recommendations, implementation notes. |
| [SECURITY.md](../SECURITY.md) | Security policy (root): supported versions, vulnerability reporting, response timeline. |

## Testing

| Document | Description |
|----------|-------------|
| [TESTING.md](TESTING.md) | Testing guide: unit and integration tests, coverage, commands. |
| [VERSCHLÜSSELUNGSTEST-ANLEITUNG.md](VERSCHLÜSSELUNGSTEST-ANLEITUNG.md) | German-language encryption test guide and manual test instructions. |

## Product and roadmap

| Document | Description |
|----------|-------------|
| [FEATURE_COMPARISON_MATRIX.md](FEATURE_COMPARISON_MATRIX.md) | Feature and pricing tiers (Free, Pro, Business, Enterprise). |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Monetization implementation roadmap (draft). |
| [market-research-competitive-analysis.md](market-research-competitive-analysis.md) | Competitive market research for secure file sharing. |

## Historical / reference

| Document | Description |
|----------|-------------|
| [BUG_FIXES.md](BUG_FIXES.md) | Historical log of notable bug fixes (date display, upload percentage, etc.). |
| [PRODUCTION_REPORTS.md](PRODUCTION_REPORTS.md) | Archive of historical production validation and deployment reports. |
| [redis-sigterm-fix.md](redis-sigterm-fix.md) | Past fix for Redis SIGTERM handling on Railway. |
| [SOLID-REFACTORING-ISSUE-4.md](SOLID-REFACTORING-ISSUE-4.md) | Design document for file-upload.js refactor (Issue #4); partial/planned. |
| [DRY-REFACTORING-SOLUTION.md](DRY-REFACTORING-SOLUTION.md) | DRY refactor for script.js (Issue #5); some helpers under public/js/. |

## Archive

| Location | Description |
|----------|-------------|
| [reports/archive/](reports/archive/) | Historical validation, cleanup, and analysis reports (see [reports/archive/README.md](reports/archive/README.md)). |

# 🔐 Password Migration Guide

## Overview

Qopy has been updated to use secure bcrypt password hashing instead of storing passwords in plaintext. This migration ensures that all existing passwords are securely hashed.

## What Changed

### Before (Insecure)
- Passwords stored as plaintext in database
- Direct string comparison for verification
- Vulnerable to database breaches

### After (Secure)
- Passwords hashed with bcrypt (salt rounds: 12)
- Secure comparison using bcrypt.compare()
- Resistant to rainbow table attacks

## Migration Process

### Automatic Migration
The migration runs automatically when the application starts:
1. Database initialization (`db-init.js`)
2. **Password migration (`migrate-passwords.js`)** ← NEW
3. Application startup (`server.js`)

### Manual Migration
If you need to run the migration manually:

```bash
npm run db:migrate-passwords
```

## Migration Details

### What the Migration Does
1. **Scans** all clips with passwords
2. **Detects** already hashed passwords (starts with `$2b$`)
3. **Hashes** plaintext passwords using bcrypt
4. **Updates** database with secure hashes
5. **Reports** migration statistics

### Migration Safety
- ✅ **Non-destructive**: Original data preserved
- ✅ **Idempotent**: Can be run multiple times safely
- ✅ **Backward compatible**: Supports both old and new formats during transition
- ✅ **Error handling**: Continues on individual failures

### Example Migration Output
```
🔐 Starting password migration...
🔍 Checking for plaintext passwords...
📋 Found 15 clips with passwords
⏭️ Skipping ABC123 - already hashed
✅ Migrated password for clip DEF456
✅ Migrated password for clip GHI789
...

📊 Migration Summary:
   ✅ Migrated: 12 passwords
   ⏭️ Skipped: 3 (already hashed)
   📋 Total processed: 15

🎉 Password migration completed successfully!
```

## Security Improvements

### Password Storage
- **Before**: `password_hash VARCHAR(255)` - stored plaintext
- **After**: `password_hash VARCHAR(60)` - stores bcrypt hash

### Verification Process
- **Before**: `password === stored_password`
- **After**: `bcrypt.compare(password, stored_hash)`

### Salt Rounds
- **Configuration**: 12 rounds (high security)
- **Performance**: ~250ms per hash (acceptable for this use case)

## Backward Compatibility

During the migration period, the system supports both formats:
1. **New passwords**: Always hashed with bcrypt
2. **Existing passwords**: Automatically migrated to bcrypt
3. **Legacy verification**: Falls back to plaintext comparison if needed

## Monitoring

### Log Messages
- `✅ Migrated password for clip XXX` - Successfully migrated
- `⏭️ Skipping XXX - already hashed` - Already secure
- `⚠️ Using legacy plaintext password comparison` - Temporary fallback
- `❌ Failed to migrate password for clip XXX` - Error (logged but continues)

### Health Checks
- Migration status reported in admin dashboard
- No impact on application availability
- Graceful error handling

## Troubleshooting

### Common Issues

1. **Migration fails to start**
   - Check `DATABASE_URL` environment variable
   - Verify database connectivity

2. **Some passwords not migrated**
   - Check logs for specific error messages
   - Run migration again (safe to retry)

3. **Performance impact**
   - Migration runs once at startup
   - bcrypt hashing adds ~250ms per password
   - Consider running during low-traffic periods

### Manual Recovery
If automatic migration fails:

```bash
# Check database connection
npm run db:check

# Run migration manually
npm run db:migrate-passwords

# Verify migration
# Check admin dashboard for statistics
```

## Security Notes

### Before Deployment
- ✅ Test migration in staging environment
- ✅ Backup database before production deployment
- ✅ Monitor logs during first deployment

### After Migration
- ✅ Verify all passwords are hashed
- ✅ Check admin dashboard statistics
- ✅ Monitor for any authentication issues

### Long-term
- Legacy plaintext support will be removed in future versions
- All passwords should be hashed after migration
- Regular security audits recommended

## Support

If you encounter issues during migration:
1. Check application logs
2. Verify database connectivity
3. Run manual migration script
4. Contact support with specific error messages 
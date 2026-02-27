# Redis SIGTERM Graceful Shutdown Fix

This document describes a past fix for Redis SIGTERM handling on Railway.

## Issue Overview

**Problem**: Redis connections were not closing properly during SIGTERM signals on Railway deployment, causing graceful shutdown failures.

**Impact**: Railway's container orchestration would forcefully terminate the application when scaling or restarting, potentially losing data or leaving connections in an inconsistent state.

## Root Cause Analysis

### Primary Causes

1. **Duplicate Signal Handlers**: Both `server.js` and `config/redis.js` registered independent SIGTERM handlers, creating race conditions during shutdown.
2. **Missing Redis Cleanup**: The main graceful shutdown function didn't include Redis disconnection logic.
3. **Insufficient Timeout**: 10-second shutdown timeout was too short for Railway's platform requirements.

### Contributing Factors

- Railway health check timeout (30s) mismatched with application shutdown timeout (10s)
- Async database pool closure could exceed timeout during high load
- No coordination between Redis and database shutdown sequences

## Solution Implementation

### 1. Centralized Signal Handling

**Before**: Duplicate handlers in multiple files
```javascript
// server.js
process.on('SIGTERM', () => gracefulShutdown());

// config/redis.js
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

**After**: Single handler in server.js
```javascript
// server.js - Centralized handler
process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
});
```

### 2. Integrated Redis Cleanup

**Before**: No Redis cleanup in graceful shutdown
```javascript
function gracefulShutdown() {
    pool.end()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
```

**After**: Proper Redis disconnection sequence
```javascript
async function gracefulShutdown(signal = 'SIGTERM') {
    // Close Redis connection first
    if (redisManager) {
        await redisManager.disconnect();
    }
    
    // Then close database pool
    await pool.end();
    
    process.exit(0);
}
```

### 3. Extended Shutdown Timeout

**Before**: 10-second timeout
**After**: 30-second timeout aligned with Railway requirements

```javascript
const shutdownTimeout = setTimeout(() => {
    console.log('⚠️ Graceful shutdown timeout exceeded, forcing exit...');
    process.exit(1);
}, 30000); // Railway-compatible timeout
```

## Architecture Considerations

### Signal Flow
```
Railway SIGTERM → server.js handler → gracefulShutdown()
                                    ↓
                            1. Clear intervals
                            2. Disconnect Redis
                            3. Close database pool
                            4. Exit cleanly
```

### Resource Cleanup Order
1. **Application State**: Clear intervals and timeouts
2. **External Connections**: Disconnect Redis (faster)
3. **Database Pool**: Close all database connections (slower)
4. **Process Exit**: Clean termination with status 0

## Testing & Validation

### Verification Steps
1. ✅ Redis cleanup integrated into main shutdown
2. ✅ Duplicate signal handlers removed
3. ✅ Timeout increased to 30 seconds
4. ✅ Async/await properly implemented
5. ✅ Error handling comprehensive

### Monitoring Recommendations
- Track SIGTERM frequency in production logs
- Monitor shutdown duration metrics
- Alert on shutdown timeouts
- Track Redis connection state during deployments

## Future Improvements

### Short Term
- Add health check endpoint for Redis connectivity
- Implement connection pool monitoring
- Add shutdown progress metrics

### Long Term
- Implement circuit breaker pattern for Redis
- Add connection pool configuration for Railway
- Create automated shutdown testing suite

## Platform-Specific Notes

### Railway Deployment
- Container orchestration expects 30-second graceful shutdown
- Health checks run every 60 seconds with 30-second timeout
- Auto-scaling can trigger SIGTERM during:
  - Memory pressure (>90% usage)
  - CPU saturation (>80% sustained)
  - Manual scaling operations
  - Platform maintenance

### Best Practices
1. Always close external connections before database
2. Use async/await for proper sequencing
3. Implement generous timeouts for cloud platforms
4. Centralize signal handling to prevent race conditions
5. Log each shutdown step for debugging

## References
- Railway Documentation: Container Lifecycle
- Node.js Best Practices: Graceful Shutdown
- Redis Client: Connection Management
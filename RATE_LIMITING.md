# 🚦 Rate Limiting Guide

## Overview

Qopy implements a multi-layered IP-based rate limiting system to prevent abuse and DoS attacks while ensuring fair usage for legitimate users.

## Rate Limiting Layers

### 1. Burst Protection (1 minute window)
- **Limit**: 30 requests per IP per minute
- **Purpose**: Immediate protection against rapid-fire attacks
- **Scope**: All API endpoints (except health checks and admin)

### 2. General API Protection (15 minutes window)
- **Limit**: 100 requests per IP per 15 minutes
- **Purpose**: General API usage protection
- **Scope**: All API endpoints (except health checks and admin)

### 3. Share API Protection (15 minutes window)
- **Limit**: 20 share requests per IP per 15 minutes
- **Purpose**: Prevent spam content creation
- **Scope**: `/api/share` endpoint only

### 4. Retrieval API Protection (15 minutes window)
- **Limit**: 50 retrieval requests per IP per 15 minutes
- **Purpose**: Allow more reads than writes
- **Scope**: `/api/clip/` endpoints only

## IP Detection

### Railway Production
- Uses `X-Forwarded-For` header
- Trust proxy enabled
- Real client IP detected behind Railway proxy

### Development
- Uses direct connection IP
- Trust proxy enabled for testing

### IP Extraction Logic
```javascript
function getClientIP(req) {
  return req.ip || req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         req.connection.socket?.remoteAddress;
}
```

## Exempted Endpoints

The following endpoints are **NOT** rate limited:
- `/health` - Health checks
- `/api/health` - API health checks
- `/ping` - Simple ping
- `/api/admin/*` - Admin endpoints (protected by authentication)

## Rate Limit Responses

### HTTP Status
- **429 Too Many Requests** - Rate limit exceeded

### Response Format
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

### Headers
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Time until reset (Unix timestamp)

## Monitoring & Logging

### Share Request Logging
```
📋 Share request from 192.168.1.100 - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Rate Limit Hit Logging
```
🚫 Rate limit hit by 192.168.1.100 on /api/share - Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

### Suspicious Pattern Detection
- High-frequency share requests
- Unusual User-Agent patterns
- Multiple rate limit violations

## Usage Examples

### Normal Usage (Within Limits)
```bash
# Create 5 clips (well within 20 per 15 minutes)
for i in {1..5}; do
  curl -X POST https://qopy.app/api/share \
    -H "Content-Type: application/json" \
    -d '{"content":"Test $i","expiration":"1hr"}'
done
```

### Rate Limited Usage
```bash
# This will hit the rate limit
for i in {1..25}; do
  curl -X POST https://qopy.app/api/share \
    -H "Content-Type: application/json" \
    -d '{"content":"Test $i","expiration":"1hr"}'
done
# Response: 429 Too Many Requests
```

## Configuration

### Environment Variables
- `NODE_ENV` - Determines trust proxy settings
- Rate limits are hardcoded for security

### Railway-Specific
- Automatic IP detection behind Railway proxy
- SSL termination handled by Railway
- Real client IP preserved

## Security Benefits

### DoS Protection
- ✅ **IP-based limits** prevent single attacker from blocking all users
- ✅ **Multiple time windows** catch different attack patterns
- ✅ **Endpoint-specific limits** allow legitimate usage patterns

### Abuse Prevention
- ✅ **Share limiting** prevents spam content creation
- ✅ **Burst protection** prevents rapid-fire attacks
- ✅ **Monitoring** detects suspicious patterns

### Fair Usage
- ✅ **Different limits** for different operations
- ✅ **Read vs Write** distinction
- ✅ **Health check exemption** for monitoring

## Troubleshooting

### Common Issues

1. **Rate limited too aggressively**
   - Check if you're making too many requests
   - Wait for the time window to reset
   - Consider implementing client-side rate limiting

2. **IP detection issues**
   - Verify trust proxy settings
   - Check Railway configuration
   - Review logs for IP detection

3. **Admin access blocked**
   - Admin endpoints are exempt from rate limiting
   - Check authentication instead
   - Verify ADMIN_TOKEN environment variable

### Debugging

```bash
# Check current rate limit status
curl -I https://qopy.app/api/share

# Response headers show limits:
# X-RateLimit-Limit: 20
# X-RateLimit-Remaining: 19
# X-RateLimit-Reset: 1640995200
```

## Best Practices

### For Users
- Implement exponential backoff on 429 responses
- Cache responses when possible
- Monitor rate limit headers

### For Developers
- Test rate limiting in development
- Monitor logs for abuse patterns
- Adjust limits based on usage patterns

### For Operations
- Monitor rate limit hit frequency
- Watch for unusual IP patterns
- Consider adjusting limits for legitimate high-volume users

## Future Improvements

### Planned Enhancements
- [ ] User-agent based rate limiting
- [ ] Geographic rate limiting
- [ ] Dynamic rate limit adjustment
- [ ] Rate limit analytics dashboard

### Monitoring Enhancements
- [ ] Rate limit metrics in admin dashboard
- [ ] Alert system for abuse detection
- [ ] IP reputation system
- [ ] Automatic blocking of abusive IPs 
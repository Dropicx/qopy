# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Qopy seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Reporting Process

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report via **GitHub’s private vulnerability reporting**: [Report a vulnerability](https://github.com/Dropicx/qopy/security/advisories/new) (creates a private draft advisory so the issue is not public).

Please include the following information in your report:
- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Initial Response**: Within 48 hours
- **Triage**: Within 7 days
- **Fix Timeline**: 
  - Critical vulnerabilities: 7 days
  - High vulnerabilities: 14 days
  - Medium vulnerabilities: 30 days
  - Low vulnerabilities: 60 days

### Disclosure Policy

- We request that you give us reasonable time to address the issue before any disclosure to third parties
- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide an estimated timeline for addressing the vulnerability
- We will notify you when the vulnerability is fixed
- We may publicly acknowledge your contribution to improving our security (with your permission)

## Security Measures Implemented

### Application Security
- **Input Validation**: All user inputs are validated using express-validator
- **Rate Limiting**: API endpoints are protected against abuse
- **CORS Protection**: Cross-origin requests are properly configured
- **Security Headers**: Helmet.js provides comprehensive security headers
- **File Upload Security**: Strict file type validation and size limits
- **SQL Injection Prevention**: Parameterized queries for all database operations

### Infrastructure Security
- **HTTPS Only**: All communications encrypted in transit
- **Database Security**: Connection encryption and access controls
- **Redis Security**: Authentication and connection encryption
- **Environment Variables**: Sensitive configuration stored securely
- **Container Security**: Regular base image updates and security scanning

### Dependency Security
- **Automated Scanning**: Regular dependency vulnerability scans
- **Update Policy**: Security patches applied within 7 days
- **License Compliance**: All dependencies reviewed for license compatibility
- **Supply Chain**: Package integrity verification

### Data Protection
- **Encryption**: Sensitive data encrypted at rest and in transit
- **Access Controls**: Role-based access to administrative functions
- **Data Retention**: Automatic cleanup of temporary data
- **Privacy**: Minimal data collection and anonymous operation

## Security Configuration

### CI/CD Secrets (GitHub Actions)

The following repository secrets are used by GitHub Actions. Configure them under **Settings → Secrets and variables → Actions** (do not commit secrets).

| Secret | Used by | Required |
|--------|---------|----------|
| `CODECOV_TOKEN` | CI/CD Pipeline (coverage upload) | Optional; coverage upload is `continue-on-error: true` |
| `SNYK_TOKEN` | Security Audit (scheduled Snyk scan) | Optional; Snyk step is skipped when unset |
| `GITHUB_TOKEN` | All workflows | Auto-provided by GitHub |

**Deployment**: Staging and production deployment is handled outside the workflow (e.g. Railway GitHub integration). No deploy secrets are required in the repo for the current pipeline.

### Environment Variables
Ensure the following environment variables are properly configured:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/dbname
DATABASE_ENCRYPTION_KEY=<32-byte-random-key>

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=<secure-password>

# Application
NODE_ENV=production
SESSION_SECRET=<random-64-char-string>
ENCRYPTION_KEY=<32-byte-random-key>

# Security
ALLOWED_ORIGINS=https://yourdomain.com
MAX_FILE_SIZE=10485760
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

### Production Deployment
- Use HTTPS/TLS certificates from a trusted CA
- Configure proper firewall rules
- Enable database connection encryption
- Use strong authentication for administrative access
- Regular security updates and patches
- Monitor security logs and alerts

## Security Best Practices for Contributors

### Code Security
- Follow secure coding practices
- Validate all inputs at application boundaries
- Use parameterized queries for database operations
- Avoid storing sensitive data in logs
- Implement proper error handling without information leakage

### Dependency Management
- Keep dependencies up to date
- Review security advisories for used packages
- Use `npm audit` to check for vulnerabilities
- Avoid unnecessary dependencies

### Testing Security
- Include security test cases
- Test input validation boundaries
- Verify authentication and authorization
- Test error handling paths

## Vulnerability Disclosure Examples

### What to Report
- SQL injection vulnerabilities
- Cross-site scripting (XSS) issues
- Authentication bypass
- Privilege escalation
- File upload vulnerabilities
- Server-side request forgery (SSRF)
- Insecure cryptographic implementations

### What Not to Report
- Issues requiring user interaction (social engineering)
- Issues requiring physical access to user devices
- Issues in third-party services not under our control
- Rate limiting or spam issues (unless they can be bypassed)

## Recognition

We appreciate the security research community's efforts to improve our security. Contributors who responsibly disclose vulnerabilities may be acknowledged in our security advisories (with permission).

---

**Last Updated**: January 2025

For questions about this policy, contact qopy.quiet156@passmail.net or use the Security tab above.
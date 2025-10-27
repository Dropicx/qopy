# 🚀 CI/CD Pipeline Documentation

## Overview

Qopy uses a comprehensive, professional-grade DevOps/DevSecOps pipeline running on self-hosted k8s-runner. The pipeline ensures code quality, security, and reliability before deployment.

---

## 📋 Pipeline Architecture

### Workflows

1. **Main Pipeline** (`.github/workflows/main-pipeline.yml`)
   - Runs on: `k8s-runner`
   - Triggers: Push to main/dev, Pull Requests
   - Jobs: Code Quality → Security → Tests → Build → Deploy

2. **PR Quality Gates** (`.github/workflows/pr-checks.yml`)
   - Runs on: `k8s-runner`
   - Triggers: PR open/update
   - Jobs: Validation → Quick Checks → Coverage Diff → Security

3. **Security Scanning** (`.github/workflows/security.yml`)
   - Runs on: `k8s-runner`
   - Triggers: Push, PR, Daily schedule (2 AM UTC)
   - Jobs: Dependencies → Secrets → Code Security → SQL Injection → Licenses

4. **Performance Testing** (`.github/workflows/performance.yml`)
   - Runs on: `k8s-runner`
   - Triggers: Weekly (Monday 3 AM UTC), Manual
   - Jobs: Load Testing → Response Time → Memory → Bundle Size → DB Performance

---

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install all new devDependencies including:
- ESLint & plugins
- Prettier
- Artillery (load testing)
- Madge (complexity analysis)
- License checker

### 2. Configure GitHub Runner

Ensure your self-hosted runner is labeled as `k8s-runner-qopy`:

```bash
# When configuring the runner
./config.sh --url https://github.com/your-org/qopy --token YOUR_TOKEN --labels k8s-runner-qopy
```

**⚠️ Docker Requirement**: The runner must have Docker installed and running for the following jobs:
- Integration tests (requires PostgreSQL and Redis services)
- SQL injection tests (requires PostgreSQL service)
- Memory leak detection (requires PostgreSQL service)
- Database performance tests (requires PostgreSQL service)
- Test coverage jobs (requires PostgreSQL and Redis services)

If Docker is not available, these jobs will fail. To enable Docker on your runner:

```bash
# Install Docker if not already installed
sudo apt-get update
sudo apt-get install -y docker.io

# Ensure Docker daemon is running
sudo systemctl start docker
sudo systemctl enable docker

# Add runner user to docker group
sudo usermod -aG docker $USER

# Restart runner service
sudo systemctl restart actions.runner.*
```

### 3. Set GitHub Secrets

Required secrets (most already configured):
- `RAILWAY_TOKEN` - For Railway deployment
- `DATABASE_URL` - For integration tests
- `ADMIN_TOKEN` - For admin tests
- `CODECOV_TOKEN` - (Optional) For coverage reports

---

## 🎯 Usage

### Local Development

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Generate coverage
npm run test:coverage

# Security audit
npm run security:audit

# Health check (requires running server)
npm run health:check

# Full CI suite
npm run ci
npm run ci:full  # includes coverage and security
```

### GitHub Actions

#### On Push

Pushes to `main` or `dev` branches automatically trigger:
1. Code quality checks (ESLint, Prettier)
2. Security scanning (Trivy, npm audit)
3. Unit tests
4. Integration tests
5. Coverage report
6. Build validation
7. Deployment (staging for dev, production for main)

#### On Pull Request

PRs automatically trigger:
1. PR validation (title format, size check)
2. Quick quality checks
3. Test coverage diff
4. Security quick scan
5. Auto-labeling

#### Manual Triggers

Performance testing can be triggered manually:
```bash
gh workflow run performance.yml -f target_url=https://staging.qopy.app -f duration=60
```

---

## 📊 Quality Gates

### Code Quality
- ✅ ESLint passing (zero errors)
- ✅ Prettier formatted
- ✅ Cyclomatic complexity < 15
- ✅ Max function length < 100 lines

### Security
- ✅ Zero critical/high vulnerabilities
- ✅ No hardcoded secrets
- ✅ SQL injection tests passing
- ✅ License compliance

### Testing
- ✅ Minimum 40% test coverage
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ Coverage not decreased by >1%

### Performance
- ✅ Response time < 3s
- ✅ No memory leaks
- ✅ Load testing passing
- ✅ Bundle size monitored

---

## 🔒 Security Features

### Dependency Scanning
- npm audit (daily)
- Trivy filesystem scanning
- Outdated package detection

### Code Scanning
- ESLint security rules
- Secret detection
- SQL injection testing
- Hardcoded credential checks

### Continuous Monitoring
- Daily security scans
- Weekly performance tests
- License compliance tracking
- Automated dependency updates (Dependabot)

---

## 🚀 Deployment Process

### Staging Deployment (dev branch)

1. Code pushed to `dev` branch
2. All quality gates pass
3. Railway automatically deploys to staging
4. Health checks validate deployment
5. Smoke tests run
6. Deployment status reported

### Production Deployment (main branch)

1. Code merged to `main` branch
2. All quality gates pass
3. Railway automatically deploys to production
4. Health checks validate deployment
5. Smoke tests run
6. Release tag created (v{date}-{sha})
7. Deployment status reported

### Rollback Procedure

If deployment fails:
1. Health checks will fail
2. Pipeline will report failure
3. Railway allows instant rollback via dashboard
4. Or revert the commit and push to trigger redeploy

---

## 📈 Monitoring & Reports

### Artifacts

Each workflow run generates artifacts:
- Code quality reports (ESLint, complexity)
- Security reports (npm audit, Trivy)
- Test results (unit, integration, coverage)
- Performance reports (load testing, response times)

Artifacts are retained for 30 days.

### GitHub Security

Security findings are automatically uploaded to:
- GitHub Security tab (Trivy SARIF reports)
- PR comments (security summaries)
- Workflow summaries (detailed reports)

### Coverage Reports

Test coverage is:
- Generated on every PR
- Compared with base branch
- Commented on PR with diff
- Uploaded to Codecov (if configured)

---

## 🛠️ Maintenance

### Adding New Tests

1. Create test file in appropriate directory:
   - `tests/unit/` - Unit tests
   - `tests/integration/` - Integration tests
   - `tests/security/` - Security tests

2. Follow existing patterns
3. Ensure coverage doesn't decrease

### Updating Dependencies

Dependencies are automatically updated by Dependabot weekly. Review and approve PRs.

Manual update:
```bash
npm outdated
npm update
npm audit fix
```

### Modifying Workflows

1. Edit workflow files in `.github/workflows/`
2. Test locally if possible
3. Create PR and validate on k8s-runner
4. Merge after approval

---

## 🐛 Troubleshooting

### Workflow Fails on k8s-runner-qopy

```bash
# Check runner status
kubectl get pods -n github-runners

# Check runner logs
kubectl logs -n github-runners <runner-pod-name>

# Restart runner if needed
kubectl delete pod -n github-runners <runner-pod-name>
```

### Docker Services Fail ("Cannot connect to Docker daemon")

**Symptoms**: Jobs with PostgreSQL/Redis services fail with `Cannot connect to the Docker daemon` error.

**Solution**:
```bash
# Check if Docker is installed
docker --version

# Check if Docker daemon is running
sudo systemctl status docker

# Start Docker daemon if not running
sudo systemctl start docker

# Check if runner user has Docker permissions
groups $USER | grep docker

# If not in docker group, add and restart
sudo usermod -aG docker $USER
sudo systemctl restart actions.runner.*

# Verify Docker works without sudo
docker ps
```

**Alternative**: If Docker can't be enabled, skip database-dependent tests locally:
```bash
npm run test:unit  # Run unit tests only (no database required)
```

### ESLint Errors

```bash
# See what's wrong
npm run lint

# Auto-fix issues
npm run lint:fix

# If rules are too strict, adjust .eslintrc.js
```

### Coverage Below Threshold

```bash
# Run coverage locally
npm run test:coverage

# Open HTML report
open coverage/lcov-report/index.html

# Add tests to uncovered files
```

### Security Vulnerabilities

```bash
# Check vulnerabilities
npm audit

# Try auto-fix
npm audit fix

# If no fix available, evaluate risk and create issue
```

---

## 📚 Additional Resources

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [Prettier Documentation](https://prettier.io/docs/en/index.html)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Artillery Documentation](https://www.artillery.io/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## 🎓 Best Practices

1. **Always run `npm run ci` before pushing**
2. **Keep test coverage above 40%**
3. **Fix security vulnerabilities immediately**
4. **Use conventional commits** (feat:, fix:, etc.)
5. **Keep PRs small** (<50 files, <1000 lines)
6. **Review security scan results** weekly
7. **Monitor performance metrics** regularly
8. **Update dependencies** weekly via Dependabot

---

**Last Updated**: $(date +'%Y-%m-%d')
**Maintained by**: Qopy DevOps Team

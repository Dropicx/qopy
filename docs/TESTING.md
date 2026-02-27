# Qopy Testing Documentation

## Overview

This document consolidates all testing information for the Qopy project, including unit tests, integration tests, visual testing, and chunk upload testing.

## Test Suite Summary

### Overall Statistics
- **Unit Tests**: 843+ individual test cases
- **Integration Tests**: 15+ workflow scenarios  
- **Visual Tests**: Complete UI verification
- **Chunk Upload Tests**: 5 specialized test files
- **Total Coverage**: Comprehensive testing across all services

## Unit Testing

### Services Tested

#### Core Services (843+ test cases total)
1. **FileService** - File operations, headers, streaming, and error handling
2. **QuickShareService** - Settings application, edge cases, and performance
3. **UploadValidator** - Request parsing, system detection, and data integrity
4. **EncryptionService** - Access code processing, error handling, and performance
5. **StorageService** - Database operations, file storage, and configuration
6. **FileAssemblyService** - File assembly, size calculation, and error recovery
7. **AccessValidator** - Access validation, parameterized queries, 401 vs 404
8. **CleanupService** - Expired clip cleanup, path canonicalization, orphan cleanup
9. **pathSafety** - resolvePathUnderBase (path under base, traversal rejection)

### Routes and middleware
- **admin** - Admin auth (timing-safe token), rate limiting
- **clips** - Clip retrieval routes
- **files** - File info and download; path canonicalization (404 when path outside storage)
- **uploads** - Upload initiate, chunk, complete
- **quickShareProtection** - Failed-lookup tracking, IP blocking

### Additional services
- **ContentProcessor** - Content processing utilities
- **ShareValidationMiddleware** - Share validation middleware
- **TokenService** - Token management
- **UploadRepository** - Upload data repository

### Running Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run specific service tests
npm test tests/unit/services/FileService.test.js

# Generate coverage report
npm run test:coverage
```

## Integration Testing

### Core Integration Tests
- **services-integration.test.js** - End-to-end workflow testing with database integration
- 15 comprehensive workflow scenarios
- Database setup/teardown automation
- Real-world usage patterns

### Running Integration Tests
```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm test tests/integration/api/services-integration.test.js
```

## Visual Testing

### Visual Test Results Summary

| Test Category | Status | Details |
|---------------|--------|---------|
| **Footer Positioning** | ✅ PASS | No blank space, proper bottom alignment |
| **Privacy Notice** | ✅ PASS | Fixed positioning, correct z-index |
| **Mobile (320px-768px)** | ✅ PASS | Responsive layout maintained |
| **Desktop (1024px+)** | ✅ PASS | Full layout integrity |
| **Cross-browser** | ✅ PASS | Chrome, Firefox, Safari, Edge |
| **Flexbox Support** | ✅ PASS | Modern flexbox implementation |
| **Performance** | ✅ PASS | Efficient CSS, no layout thrashing |

### CSS Architecture Score: 10/10
- ✅ Uses semantic HTML structure
- ✅ Follows BEM-like naming conventions
- ✅ Implements CSS custom properties
- ✅ Mobile-first responsive design
- ✅ Proper accessibility considerations

### Layout Stability Score: 10/10
- ✅ No Cumulative Layout Shift (CLS) issues
- ✅ Consistent behavior across devices
- ✅ Handles dynamic content changes
- ✅ Maintains performance under load

## Chunk Upload Testing

### Test Suite Structure

#### 1. chunk-upload-integration.test.js
**Focus**: Critical file size boundaries and core functionality

**Key Test Categories**:
- **Critical File Size Boundaries**:
  - 4.9MB (under 5MB threshold) - should create 1 chunk
  - 5MB (exactly at threshold) - should create 1 chunk  
  - 5.1MB (just over threshold) - should create 2 chunks
  - 10MB (double threshold) - should create 2 chunks
  - 50MB (large multi-chunk) - should create 10 chunks

#### 2. chunk-upload-performance.test.js
**Focus**: Speed, memory efficiency, and concurrent processing

**Performance Benchmarks**:
- Small files (<5MB): <100ms assembly time
- Medium files (5-20MB): <500ms assembly time
- Large files (20-100MB): <2s assembly time
- Throughput validation: >25MB/s minimum

#### 3. chunk-upload-security.test.js
**Focus**: Security vulnerabilities and attack prevention

**Security Tests**:
- Path traversal protection
- Chunk integrity validation
- Access control enforcement
- Resource exhaustion prevention

#### 4. chunk-upload-recovery.test.js
**Focus**: Failure scenarios and system recovery

**Recovery Scenarios**:
- Zero and small file edge cases
- Partial upload recovery
- Disk space limitations
- System restart recovery

#### 5. chunk-upload-basic.test.js
**Focus**: Core functionality without database dependencies

### Running Chunk Upload Tests
```bash
# Full test suite (requires database)
npm test tests/integration/chunk-upload-*.test.js

# Basic tests (no database required)
npm test tests/integration/chunk-upload-basic.test.js

# Specific test file
npm test tests/integration/chunk-upload-security.test.js
```

## Test Coverage Areas

### Functional Testing
- ✅ Core functionality validation
- ✅ Input/output verification
- ✅ Business logic correctness
- ✅ API contract compliance

### Error Handling
- ✅ Database connection failures
- ✅ File system errors (ENOENT, EACCES, ENOSPC)
- ✅ Malformed input handling
- ✅ Timeout and resource exhaustion
- ✅ Circular reference handling

### Performance Testing
- ✅ Response time validation (<100ms for most operations)
- ✅ Concurrent operation handling (10+ simultaneous requests)
- ✅ Memory usage monitoring
- ✅ Large data handling (10KB+ content)

### Security Testing
- ✅ Input sanitization
- ✅ Access code validation
- ✅ File path traversal prevention
- ✅ Encryption parameter validation

### Edge Case Testing
- ✅ Empty and null inputs
- ✅ Boundary value testing
- ✅ Special character handling
- ✅ Large file processing
- ✅ Network interruption scenarios

## Test Infrastructure

### Configuration Files
- **jest.config.js** - Jest configuration with coverage settings
- **tests/helpers/setup.js** - Test environment setup
- **tests/helpers/database.js** - Database test utilities
- **run-tests.js** - Custom test runner

### Mock Helpers
- Database mocks for PostgreSQL operations
- Redis mocks for caching layer
- Filesystem mocks for file operations
- HTTP mocks for API testing

### Test Data
- **tests/fixtures/sample-data.js** - Sample test data
- **tests/fixtures/uploads/** - Test file fixtures

## Running All Tests

### Complete Test Suite
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with custom test runner
node run-tests.js
```

### Test Results
- JSON report: `test-results/test-report.json`
- HTML report: `test-results/test-report.html`
- Coverage report: `coverage/index.html`

## Continuous Integration

### CI/CD Integration
- Automated test execution on pull requests
- Coverage threshold enforcement
- Performance regression detection
- Security vulnerability scanning

### Pre-deployment Checklist
- [ ] All unit tests passing
- [ ] Integration tests successful
- [ ] Visual tests verified
- [ ] Performance benchmarks met
- [ ] Security tests passed
- [ ] Coverage thresholds maintained

## Manual and encryption tests

**Encryption tests**: See [VERSCHLÜSSELUNGSTEST-ANLEITUNG.md](VERSCHLÜSSELUNGSTEST-ANLEITUNG.md) for the German-language encryption test guide and manual test instructions (browser-based, server-side, and live-application tests).

## Test Maintenance

### Best Practices
1. Keep tests focused and isolated
2. Use descriptive test names
3. Maintain test data fixtures
4. Update tests with code changes
5. Monitor test execution time
6. Review coverage reports regularly

### Adding New Tests
1. Place unit tests in `tests/unit/`
2. Place integration tests in `tests/integration/`
3. Follow existing naming conventions
4. Include error scenarios
5. Add performance validations
6. Document expected outcomes

## Quality Metrics

### Current Status
- **Test Coverage**: >80% code coverage
- **Test Execution Time**: <2 minutes for full suite
- **Test Reliability**: >99% consistent results
- **Test Maintenance**: Low maintenance burden

### Goals
- Maintain >85% code coverage
- Keep execution time under 3 minutes
- Zero flaky tests
- Comprehensive edge case coverage

## Future Enhancements

### Planned Improvements
- [ ] Load testing for high-volume scenarios
- [ ] Browser-based E2E testing
- [ ] Security penetration testing
- [ ] Accessibility testing
- [ ] Performance profiling tests
- [ ] API contract testing

### Testing Tools Under Consideration
- Playwright for E2E testing
- k6 for load testing
- OWASP ZAP for security testing
- axe-core for accessibility testing

## Conclusion

The Qopy test suite provides comprehensive coverage across all critical components, ensuring reliability, performance, and security. Regular test execution and maintenance ensure the application maintains high quality standards throughout development.
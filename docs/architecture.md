# Qopy Architecture Documentation

## Overview

Qopy is a privacy-first, secure temporary text and file sharing application with enterprise-grade client-side encryption. This document outlines the architectural evolution from monolithic structure to service-oriented design for improved maintainability, testability, and scalability.

## Current Architecture (Monolithic)

The application currently operates as a monolithic Express.js server with all business logic contained within `server.js`. While functional, this approach presents challenges for long-term maintenance and testing.

### Current Structure
```
qopy/
├── server.js              # Main application (2,700+ lines)
├── public/                # Client-side assets
│   ├── file-upload.js     # File upload client logic
│   └── script.js          # Main client application
├── config/                # Configuration files
└── database schemas       # PostgreSQL setup
```

## Planned Service-Oriented Architecture

To address maintainability concerns and improve code organization, we are transitioning to a service-oriented architecture that separates concerns and follows SOLID principles.

### Architectural Principles

#### Single Responsibility Principle
Each service handles one specific domain of functionality:
- **Upload Service**: File upload orchestration and chunk management
- **Share Service**: Content sharing and access code management  
- **File Service**: File retrieval and content delivery
- **Security Service**: Encryption validation and access control
- **Database Service**: Data persistence and query optimization

#### Separation of Concerns
- **Route Handlers**: HTTP request/response handling only
- **Business Logic**: Encapsulated within dedicated services
- **Data Access**: Abstracted through repository patterns
- **Validation**: Centralized input validation and sanitization

#### Dependency Injection
Services are designed to be injectable and testable, allowing for:
- Unit testing with mock dependencies
- Flexible configuration management
- Runtime service swapping for different environments

### Proposed Service Structure

```
qopy/
├── server.js              # Express app configuration and routing
├── services/              # Business logic services
│   ├── UploadService.js   # File upload orchestration
│   ├── ShareService.js    # Content sharing management
│   ├── FileService.js     # File retrieval and delivery
│   ├── SecurityService.js # Access control and validation
│   └── DatabaseService.js # Data persistence layer
├── routes/                # HTTP route definitions
│   ├── upload.js          # Upload-related endpoints
│   ├── share.js           # Sharing endpoints
│   └── file.js            # File retrieval endpoints
├── middleware/            # Express middleware
│   ├── auth.js            # Authentication middleware
│   ├── validation.js      # Input validation
│   └── security.js        # Security headers and CORS
└── models/                # Data models and schemas
    ├── Clip.js            # Clip data model
    └── Upload.js          # Upload session model
```

## Service Responsibilities

### UploadService
**Purpose**: Orchestrate multi-part file uploads with security and reliability

**Key Responsibilities**:
- Initialize upload sessions with security validation
- Manage chunk upload and verification
- Coordinate file assembly and integrity checking
- Handle upload completion and cleanup
- Provide resume capability for interrupted uploads

**Benefits of Extraction**:
- Testable upload logic independent of HTTP layer
- Reusable across different transport mechanisms
- Simplified error handling and recovery
- Better monitoring and performance tracking

### ShareService  
**Purpose**: Manage content sharing lifecycle and access control

**Key Responsibilities**:
- Create encrypted content entries
- Generate access codes and URL secrets
- Manage expiration policies and cleanup
- Handle quick share vs enhanced security modes
- Coordinate with security service for access validation

**Benefits of Extraction**:
- Clear separation of sharing business rules
- Testable expiration and cleanup logic
- Configurable sharing policies
- Improved audit logging capabilities

### FileService
**Purpose**: Handle file retrieval and content delivery

**Key Responsibilities**:
- Validate file access permissions
- Stream file content efficiently
- Handle range requests for large files
- Manage content-type detection and headers
- Coordinate with security service for access validation

**Benefits of Extraction**:
- Optimized file delivery performance
- Testable access control logic
- Simplified caching strategies
- Better error handling for file operations

## Migration Strategy

### Phase 1: Service Extraction
1. **Extract UploadService** from the 305-line upload completion handler
2. **Extract ShareService** from the 245-line share creation handler  
3. **Extract FileService** from the 195-line file retrieval handler

### Phase 2: Route Refactoring
1. Create dedicated route files for each domain
2. Implement dependency injection for services
3. Add comprehensive validation middleware

### Phase 3: Testing & Validation
1. Add unit tests for each service
2. Integration tests for service interactions
3. Performance validation to ensure no regressions

## Long-Term Benefits

### Maintainability
- **Focused Code**: Each service has a single, clear purpose
- **Easier Debugging**: Issues can be isolated to specific services
- **Simplified Updates**: Changes affect only relevant services
- **Code Reuse**: Services can be shared across different endpoints

### Testability
- **Unit Testing**: Each service can be tested in isolation
- **Mock Dependencies**: Easy to mock external dependencies
- **Integration Testing**: Clear service boundaries enable focused integration tests
- **Test Coverage**: Improved ability to achieve comprehensive test coverage

### Scalability
- **Performance Optimization**: Services can be optimized independently
- **Resource Management**: Better control over resource usage per service
- **Monitoring**: Service-level metrics and monitoring
- **Load Balancing**: Future potential for service-specific scaling

### Developer Experience
- **Onboarding**: New developers can understand services independently
- **Collaboration**: Teams can work on different services simultaneously
- **Code Reviews**: Smaller, focused changes are easier to review
- **Documentation**: Service-level documentation is more manageable

## Security Considerations

The service-oriented architecture maintains Qopy's security-first approach:

- **Zero-Knowledge Principle**: Services never handle plaintext content
- **Encryption Validation**: Security service validates all encryption parameters
- **Access Control**: Centralized access validation across all services  
- **Audit Logging**: Service-level logging for security monitoring
- **Defense in Depth**: Multiple validation layers across service boundaries

## Performance Implications

The architectural changes are designed to maintain or improve performance:

- **Reduced Memory Usage**: Services can optimize memory usage independently
- **Better Caching**: Service-level caching strategies
- **Async Operations**: Improved handling of asynchronous operations
- **Resource Pooling**: More efficient database connection management
- **Monitoring**: Service-level performance metrics

## Future Considerations

This architecture provides a foundation for future enhancements:

- **Microservices**: Services could be extracted to separate processes
- **Event-Driven Architecture**: Services could communicate via events
- **API Versioning**: Service-level API versioning support
- **Multi-Tenancy**: Service-level tenant isolation
- **Cloud Native**: Services designed for containerization and orchestration

---

*This architecture represents a significant improvement in code organization while maintaining Qopy's core security and privacy principles. The migration will be conducted in phases to ensure system stability and performance.*
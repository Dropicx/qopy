# Qopy Architecture Documentation

## Overview

Qopy is a privacy-first, secure temporary text and file sharing application with enterprise-grade client-side encryption. This document describes the current application structure and points to the root [CLAUDE.md](../CLAUDE.md) for an up-to-date component list and commands.

## Current architecture

The application uses an Express.js server (~840 lines) for app setup, middleware, storage initialization, and route registration. Business logic lives in **routes/** and **services/**; server.js wires dependencies and does not contain large inline handlers.

### Current structure

```
qopy/
├── server.js              # App setup, middleware, route registration, cleanup
├── routes/                # HTTP route definitions
│   ├── health.js          # Health check endpoints
│   ├── static.js          # Static asset routes
│   ├── admin.js           # Admin dashboard and auth
│   ├── clips.js           # Clip retrieval
│   ├── files.js           # File info and download
│   ├── uploads.js         # Upload initiate, chunk, complete
│   └── shared/            # Shared validators (e.g. clipIdValidator)
├── middleware/            # Express middleware
│   ├── accessValidation.js
│   └── quickShareProtection.js
├── services/              # Business logic services
│   ├── FileService.js
│   ├── CleanupService.js
│   ├── AccessValidator.js
│   ├── UploadValidator.js
│   ├── FileAssemblyService.js
│   ├── UploadCompletionService.js
│   ├── UploadRepository.js
│   ├── TokenService.js
│   ├── EncryptionService.js
│   ├── pathSafety (utils)  # resolvePathUnderBase, etc.
│   └── ...                # See CLAUDE.md for full list
├── migrations/            # Database migrations (run on startup)
├── public/                # Client-side assets
│   ├── file-upload.js
│   └── script.js
└── config/                # Configuration (e.g. Redis)
```

For the full list of services, route modules, and common commands, see [CLAUDE.md](../CLAUDE.md).

## Future direction (further extraction)

Additional service extraction and route refactoring may continue (e.g. more logic moved out of server.js into named services). The principles below still guide that work.

### Architectural principles

#### Single Responsibility Principle
Each service handles one specific domain (upload orchestration, access validation, file delivery, etc.).

#### Separation of concerns
- **Route handlers**: HTTP request/response handling; delegate to services.
- **Business logic**: In `services/` with dependency injection.
- **Validation**: Centralized (e.g. express-validator, shared validators).

#### Dependency injection
Services are constructor-injected (pool, storagePath, etc.) for testability.

For detailed service responsibilities and test coverage per service, see [CLAUDE.md](../CLAUDE.md).

## Security considerations

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

For an up-to-date component list and commands, see [CLAUDE.md](../CLAUDE.md).
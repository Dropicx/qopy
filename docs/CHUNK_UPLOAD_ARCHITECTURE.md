# Chunk Upload Architecture

## Overview

The Qopy file upload system uses client-side encryption and chunking to securely handle large files up to 100MB. This document explains the architecture and reasoning behind the chunk upload implementation.

## Core Concepts

### Why Chunking?

1. **Memory Efficiency**: Processing 100MB files in browser memory is challenging
2. **Network Reliability**: Smaller chunks can be retried individually on failure
3. **Progress Tracking**: Users can see upload progress chunk by chunk
4. **Server Limits**: Most servers have request size limits (typically 10-50MB)

### Chunk Size Decision

We use **5MB chunks** as the optimal balance between:
- **Network efficiency**: Fewer requests for large files
- **Memory usage**: Manageable buffer size in browsers
- **Retry cost**: Failed chunks don't waste too much bandwidth
- **Progress granularity**: Reasonable update frequency for users

## Architecture Flow

```
1. Client: File Selection
   ↓
2. Client: Encryption (entire file)
   ↓
3. Client: Add IV (12 bytes) to encrypted data
   ↓
4. Client: Split into 5MB chunks
   ↓
5. Server: Receive chunks (multer with 6MB limit)
   ↓
6. Server: Store chunks temporarily
   ↓
7. Server: Assemble complete file
   ↓
8. Server: Store encrypted file
```

## Critical Implementation Details

### Encryption Overhead

Each encrypted file includes:
- **IV (Initialization Vector)**: 12 bytes prepended to data
- **GCM Auth Tag**: 16 bytes (part of encrypted data)
- **Metadata**: Variable size (~200 bytes) encrypted within

### The 5MB Boundary Issue (Fixed)

**Problem**: When chunk size equals multer's fileSize limit (both 5MB), chunks at exactly 5MB fail.

**Root Cause**: Multer's limit is exclusive - a 5MB chunk is rejected when limit is 5MB.

**Solution**: Set multer limit to 6MB for 5MB chunks, providing 1MB buffer for:
- Multipart form data overhead
- HTTP headers
- Encryption overhead (IV + auth tag)

### Server Configuration

```javascript
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const multerConfig = {
    limits: {
        fileSize: CHUNK_SIZE + (1024 * 1024) // 6MB limit for 5MB chunks
    }
};
```

## Security Considerations

1. **Client-Side Encryption**: All files encrypted before chunking
2. **Chunk Validation**: Each chunk verified against expected index
3. **Assembly Verification**: Final file size validated after assembly
4. **Temporary Storage**: Chunks deleted after successful assembly

## Performance Characteristics

### Memory Usage
- **Client**: ~3x file size during encryption (original + encrypted + chunk)
- **Server**: 2x chunk size during assembly (chunk + buffer)

### Network Efficiency
- **Chunk Count**: 100MB file = 20 chunks
- **Overhead**: ~1% for multipart encoding
- **Retry Cost**: Max 5MB per failed chunk

## Future Improvements

1. **Streaming Encryption**: Process file in chunks to reduce memory usage
2. **Progressive Assembly**: Assemble file as chunks arrive
3. **Resume Capability**: Allow resuming failed uploads from last chunk
4. **Dynamic Chunk Size**: Adjust based on network conditions

## Monitoring and Debugging

Key metrics to track:
- **Chunk success rate**: Should be >99%
- **Assembly time**: Linear with file size
- **Memory spikes**: During encryption and assembly
- **Error patterns**: Timeout vs size limit vs network

Common issues:
- **500 errors on chunks**: Usually multer size limit
- **Memory errors**: Files too large for browser
- **Timeout errors**: Slow networks need larger timeout
- **Assembly failures**: Missing or corrupted chunks

See also: [PERFORMANCE.md](PERFORMANCE.md), [DEPLOYMENT.md](DEPLOYMENT.md).
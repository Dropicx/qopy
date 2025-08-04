-- Database Index Validation Script
-- Verify that all critical indexes are present and functioning
-- Run after deploying performance indexes

-- =====================================================
-- INDEX EXISTENCE VALIDATION
-- =====================================================

-- Check for all critical indexes
SELECT 
    'INDEX VALIDATION' as check_type,
    CASE 
        WHEN COUNT(*) >= 9 THEN '✅ PASSED'
        ELSE '❌ FAILED - Missing indexes'
    END as status,
    COUNT(*) as indexes_found,
    9 as indexes_expected
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
    'idx_clips_clip_id_active',
    'idx_clips_expiration_cleanup', 
    'idx_clips_content_access',
    'idx_upload_sessions_upload_id_fast',
    'idx_upload_sessions_cleanup_fast',
    'idx_upload_sessions_status_check',
    'idx_file_chunks_assembly',
    'idx_file_chunks_existence',
    'idx_statistics_primary'
);

-- =====================================================
-- DETAILED INDEX INVENTORY
-- =====================================================

-- List all indexes on critical tables
SELECT 
    'clips' as table_name,
    indexname as index_name,
    indexdef as definition
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'clips'
AND indexname LIKE 'idx_%'
ORDER BY indexname

UNION ALL

SELECT 
    'upload_sessions' as table_name,
    indexname as index_name,
    indexdef as definition
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'upload_sessions'
AND indexname LIKE 'idx_%'
ORDER BY indexname

UNION ALL

SELECT 
    'file_chunks' as table_name,
    indexname as index_name,
    indexdef as definition
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'file_chunks'
AND indexname LIKE 'idx_%'
ORDER BY indexname;

-- =====================================================
-- PERFORMANCE TEST QUERIES
-- =====================================================

-- Test 1: Clip lookup performance (should use idx_clips_clip_id_active)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM clips 
WHERE clip_id = 'test-clip-123' AND is_expired = false;

-- Test 2: Expiration cleanup performance (should use idx_clips_expiration_cleanup)
EXPLAIN (ANALYZE, BUFFERS)
SELECT clip_id, file_path FROM clips 
WHERE expiration_time < EXTRACT(EPOCH FROM NOW()) * 1000 
AND is_expired = false 
AND file_path IS NOT NULL;

-- Test 3: Upload session lookup (should use idx_upload_sessions_upload_id_fast)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM upload_sessions 
WHERE upload_id = 'test-upload-123';

-- Test 4: File chunk assembly (should use idx_file_chunks_assembly)
EXPLAIN (ANALYZE, BUFFERS)
SELECT chunk_number, storage_path, chunk_size 
FROM file_chunks 
WHERE upload_id = 'test-upload-123' 
ORDER BY chunk_number;

-- =====================================================
-- INDEX SIZE ANALYSIS
-- =====================================================

-- Check index sizes and efficiency
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 10 THEN 'LOW_USAGE'
        WHEN idx_scan < 100 THEN 'MODERATE_USAGE'
        ELSE 'HIGH_USAGE'
    END as usage_level
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
AND tablename IN ('clips', 'upload_sessions', 'file_chunks', 'statistics')
AND indexrelname LIKE 'idx_%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================
-- QUERY PLANNER STATISTICS
-- =====================================================

-- Check if table statistics are up to date
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    last_analyze,
    last_autoanalyze,
    CASE 
        WHEN last_analyze > NOW() - INTERVAL '7 days' 
          OR last_autoanalyze > NOW() - INTERVAL '7 days' 
        THEN '✅ RECENT'
        ELSE '⚠️ STALE - Run ANALYZE'
    END as stats_status
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
AND tablename IN ('clips', 'upload_sessions', 'file_chunks', 'statistics')
ORDER BY tablename;

-- =====================================================
-- VALIDATION SUMMARY
-- =====================================================

-- Final validation report
WITH index_count AS (
    SELECT COUNT(*) as critical_indexes
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname IN (
        'idx_clips_clip_id_active',
        'idx_clips_expiration_cleanup', 
        'idx_clips_content_access',
        'idx_upload_sessions_upload_id_fast',
        'idx_upload_sessions_cleanup_fast',
        'idx_upload_sessions_status_check',
        'idx_file_chunks_assembly',
        'idx_file_chunks_existence',
        'idx_statistics_primary'
    )
),
total_indexes AS (
    SELECT COUNT(*) as all_indexes
    FROM pg_indexes 
    WHERE schemaname = 'public'
    AND tablename IN ('clips', 'upload_sessions', 'file_chunks', 'statistics')
    AND indexname LIKE 'idx_%'
)
SELECT 
    '🔍 DATABASE INDEX VALIDATION SUMMARY' as report_title,
    i.critical_indexes || '/9 critical indexes present' as critical_status,
    t.all_indexes || ' total performance indexes' as total_status,
    CASE 
        WHEN i.critical_indexes = 9 THEN '✅ VALIDATION PASSED'
        ELSE '❌ VALIDATION FAILED'
    END as overall_status
FROM index_count i, total_indexes t;

-- Completion message
\echo '================================='
\echo 'Database Index Validation Complete'
\echo '================================='
\echo 'Review the results above to ensure all indexes are properly deployed and functioning.'
\echo 'If validation failed, re-run the appropriate deployment script.'
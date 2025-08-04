/**
 * Memory Leak Test for Redis Event Listeners
 * Tests the RedisManager to ensure event listeners are properly cleaned up
 */

const redisManager = require('../config/redis');

// Track memory usage and event listener counts
let initialMemory = process.memoryUsage();
let connectionCycles = 0;
const MAX_CYCLES = 10;

console.log('🧪 Starting Redis memory leak test...');
console.log('📊 Initial memory usage:', formatMemory(initialMemory));

/**
 * Simulate multiple connect/disconnect cycles to test for memory leaks
 */
async function runMemoryLeakTest() {
    console.log(`\n🔄 Running ${MAX_CYCLES} connect/disconnect cycles...`);
    
    for (let i = 0; i < MAX_CYCLES; i++) {
        connectionCycles++;
        console.log(`\n--- Cycle ${connectionCycles}/${MAX_CYCLES} ---`);
        
        try {
            // Connect to Redis
            console.log('🔗 Connecting to Redis...');
            await redisManager.connect();
            
            // Check connection status
            if (redisManager.isConnected()) {
                console.log('✅ Redis connected successfully');
                
                // Perform some operations
                await redisManager.set('test-key', { cycle: connectionCycles, timestamp: Date.now() }, 10);
                const value = await redisManager.get('test-key');
                console.log('📦 Test operation result:', value ? 'Success' : 'Failed');
                
                // Check event listeners count
                const listenerCount = redisManager.eventListeners.size;
                console.log(`🎧 Event listeners count: ${listenerCount}`);
                
                if (listenerCount > 4) { // We expect 4: error, connect, ready, end
                    console.warn('⚠️ Unexpected number of event listeners detected!');
                }
            } else {
                console.warn('⚠️ Redis connection failed');
            }
            
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Disconnect
            console.log('💔 Disconnecting from Redis...');
            await redisManager.disconnect();
            
            // Check that listeners were cleaned up
            const postDisconnectListeners = redisManager.eventListeners.size;
            console.log(`🧹 Event listeners after cleanup: ${postDisconnectListeners}`);
            
            if (postDisconnectListeners > 0) {
                console.error('❌ Memory leak detected: Event listeners not cleaned up!');
                return false;
            }
            
            console.log('✅ Cleanup successful');
            
        } catch (error) {
            console.error('❌ Error in cycle:', error.message);
        }
        
        // Check memory usage periodically
        if (i % 3 === 0) {
            const currentMemory = process.memoryUsage();
            console.log('📊 Current memory usage:', formatMemory(currentMemory));
            console.log('📈 Memory delta:', formatMemoryDelta(initialMemory, currentMemory));
        }
        
        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return true;
}

/**
 * Format memory usage for display
 */
function formatMemory(memory) {
    return {
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memory.external / 1024 / 1024)}MB`
    };
}

/**
 * Calculate memory delta
 */
function formatMemoryDelta(initial, current) {
    return {
        rss: `${Math.round((current.rss - initial.rss) / 1024 / 1024)}MB`,
        heapUsed: `${Math.round((current.heapUsed - initial.heapUsed) / 1024 / 1024)}MB`,
        heapTotal: `${Math.round((current.heapTotal - initial.heapTotal) / 1024 / 1024)}MB`,
        external: `${Math.round((current.external - initial.external) / 1024 / 1024)}MB`
    };
}

/**
 * Test graceful shutdown handling
 */
function testGracefulShutdown() {
    console.log('\n🛑 Testing graceful shutdown...');
    
    // Simulate different shutdown signals
    const signals = ['SIGINT', 'SIGTERM'];
    
    signals.forEach((signal, index) => {
        setTimeout(() => {
            console.log(`📡 Simulating ${signal} signal...`);
            process.emit(signal);
        }, 2000 + (index * 1000));
    });
}

/**
 * Main test execution
 */
async function main() {
    try {
        const success = await runMemoryLeakTest();
        
        const finalMemory = process.memoryUsage();
        console.log('\n📊 Final memory usage:', formatMemory(finalMemory));
        console.log('📈 Total memory delta:', formatMemoryDelta(initialMemory, finalMemory));
        
        if (success) {
            console.log('\n✅ Memory leak test PASSED - No event listener leaks detected!');
            console.log('🎉 Redis manager properly cleans up all event listeners');
        } else {
            console.log('\n❌ Memory leak test FAILED - Event listeners not properly cleaned up');
            process.exit(1);
        }
        
        // Test graceful shutdown (comment out for automated testing)
        // testGracefulShutdown();
        
    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
        process.exit(1);
    }
}

// Handle process termination gracefully during testing
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted - cleaning up...');
    process.exit(0);
});

// Run the test if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = {
    runMemoryLeakTest,
    formatMemory,
    formatMemoryDelta
};
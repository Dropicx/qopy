let isAuthenticated = false;
let adminToken = '';

// Login functionality
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/admin/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            isAuthenticated = true;
            adminToken = password; // Store the token for API calls
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboard').classList.add('active');
            loadDashboard();
        } else {
            const error = await response.json();
            alert(`❌ ${error.message || 'Invalid password!'}`);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('❌ Login failed. Please try again.');
    }
});

// Logout functionality
function logout() {
    isAuthenticated = false;
    adminToken = ''; // Clear the admin token
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('password').value = '';
}

// Check authentication status
function checkAuth() {
    if (!isAuthenticated || !adminToken) {
        logout();
        return false;
    }
    return true;
}

// Load dashboard data
async function loadDashboard(showLoading = true) {
    if (!checkAuth()) return;

    const refreshBtn = document.getElementById('refreshBtn');

    try {
        if (showLoading) {
            // Show loading state
            if (refreshBtn) {
                refreshBtn.textContent = '🔄 Refreshing...';
                refreshBtn.disabled = true;
            }

            // Show loading indicators
            document.getElementById('systemInfo').innerHTML = '<div class="loading">Refreshing system info...</div>';
        }

        // Load all data in parallel for better performance
        const [statsResult, systemResult] = await Promise.allSettled([
            loadStatistics(),
            loadSystemInfo()
        ]);

        // Handle individual failures
        if (statsResult.status === 'rejected') {
            console.error('Statistics failed:', statsResult.reason);
            showError('Failed to load statistics');
        }

        if (systemResult.status === 'rejected') {
            console.error('System info failed:', systemResult.reason);
            showError('Failed to load system info');
        }

        // Update timestamp
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${new Date().toLocaleString()}`;

        // Show success message if manual refresh
        if (showLoading) {
            showSuccess('Dashboard refreshed successfully');
        }

    } catch (error) {
        console.error('Dashboard load error:', error);
        showError('Failed to load dashboard data');
    } finally {
        // Reset refresh button
        if (refreshBtn) {
            refreshBtn.textContent = '🔄 Refresh Data';
            refreshBtn.disabled = false;
        }
    }
}

// Load statistics
async function loadStatistics() {
    if (!checkAuth()) return;

    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        if (response.status === 401) {
            logout();
            throw new Error('Authentication expired. Please login again.');
        }
        if (!response.ok) {
            throw new Error(`Stats API failed: ${response.status} ${response.statusText}`);
        }

        const stats = await response.json();

        // Update statistics with proper error handling
        const elements = {
            'totalClips': stats.totalClips || 0,
            'activeClips': stats.activeClips || 0,
            'totalAccesses': stats.totalAccesses || 0,
            'passwordClips': stats.passwordClips || 0,
            'passwordPercentage': `${stats.passwordPercentage || 0}% of total`,
            'quickShareClips': stats.quickShareClips || 0,
            'quickSharePercentage': `${stats.quickSharePercentage || 0}% of total`,
            'oneTimeClips': stats.oneTimeClips || 0,
            'normalClips': stats.normalClips || 0
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        console.log('✅ Statistics loaded successfully');

    } catch (error) {
        console.error('❌ Statistics error:', error);
        // Set fallback values
        const fallbackIds = ['totalClips', 'activeClips', 'totalAccesses', 'passwordClips', 'passwordPercentage', 'quickShareClips', 'quickSharePercentage', 'oneTimeClips', 'normalClips'];
        fallbackIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '?';
            }
        });
        throw error; // Re-throw for Promise.allSettled handling
    }
}

// Load system info
async function loadSystemInfo() {
    if (!checkAuth()) return;

    try {
        const response = await fetch('/api/admin/system', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        if (response.status === 401) {
            logout();
            throw new Error('Authentication expired. Please login again.');
        }
        if (!response.ok) {
            throw new Error(`System API failed: ${response.status} ${response.statusText}`);
        }

        const system = await response.json();
        const container = document.getElementById('systemInfo');

        if (!container) {
            throw new Error('System info container not found');
        }

        // Sanitize system data
        const sanitizeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text || 'Unknown';
            return div.innerHTML;
        };

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div>
                    <strong>Server Status:</strong>
                    <span style="color: #00b894;">🟢 Online</span>
                </div>
                <div>
                    <strong>Version:</strong> ${sanitizeHtml(system.version)}
                </div>
                <div>
                    <strong>Environment:</strong> ${sanitizeHtml(system.environment)}
                </div>
                <div>
                    <strong>Database:</strong>
                    <span style="color: #00b894;">🟢 Connected</span>
                </div>
                <div>
                    <strong>Last Cleanup:</strong> ${sanitizeHtml(system.lastCleanup)}
                </div>
            </div>
        `;

        console.log('✅ System info loaded successfully');

    } catch (error) {
        console.error('❌ System info error:', error);
        const container = document.getElementById('systemInfo');
        if (container) {
            container.innerHTML = '<div class="error">Failed to load system information</div>';
        }
        throw error; // Re-throw for Promise.allSettled handling
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    const span = document.createElement('span');
    span.textContent = `❌ ${message}`;
    errorDiv.appendChild(span);

    const container = document.querySelector('.container');
    const statsGrid = document.querySelector('.stats-grid');

    if (container && statsGrid) {
        container.insertBefore(errorDiv, statsGrid);

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
}

// Show success message
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    const span = document.createElement('span');
    span.textContent = `✅ ${message}`;
    successDiv.appendChild(span);

    const container = document.querySelector('.container');
    const statsGrid = document.querySelector('.stats-grid');

    if (container && statsGrid) {
        container.insertBefore(successDiv, statsGrid);

        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 3000);
    }
}

// Bind button event listeners
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('refreshBtn').addEventListener('click', function() {
    loadDashboard();
});

// Auto-refresh every 30 seconds (silent refresh)
setInterval(() => {
    if (isAuthenticated) {
        loadDashboard(false); // Silent refresh without loading states
    }
}, 30000);

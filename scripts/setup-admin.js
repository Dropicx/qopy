#!/usr/bin/env node

/**
 * Admin Dashboard Setup Script
 * Hilft bei der Einrichtung des Admin-Dashboards für Railway.app
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🎛️ Qopy Admin Dashboard Setup');
console.log('================================\n');

// Funktionen
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function checkRequiredFiles() {
  const requiredFiles = [
    'public/admin.html',
    'server.js',
    'package.json'
  ];
  
  const missingFiles = requiredFiles.filter(file => {
    const filePath = path.join(__dirname, '..', file);
    return !fs.existsSync(filePath);
  });
  
  if (missingFiles.length > 0) {
    console.error('❌ Missing required files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    console.error('\nPlease ensure all files are present before running setup.');
    process.exit(1);
  }
  
  console.log('✅ All required files found');
}

function generateEnvTemplate() {
  const adminToken = generateSecureToken();
  
  const envContent = `# Qopy Admin Dashboard Configuration
# Copy these to your Railway.app environment variables

ADMIN_TOKEN=${adminToken}
SPAM_FILTER_ENABLED=true
SPAM_SCORE_THRESHOLD=50
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=900000
NODE_ENV=production

# Optional: Additional configuration
MAX_CONTENT_LENGTH=100000
LOG_SUSPICIOUS_CONTENT=true
`;

  const envFile = path.join(__dirname, '..', '.env.example');
  fs.writeFileSync(envFile, envContent);
  
  console.log('📝 Generated .env.example with secure admin token');
  console.log(`🔑 Your admin token: ${adminToken}`);
  console.log('⚠️  Keep this token secure and add it to Railway environment variables!');
  
  return adminToken;
}

function createAdminGuide(adminToken) {
  const guideContent = `# Qopy Admin Dashboard - Quick Start

## 🚀 Setup Steps

### 1. Railway Environment Variables
Add these to your Railway project environment variables:

\`\`\`
ADMIN_TOKEN=${adminToken}
SPAM_FILTER_ENABLED=true
SPAM_SCORE_THRESHOLD=50
RATE_LIMIT_MAX_REQUESTS=20
NODE_ENV=production
\`\`\`

### 2. Access Dashboard
After deployment, visit:
\`\`\`
https://your-app-name.railway.app/admin
\`\`\`

### 3. Login
Use the admin token above to login to the dashboard.

## 📊 Features Available

- ✅ Real-time statistics
- ✅ IP blacklist management  
- ✅ System logs viewer
- ✅ Spam detection stats
- ✅ Mobile-responsive design

## 🔧 Commands

\`\`\`bash
# Update spam IP lists
npm run update-spam-ips

# Check server health
curl https://your-app.railway.app/api/health
\`\`\`

## 📚 Documentation

See README.Railway-Admin.md for detailed documentation.

---
Generated on: ${new Date().toISOString()}
`;

  const guideFile = path.join(__dirname, '..', 'ADMIN-QUICKSTART.md');
  fs.writeFileSync(guideFile, guideContent);
  
  console.log('📚 Created ADMIN-QUICKSTART.md guide');
}

function showNextSteps(adminToken) {
  console.log('\n🎯 Next Steps:');
  console.log('=============');
  console.log('1. Deploy your app to Railway');
  console.log('2. Add environment variables (see .env.example)');
  console.log('3. Visit https://your-app.railway.app/admin');
  console.log(`4. Login with token: ${adminToken}`);
  console.log('\n📋 Important Files Created:');
  console.log('- .env.example (environment variables template)');
  console.log('- ADMIN-QUICKSTART.md (quick start guide)');
  console.log('\n🔐 Security Reminder:');
  console.log('- Keep your admin token secure');
  console.log('- Only share with trusted administrators');
  console.log('- Use HTTPS in production (Railway provides this)');
  console.log('\n📚 For detailed info, see README.Railway-Admin.md');
}

function testAdminEndpoints() {
  console.log('\n🧪 Testing Admin Setup...');
  
  // Test if admin endpoints are properly defined
  try {
    const serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    
    const requiredEndpoints = [
      'requireAdminAuth',
      '/api/admin/blacklist',
      '/api/admin/logs',
      'logMessage'
    ];
    
    const missingEndpoints = requiredEndpoints.filter(endpoint => 
      !serverContent.includes(endpoint)
    );
    
    if (missingEndpoints.length > 0) {
      console.warn('⚠️  Some admin features may be missing:');
      missingEndpoints.forEach(endpoint => 
        console.warn(`   - ${endpoint}`)
      );
    } else {
      console.log('✅ All admin endpoints properly configured');
    }
    
  } catch (error) {
    console.error('❌ Error testing configuration:', error.message);
  }
}

function displayDashboardPreview() {
  console.log('\n🎨 Dashboard Features Preview:');
  console.log('=============================');
  console.log('📊 Statistics Dashboard');
  console.log('   - Active clips count');
  console.log('   - Blocked IPs count');
  console.log('   - Spam blocked count');
  console.log('   - Server uptime');
  console.log('');
  console.log('🚫 IP Management');
  console.log('   - Add/remove IPs from blacklist');
  console.log('   - View all blocked IPs');
  console.log('   - Automatic spam-based blocking');
  console.log('');
  console.log('📋 System Logs');
  console.log('   - Real-time log viewer');
  console.log('   - Filter by log level');
  console.log('   - Railway integration');
  console.log('');
  console.log('📈 Spam Statistics');
  console.log('   - Detection rates');
  console.log('   - Blocking statistics');
  console.log('   - Configuration overview');
}

// Hauptausführung
function main() {
  try {
    checkRequiredFiles();
    const adminToken = generateEnvTemplate();
    createAdminGuide(adminToken);
    testAdminEndpoints();
    displayDashboardPreview();
    showNextSteps(adminToken);
    
    console.log('\n✅ Admin Dashboard setup completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 
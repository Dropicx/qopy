#!/usr/bin/env node

/**
 * Spam IP Updater
 * Lädt bekannte Spam-IPs von verschiedenen Quellen und aktualisiert die Blacklist
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Konfiguration
const config = {
  // Bekannte Spam-IP-Quellen (kostenlos verfügbar)
  sources: [
    {
      name: 'Spamhaus DROP',
      url: 'https://www.spamhaus.org/drop/drop.txt',
      type: 'text',
      parser: 'spamhaus'
    },
    {
      name: 'Emerging Threats',
      url: 'https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt',
      type: 'text',
      parser: 'simple'
    },
    // Weitere Quellen können hier hinzugefügt werden
  ],
  
  // Ausgabedateien
  outputDir: path.join(__dirname, '..', 'data'),
  blacklistFile: 'spam-ips.json',
  
  // Optionen  
  timeout: 30000,
  maxIPs: 10000, // Limit für Performance
  updateInterval: 24 * 60 * 60 * 1000, // 24 Stunden
};

// IP-Validierung
function isValidIPv4(ip) {
  const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip);
}

// CIDR zu IP-Liste konvertieren (vereinfacht)
function cidrToIPs(cidr) {
  // Für einfache Implementierung - nur /24 und /32 unterstützt
  if (cidr.includes('/32')) {
    return [cidr.replace('/32', '')];
  } else if (cidr.includes('/24')) {
    const baseIP = cidr.replace('/24', '');
    const parts = baseIP.split('.');
    if (parts.length === 4) {
      const ips = [];
      for (let i = 1; i <= 254; i++) {
        ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
      }
      return ips.slice(0, 100); // Limit für Performance
    }
  }
  return [];
}

// Parser für verschiedene Formate
const parsers = {
  spamhaus: (data) => {
    const lines = data.split('\n');
    const ips = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith(';') && !trimmed.startsWith('#')) {
        // Spamhaus format: "IP/CIDR ; Comment"
        const parts = trimmed.split(';');
        if (parts.length > 0) {
          const ipOrCidr = parts[0].trim();
          if (ipOrCidr.includes('/')) {
            ips.push(...cidrToIPs(ipOrCidr));
          } else if (isValidIPv4(ipOrCidr)) {
            ips.push(ipOrCidr);
          }
        }
      }
    }
    
    return ips;
  },
  
  simple: (data) => {
    const lines = data.split('\n');
    const ips = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        if (isValidIPv4(trimmed)) {
          ips.push(trimmed);
        }
      }
    }
    
    return ips;
  }
};

// HTTP/HTTPS Request Helper
function fetchData(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, {
      timeout: timeout,
      headers: {
        'User-Agent': 'Qopy-SpamUpdater/1.0'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Spam-IPs von einer Quelle laden
async function loadFromSource(source) {
  console.log(`📡 Loading from ${source.name}...`);
  
  try {
    const data = await fetchData(source.url, config.timeout);
    const parser = parsers[source.parser];
    
    if (!parser) {
      throw new Error(`Unknown parser: ${source.parser}`);
    }
    
    const ips = parser(data);
    console.log(`✅ ${source.name}: ${ips.length} IPs loaded`);
    
    return {
      source: source.name,
      ips: ips,
      loadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`❌ Error loading from ${source.name}:`, error.message);
    return {
      source: source.name,
      ips: [],
      error: error.message,
      loadedAt: new Date().toISOString()
    };
  }
}

// Alle Quellen laden
async function loadAllSources() {
  console.log('🔄 Starting spam IP update...');
  
  const results = [];
  
  for (const source of config.sources) {
    const result = await loadFromSource(source);
    results.push(result);
    
    // Kurze Pause zwischen Requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

// Ergebnisse zusammenfassen und speichern
function consolidateAndSave(results) {
  console.log('📊 Consolidating results...');
  
  const allIPs = new Set();
  const sourceStats = [];
  
  for (const result of results) {
    for (const ip of result.ips) {
      if (allIPs.size < config.maxIPs) {
        allIPs.add(ip);
      }
    }
    
    sourceStats.push({
      name: result.source,
      count: result.ips.length,
      loadedAt: result.loadedAt,
      error: result.error || null
    });
  }
  
  const consolidatedData = {
    updated: new Date().toISOString(),
    totalIPs: allIPs.size,
    sources: sourceStats,
    ips: Array.from(allIPs)
  };
  
  // Output-Verzeichnis erstellen
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  
  // Daten speichern
  const outputFile = path.join(config.outputDir, config.blacklistFile);
  fs.writeFileSync(outputFile, JSON.stringify(consolidatedData, null, 2));
  
  console.log(`💾 Saved ${allIPs.size} IPs to ${outputFile}`);
  
  return consolidatedData;
}

// Hauptfunktion
async function main() {
  try {
    console.log('🚀 Spam IP Updater started');
    
    const results = await loadAllSources();
    const consolidated = consolidateAndSave(results);
    
    console.log('\n📈 Summary:');
    console.log(`- Total unique IPs: ${consolidated.totalIPs}`);
    console.log(`- Sources processed: ${consolidated.sources.length}`);
    console.log(`- Updated: ${consolidated.updated}`);
    
    console.log('\n📋 Source details:');
    for (const source of consolidated.sources) {
      const status = source.error ? '❌' : '✅';
      console.log(`  ${status} ${source.name}: ${source.count} IPs`);
      if (source.error) {
        console.log(`     Error: ${source.error}`);
      }
    }
    
    console.log('\n✅ Update completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Update failed:', error);
    process.exit(1);
  }
}

// Script ausführen wenn direkt aufgerufen
if (require.main === module) {
  main();
}

module.exports = {
  loadAllSources,
  consolidateAndSave,
  config
}; 
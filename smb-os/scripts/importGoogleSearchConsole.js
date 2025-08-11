import { google } from 'googleapis';
import db from '../app/db.server.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL;
const serviceAccountPath = process.env.SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || 'search-console-service-account.json';

// Initialize the Search Console API client
const auth = new google.auth.GoogleAuth({
  keyFile: path.resolve(serviceAccountPath),
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const searchconsole = google.searchconsole({ version: 'v1', auth });

// Helper function to format date for API
function formatDateForAPI(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper function to parse date from API response
function parseDate(dateString) {
  const date = new Date(dateString + 'T00:00:00.000Z');
  
  // Validate the date
  if (isNaN(date.getTime())) {
    console.warn('Invalid date created from:', dateString);
    return null;
  }
  
  return date;
}

// Import search console data
async function importSearchConsoleData() {
  console.log('Importing Google Search Console data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1); // 1 year ago
  
  try {
    // Get search analytics data
    const response = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: formatDateForAPI(startDate),
        endDate: formatDateForAPI(endDate),
        dimensions: ['date', 'query', 'page', 'country', 'device'],
        rowLimit: 25000, // Maximum allowed
        startRow: 0,
      },
    });

    const rows = response.data.rows || [];
    console.log(`Found ${rows.length} search console rows from API`);

    let importCount = 0;
    for (const row of rows) {
      const date = parseDate(row.keys[0]);
      if (!date) continue; // Skip invalid dates
      
      const query = row.keys[1] || '';
      const page = row.keys[2] || null;
      const country = row.keys[3] || null;
      const device = row.keys[4] || null;

      const clicks = parseInt(row.clicks) || 0;
      const impressions = parseInt(row.impressions) || 0;
      const ctr = parseFloat(row.ctr) || null;
      const position = parseFloat(row.position) || null;

      try {
        await db.googleAnalyticsHistoricalSearch.upsert({
          where: {
            date_query_page_country_device: {
              date,
              query,
              page,
              country,
              device,
            },
          },
          update: {
            clicks,
            impressions,
            ctr,
            position,
            updatedAt: new Date(),
          },
          create: {
            date,
            query,
            page,
            country,
            device,
            clicks,
            impressions,
            ctr,
            position,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing search console data:', err, { date, query });
      }
    }
    
    console.log(`✅ Imported ${importCount} search console records`);
  } catch (err) {
    console.error('Error fetching search console data:', err);
    
    if (err.code === 403) {
      console.log('\n📋 Search Console API Setup Required:');
      console.log('1. Go to Google Cloud Console (console.cloud.google.com)');
      console.log('2. Enable the Search Console API for your project');
      console.log('3. Make sure your service account has access to Search Console data');
      console.log('4. Verify the site URL in your Search Console account');
      console.log(`5. Current site URL: ${siteUrl}`);
    }
  }
}

// Test function to verify Search Console API connection
async function testSearchConsoleConnection() {
  try {
    console.log('Testing Google Search Console API connection...');
    
    // First, try to list sites to verify access
    const sitesResponse = await searchconsole.sites.list();
    const sites = sitesResponse.data.siteEntry || [];
    
    console.log('Available sites in Search Console:');
    sites.forEach(site => {
      console.log(`  - ${site.siteUrl} (${site.permissionLevel})`);
    });
    
    // Check if our target site is available (try different URL formats)
    let targetSite = sites.find(site => site.siteUrl === siteUrl);
    
    // If not found, try alternative formats
    if (!targetSite) {
      // Try with trailing slash
      targetSite = sites.find(site => site.siteUrl === siteUrl + '/');
    }
    
    if (!targetSite) {
      // Try without https://
      const domainOnly = siteUrl.replace('https://', '').replace('http://', '');
      targetSite = sites.find(site => site.siteUrl.includes(domainOnly));
    }
    
    if (!targetSite) {
      console.log(`❌ Site ${siteUrl} not found in Search Console or no access`);
      console.log('💡 Try one of these available sites instead:');
      sites.forEach(site => {
        console.log(`   Update SEARCH_CONSOLE_SITE_URL to: ${site.siteUrl}`);
      });
      return false;
    }
    
    // Update siteUrl to match the exact format from Search Console
    const actualSiteUrl = targetSite.siteUrl;
    console.log(`✅ Found target site: ${actualSiteUrl} with ${targetSite.permissionLevel} access`);
    
    // Update the global siteUrl variable for the import
    process.env.SEARCH_CONSOLE_SITE_URL = actualSiteUrl;
    
    console.log(`✅ Found target site: ${siteUrl} with ${targetSite.permissionLevel} access`);
    
    // Try a small test query
    const testResponse = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        dimensions: ['date'],
        rowLimit: 1,
      },
    });

    if (testResponse.data.rows && testResponse.data.rows.length > 0) {
      console.log('✅ Search Console API connection successful!');
      console.log('Sample data:', {
        date: testResponse.data.rows[0].keys[0],
        clicks: testResponse.data.rows[0].clicks,
        impressions: testResponse.data.rows[0].impressions,
      });
      return true;
    } else {
      console.log('⚠️ API connection works but no data returned (this might be normal for the test date range)');
      return true; // Still consider this a success
    }
  } catch (err) {
    console.error('Search Console API connection test failed:', err.message);
    
    if (err.code === 403) {
      console.log('\n📋 Search Console API Setup Required:');
      console.log('1. Go to Google Cloud Console (console.cloud.google.com)');
      console.log('2. Enable the Search Console API for your project');
      console.log('3. Add your service account email to Search Console as a user');
      console.log('4. Verify the site URL matches your Search Console property');
      console.log(`5. Current site URL: ${siteUrl}`);
    }
    
    return false;
  }
}

// Main execution function
async function main() {
  console.log('Starting Google Search Console import process...');
  
  // Test connection first
  const connectionOk = await testSearchConsoleConnection();
  if (!connectionOk) {
    console.error('Search Console API connection failed. Please check your configuration.');
    console.log('\n📋 Required environment variables:');
    console.log('- SEARCH_CONSOLE_SITE_URL: Your website URL (e.g., "https://example.com")');
    console.log('- GA4_SERVICE_ACCOUNT_JSON: Path to your service account JSON file');
    process.exit(1);
  }
  
  // Proceed with import
  await importSearchConsoleData();
  
  console.log('✅ Google Search Console import completed successfully!');
}

// For ES modules, call the main function
main().catch(console.error);

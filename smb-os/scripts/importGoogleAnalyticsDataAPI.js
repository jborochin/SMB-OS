import { BetaAnalyticsDataClient } from '@google-analytics/data';
import db from '../app/db.server.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const propertyId = process.env.GA4_PROPERTY_ID;
const serviceAccountPath = process.env.GA4_SERVICE_ACCOUNT_JSON || 'service-account.json';

// Initialize the Analytics Data API client
const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: path.resolve(serviceAccountPath)
});

// Helper function to get channel group based on source and medium
function getChannelGroup(source, medium) {
  if (!source || !medium) return 'Direct';
  
  const sourceLower = source.toLowerCase();
  const mediumLower = medium.toLowerCase();
  
  if (mediumLower === 'organic') return 'Organic Search';
  if (mediumLower.includes('cpc') || mediumLower.includes('ppc')) return 'Paid Search';
  if (mediumLower === 'email') return 'Email';
  if (mediumLower === 'social' || ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'].includes(sourceLower)) return 'Social';
  if (mediumLower === 'referral') return 'Referral';
  if (mediumLower.includes('display') || mediumLower.includes('banner')) return 'Display';
  if (mediumLower.includes('affiliate')) return 'Affiliates';
  if (sourceLower === '(direct)' && mediumLower === '(none)') return 'Direct';
  
  return 'Other';
}

// Helper function to format date for API
function formatDateForAPI(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper function to parse date from API response
function parseDate(dateString) {
  // GA4 returns dates in YYYYMMDD format
  if (!dateString || dateString.length !== 8) {
    console.warn('Invalid date string:', dateString);
    return null;
  }
  
  const year = parseInt(dateString.slice(0, 4), 10);
  const month = parseInt(dateString.slice(4, 6), 10) - 1; // Month is 0-indexed
  const day = parseInt(dateString.slice(6, 8), 10);
  
  const date = new Date(year, month, day);
  
  // Validate the date
  if (isNaN(date.getTime())) {
    console.warn('Invalid date created from:', dateString);
    return null;
  }
  
  return date;
}

// Import historical sessions data
async function importHistoricalSessions() {
  console.log('Importing historical sessions data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1); // 1 year ago
  
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'deviceCategory' },
        { name: 'operatingSystem' },
        { name: 'browser' },
        { name: 'country' },
        { name: 'region' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'engagedSessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    let importCount = 0;
    for (const row of response.rows || []) {
      const date = parseDate(row.dimensionValues[0].value);
      if (!date) continue; // Skip invalid dates
      
      const source = row.dimensionValues[1].value || null;
      const medium = row.dimensionValues[2].value || null;
      const campaignName = row.dimensionValues[3].value || null;
      const deviceCategory = row.dimensionValues[4].value || null;
      const operatingSystem = row.dimensionValues[5].value || null;
      const browser = row.dimensionValues[6].value || null;
      const country = row.dimensionValues[7].value || null;
      const region = row.dimensionValues[8].value || null;
      const city = null; // Not included in this query to stay within dimension limits

      const sessions = parseInt(row.metricValues[0].value) || 0;
      const users = parseInt(row.metricValues[1].value) || 0;
      const newUsers = parseInt(row.metricValues[2].value) || 0;
      const engagedSessions = parseInt(row.metricValues[3].value) || 0;
      const bounceRate = parseFloat(row.metricValues[4].value) || null;
      const averageSessionDuration = parseFloat(row.metricValues[5].value) || null;
      const screenPageViews = parseInt(row.metricValues[6].value) || 0;

      try {
        await db.googleAnalyticsHistoricalSessions.upsert({
          where: {
            date_source_medium_deviceCategory_country: {
              date,
              source,
              medium,
              deviceCategory,
              country,
            },
          },
          update: {
            campaignName,
            channelGroup: getChannelGroup(source, medium),
            operatingSystem,
            browser,
            region,
            city,
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            updatedAt: new Date(),
          },
          create: {
            date,
            source,
            medium,
            campaignName,
            channelGroup: getChannelGroup(source, medium),
            deviceCategory,
            operatingSystem,
            browser,
            country,
            region,
            city,
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing session data:', err, { date, source, medium });
      }
    }
    
    console.log(`✅ Imported ${importCount} historical session records`);
  } catch (err) {
    console.error('Error fetching sessions data:', err);
  }
}

// Import historical pages data
async function importHistoricalPages() {
  console.log('Importing historical pages data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1);
  
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'pagePath' },
        { name: 'pageTitle' },
      ],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'bounceRate' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    let importCount = 0;
    for (const row of response.rows || []) {
      const date = parseDate(row.dimensionValues[0].value);
      if (!date) continue; // Skip invalid dates
      
      const pagePath = row.dimensionValues[1].value;
      const pageTitle = row.dimensionValues[2].value || null;

      const screenPageViews = parseInt(row.metricValues[0].value) || 0;
      const uniquePageViews = parseInt(row.metricValues[1].value) || 0; // approximation using sessions
      const bounceRate = parseFloat(row.metricValues[2].value) || null;

      try {
        await db.googleAnalyticsHistoricalPages.upsert({
          where: {
            date_pagePath: {
              date,
              pagePath,
            },
          },
          update: {
            pageTitle,
            landingPage: false, // Not available in simplified query
            screenPageViews,
            uniquePageViews,
            entrances: 0, // Not available in simplified query
            exits: 0, // Not available in simplified query
            bounceRate,
            averageTimeOnPage: null, // Not available in simplified query
            exitRate: null, // Not available in simplified query
            organicSessions: 0, // Not available in simplified query
            organicUsers: 0, // Not available in simplified query
            searchQueries: null, // Not available in simplified query
            topReferrers: null, // Not available in simplified query
            deviceBreakdown: null, // Not available in simplified query
            updatedAt: new Date(),
          },
          create: {
            date,
            pagePath,
            pageTitle,
            landingPage: false,
            screenPageViews,
            uniquePageViews,
            entrances: 0,
            exits: 0,
            bounceRate,
            averageTimeOnPage: null,
            exitRate: null,
            organicSessions: 0,
            organicUsers: 0,
            searchQueries: null,
            topReferrers: null,
            deviceBreakdown: null,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing page data:', err, { date, pagePath });
      }
    }
    
    console.log(`✅ Imported ${importCount} historical page records`);
  } catch (err) {
    console.error('Error fetching pages data:', err);
  }
}

// Import historical traffic source data
async function importHistoricalTraffic() {
  console.log('Importing historical traffic data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1);
  
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'sessionCampaignId' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'engagedSessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
        { name: 'conversions' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    let importCount = 0;
    for (const row of response.rows || []) {
      const date = parseDate(row.dimensionValues[0].value);
      if (!date) continue; // Skip invalid dates
      
      const source = row.dimensionValues[1].value;
      const medium = row.dimensionValues[2].value;
      const campaignName = row.dimensionValues[3].value || null;
      const campaignId = row.dimensionValues[4].value || null;

      const sessions = parseInt(row.metricValues[0].value) || 0;
      const users = parseInt(row.metricValues[1].value) || 0;
      const newUsers = parseInt(row.metricValues[2].value) || 0;
      const engagedSessions = parseInt(row.metricValues[3].value) || 0;
      const bounceRate = parseFloat(row.metricValues[4].value) || null;
      const averageSessionDuration = parseFloat(row.metricValues[5].value) || null;
      const screenPageViews = parseInt(row.metricValues[6].value) || 0;
      const conversions = parseInt(row.metricValues[7].value) || 0;
      const purchaseRevenue = parseFloat(row.metricValues[8].value) || null;
      const transactions = parseInt(row.metricValues[9].value) || 0;

      const conversionRate = sessions > 0 ? (conversions / sessions) * 100 : null;
      const itemsPerTransaction = transactions > 0 ? screenPageViews / transactions : null;

      try {
        await db.googleAnalyticsHistoricalTraffic.upsert({
          where: {
            date_source_medium_campaignName: {
              date,
              source,
              medium,
              campaignName,
            },
          },
          update: {
            campaignId,
            channelGroup: getChannelGroup(source, medium),
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions,
            conversionRate,
            purchaseRevenue,
            transactions,
            itemsPerTransaction,
            updatedAt: new Date(),
          },
          create: {
            date,
            source,
            medium,
            campaignName,
            campaignId,
            channelGroup: getChannelGroup(source, medium),
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions,
            conversionRate,
            purchaseRevenue,
            transactions,
            itemsPerTransaction,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing traffic data:', err, { date, source, medium });
      }
    }
    
    console.log(`✅ Imported ${importCount} historical traffic records`);
  } catch (err) {
    console.error('Error fetching traffic data:', err);
  }
}

// Import historical device data
async function importHistoricalDevices() {
  console.log('Importing historical device data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1);
  
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'deviceCategory' },
        { name: 'operatingSystem' },
        { name: 'browser' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'engagedSessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    let importCount = 0;
    for (const row of response.rows || []) {
      const date = parseDate(row.dimensionValues[0].value);
      if (!date) continue; // Skip invalid dates
      
      const deviceCategory = row.dimensionValues[1].value;
      const operatingSystem = row.dimensionValues[2].value || null;
      const browser = row.dimensionValues[3].value || null;

      const sessions = parseInt(row.metricValues[0].value) || 0;
      const users = parseInt(row.metricValues[1].value) || 0;
      const newUsers = parseInt(row.metricValues[2].value) || 0;
      const engagedSessions = parseInt(row.metricValues[3].value) || 0;
      const bounceRate = parseFloat(row.metricValues[4].value) || null;
      const averageSessionDuration = parseFloat(row.metricValues[5].value) || null;
      const screenPageViews = parseInt(row.metricValues[6].value) || 0;

      const conversionRate = sessions > 0 ? 0 : null; // Simplified since conversions metric was removed

      try {
        await db.googleAnalyticsHistoricalDevices.upsert({
          where: {
            date_deviceCategory_operatingSystem_browser: {
              date,
              deviceCategory,
              operatingSystem,
              browser,
            },
          },
          update: {
            operatingSystemVersion: null, // Not available in simplified query
            browserVersion: null, // Not available in simplified query
            screenResolution: null, // Not available in simplified query
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions: 0, // Not available in simplified query
            conversionRate,
            updatedAt: new Date(),
          },
          create: {
            date,
            deviceCategory,
            operatingSystem,
            operatingSystemVersion: null,
            browser,
            browserVersion: null,
            screenResolution: null,
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions: 0,
            conversionRate,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing device data:', err, { date, deviceCategory });
      }
    }
    
    console.log(`✅ Imported ${importCount} historical device records`);
  } catch (err) {
    console.error('Error fetching device data:', err);
  }
}

// Import historical geographic data
async function importHistoricalGeo() {
  console.log('Importing historical geographic data...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 1);
  
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'country' },
        { name: 'region' },
        { name: 'city' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'engagedSessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    let importCount = 0;
    for (const row of response.rows || []) {
      const date = parseDate(row.dimensionValues[0].value);
      if (!date) continue; // Skip invalid dates
      
      const country = row.dimensionValues[1].value;
      const region = row.dimensionValues[2].value || null;
      const city = row.dimensionValues[3].value || null;

      const sessions = parseInt(row.metricValues[0].value) || 0;
      const users = parseInt(row.metricValues[1].value) || 0;
      const newUsers = parseInt(row.metricValues[2].value) || 0;
      const engagedSessions = parseInt(row.metricValues[3].value) || 0;
      const bounceRate = parseFloat(row.metricValues[4].value) || null;
      const averageSessionDuration = parseFloat(row.metricValues[5].value) || null;
      const screenPageViews = parseInt(row.metricValues[6].value) || 0;

      const conversionRate = sessions > 0 ? 0 : null; // Simplified since conversions metric was removed

      try {
        await db.googleAnalyticsHistoricalGeo.upsert({
          where: {
            date_country_region_city: {
              date,
              country,
              region,
              city,
            },
          },
          update: {
            continent: null, // Not available in simplified query
            subContinent: null, // Not available in simplified query
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions: 0, // Not available in simplified query
            conversionRate,
            purchaseRevenue: null, // Not available in simplified query
            transactions: 0, // Not available in simplified query
            updatedAt: new Date(),
          },
          create: {
            date,
            country,
            region,
            city,
            continent: null,
            subContinent: null,
            sessions,
            users,
            newUsers,
            engagedSessions,
            bounceRate,
            averageSessionDuration,
            screenPageViews,
            conversions: 0,
            conversionRate,
            purchaseRevenue: null,
            transactions: 0,
          },
        });
        importCount++;
      } catch (err) {
        console.error('Error importing geo data:', err, { date, country });
      }
    }
    
    console.log(`✅ Imported ${importCount} historical geographic records`);
  } catch (err) {
    console.error('Error fetching geographic data:', err);
  }
}

// Test function to verify GA4 Data API connection
async function testDataAPIConnection() {
  try {
    console.log('Testing GA4 Data API connection...');
    
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: '7daysAgo',
          endDate: 'today',
        },
      ],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      limit: 1,
    });

    if (response.rows && response.rows.length > 0) {
      console.log('✅ GA4 Data API connection successful!');
      console.log('Sample data:', {
        date: response.rows[0].dimensionValues[0].value,
        sessions: response.rows[0].metricValues[0].value,
      });
      return true;
    } else {
      console.log('❌ No data returned from GA4 Data API');
      return false;
    }
  } catch (err) {
    console.error('GA4 Data API connection test failed:', err.message);
    return false;
  }
}

// Main execution function
async function main() {
  console.log('Starting GA4 Data API historical import process...');
  
  // Test connection first
  const connectionOk = await testDataAPIConnection();
  if (!connectionOk) {
    console.error('GA4 Data API connection failed. Please check your configuration.');
    console.log('\n📋 Required environment variables:');
    console.log('- GA4_PROPERTY_ID: Your GA4 property ID (e.g., "123456789")');
    console.log('- GA4_SERVICE_ACCOUNT_JSON: Path to your service account JSON file');
    process.exit(1);
  }
  
  // Import all historical data types
  await importHistoricalSessions();
  await importHistoricalPages();
  await importHistoricalTraffic();
  await importHistoricalDevices();
  await importHistoricalGeo();
  
  console.log('✅ GA4 Data API historical import completed successfully!');
}

// For ES modules, call the main function
main().catch(console.error);

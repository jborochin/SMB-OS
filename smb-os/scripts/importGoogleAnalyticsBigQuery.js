import { BigQuery } from '@google-cloud/bigquery';
import db from '../app/db.server.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const datasetId = process.env.GA4_BIGQUERY_DATASET_ID; // e.g., 'analytics_123456789'
const serviceAccountPath = process.env.GA4_SERVICE_ACCOUNT_JSON || 'service-account.json';

const bigquery = new BigQuery({
  projectId,
  keyFilename: path.resolve(serviceAccountPath)
});

function parseDate(dateStr) {
  // dateStr is in format YYYYMMDD from BigQuery
  if (!dateStr || dateStr.length !== 8) return new Date();
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  return new Date(year, month, day);
}

function parseTimestamp(timestampMicros) {
  // Convert microseconds to milliseconds
  return new Date(parseInt(timestampMicros) / 1000);
}

async function fetchAndImportFromBigQuery() {
  try {
    console.log('Starting BigQuery import...');

    // First, import sessions with actual session_id from BigQuery
    const sessionQuery = `
      SELECT DISTINCT
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') as ga_session_id,
        user_pseudo_id,
        PARSE_DATE('%Y%m%d', event_date) as session_date,
        traffic_source.source as session_source,
        traffic_source.medium as session_medium,
        traffic_source.name as session_campaign_name,
        device.category as device_category,
        device.operating_system as platform,
        geo.country,
        geo.region,
        geo.city,
        MIN(event_timestamp) as session_start_timestamp,
        COUNT(DISTINCT CASE WHEN event_name = 'session_start' THEN 1 END) as sessions,
        COUNT(DISTINCT CASE WHEN event_name = 'user_engagement' THEN 1 END) as engaged_sessions,
        SUM(CASE WHEN event_name = 'user_engagement' THEN 
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')
          ELSE 0 END) as total_engagement_time
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
        AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
      GROUP BY 1,2,3,4,5,6,7,8,9,10,11
      ORDER BY session_start_timestamp DESC
      LIMIT 1000
    `;

    console.log('Executing session query...');
    const [sessionRows] = await bigquery.query(sessionQuery);
    
    console.log(`Found ${sessionRows.length} session rows from BigQuery`);
    
    let sessionCount = 0;
    const createdSessionIds = new Set();
    for (const row of sessionRows) {
      const sessionId = `${row.user_pseudo_id}_${row.ga_session_id}`;
      const sessionStartTime = row.session_start_timestamp ? parseTimestamp(row.session_start_timestamp) : null;
      
      console.log(`Processing session: ${sessionId}`);
      
      try {
        await db.googleAnalyticsSession.upsert({
          where: { sessionId },
          update: {
            userPseudoId: row.user_pseudo_id,
            sessionStart: sessionStartTime,
            sessionSource: row.session_source || row.collected_source,
            sessionMedium: row.session_medium || row.collected_medium,
            sessionCampaignName: row.session_campaign_name,
            sessionCampaignContent: row.session_campaign_content,
            sessionCampaignTerm: row.session_campaign_term,
            deviceCategory: row.device_category,
            platform: row.platform,
            country: row.country,
            region: row.region,
            city: row.city,
            sessions: parseInt(row.sessions) || 0,
            engagedSessions: parseInt(row.engaged_sessions) || 0,
            engagementTime: row.total_engagement_time ? parseFloat(row.total_engagement_time) / 1000 : null, // Convert to seconds
            updatedAt: new Date()
          },
          create: {
            sessionId,
            userPseudoId: row.user_pseudo_id,
            sessionStart: sessionStartTime,
            sessionSource: row.session_source || row.collected_source,
            sessionMedium: row.session_medium || row.collected_medium,
            sessionCampaignName: row.session_campaign_name,
            sessionCampaignContent: row.session_campaign_content,
            sessionCampaignTerm: row.session_campaign_term,
            deviceCategory: row.device_category,
            platform: row.platform,
            country: row.country,
            region: row.region,
            city: row.city,
            sessions: parseInt(row.sessions) || 0,
            engagedSessions: parseInt(row.engaged_sessions) || 0,
            engagementTime: row.total_engagement_time ? parseFloat(row.total_engagement_time) / 1000 : null,
            createdAt: new Date()
          }
        });
        createdSessionIds.add(sessionId);
        sessionCount++;
        console.log(`✅ Created/updated session: ${sessionId}`);
      } catch (err) {
        console.error('Error upserting session:', err, { sessionId });
      }
    }
    console.log(`Imported ${sessionCount} sessions.`);
    console.log('Created session IDs:', Array.from(createdSessionIds));

    // Verify sessions exist in database
    console.log('Verifying sessions in database...');
    for (const sessionId of createdSessionIds) {
      const session = await db.googleAnalyticsSession.findUnique({ 
        where: { sessionId },
        select: { id: true, sessionId: true }
      });
      if (session) {
        console.log(`✅ Session verified in DB: ${sessionId} -> DB ID: ${session.id}`);
      } else {
        console.log(`❌ Session NOT found in DB: ${sessionId}`);
      }
    }

    // Import events with proper session linkage
    const eventQuery = `
      SELECT 
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') as ga_session_id,
        user_pseudo_id,
        event_name,
        event_timestamp,
        event_params
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
        AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
        AND event_name IN ('page_view', 'click', 'scroll', 'user_engagement', 'session_start', 'first_visit', 'purchase', 'add_to_cart')
      ORDER BY event_timestamp DESC
      LIMIT 5000
    `;

    console.log('Executing events query...');
    const [eventRows] = await bigquery.query(eventQuery);
    
    let eventCount = 0;
    let pageviewCount = 0;
    
    for (const row of eventRows) {
      const sessionId = `${row.user_pseudo_id}_${row.ga_session_id}`;
      const eventTime = parseTimestamp(row.event_timestamp);
      
      // Find the session in our database
      const session = await db.googleAnalyticsSession.findUnique({ 
        where: { sessionId } 
      });
      
      if (!session) {
        console.warn('No session found for event, skipping:', { sessionId, eventName: row.event_name });
        continue;
      }

      // Parse event parameters
      let eventParams = {};
      if (row.event_params && Array.isArray(row.event_params)) {
        for (const param of row.event_params) {
          if (param.key && param.value) {
            if (param.value.string_value) {
              eventParams[param.key] = param.value.string_value;
            } else if (param.value.int_value) {
              eventParams[param.key] = param.value.int_value;
            } else if (param.value.float_value) {
              eventParams[param.key] = param.value.float_value;
            } else if (param.value.double_value) {
              eventParams[param.key] = param.value.double_value;
            }
          }
        }
      }

      // Add page info to event params
      if (row.page_location) eventParams.page_location = row.page_location;
      if (row.page_title) eventParams.page_title = row.page_title;
      if (row.page_referrer) eventParams.page_referrer = row.page_referrer;

      try {
        // Import event
        await db.googleAnalyticsEvent.create({
          data: {
            eventName: row.event_name,
            eventParams: JSON.stringify(eventParams),
            eventTime,
            sessionId: session.id, // Use the integer id, not the string sessionId
            createdAt: new Date()
          }
        });
        eventCount++;

        // Import pageview if it's a page_view event and we have page_location in event params
        if (row.event_name === 'page_view' && eventParams.page_location) {
          try {
            await db.googleAnalyticsPageview.create({
              data: {
                pagePath: new URL(eventParams.page_location).pathname,
                pageTitle: eventParams.page_title,
                pageUrl: eventParams.page_location,
                referrer: eventParams.page_referrer,
                eventTime,
                sessionId: session.id, // Use the integer id, not the string sessionId
                createdAt: new Date()
              }
            });
            pageviewCount++;
          } catch (pageviewErr) {
            console.error('Error importing pageview:', pageviewErr, { sessionId, eventName: row.event_name });
          }
        }
      } catch (err) {
        console.error('Error importing event:', err, { sessionId, eventName: row.event_name });
      }
    }
    console.log(`Imported ${eventCount} events and ${pageviewCount} pageviews.`);

    // Import traffic source data with session linkage
    const trafficQuery = `
      SELECT DISTINCT
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') as ga_session_id,
        user_pseudo_id,
        PARSE_DATE('%Y%m%d', event_date) as date,
        traffic_source.source,
        traffic_source.medium,
        traffic_source.name as campaign_name,
        device.category as device_category,
        device.operating_system as platform,
        geo.country,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') as page_referrer,
        COUNT(DISTINCT (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')) as sessions,
        COUNT(DISTINCT CASE WHEN event_name = 'user_engagement' THEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') END) as engaged_sessions,
        SUM(CASE WHEN event_name = 'user_engagement' THEN 
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')
          ELSE 0 END) as total_engagement_duration,
        AVG(CASE WHEN event_name = 'user_engagement' THEN 
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')
          ELSE NULL END) as avg_session_duration
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
        AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
      GROUP BY 1,2,3,4,5,6,7,8,9,10
      ORDER BY date DESC
      LIMIT 1000
    `;

    console.log('Executing traffic source query...');
    const [trafficRows] = await bigquery.query(trafficQuery);
    
    let trafficCount = 0;
    for (const row of trafficRows) {
      const sessionId = `${row.user_pseudo_id}_${row.ga_session_id}`;
      
      // Find the session in our database
      const session = await db.googleAnalyticsSession.findUnique({ 
        where: { sessionId } 
      });
      
      if (!session) {
        console.warn('No session found for traffic source, skipping:', { sessionId });
        continue;
      }

      try {
        await db.googleAnalyticsTrafficSource.upsert({
          where: { sessionId: session.id }, // Use the integer id, not the string sessionId
          update: {
            date: row.date.value ? new Date(row.date.value) : new Date(row.date),
            source: row.source || 'direct',
            medium: row.medium || 'none',
            campaignName: row.campaign_name,
            channelGroup: getChannelGroup(row.source, row.medium),
            referrer: row.page_referrer,
            deviceCategory: row.device_category,
            platform: row.platform,
            country: row.country,
            sessions: parseInt(row.sessions) || 0,
            engagedSessions: parseInt(row.engaged_sessions) || 0,
            engagementDuration: parseInt(row.total_engagement_duration) || 0,
            avgSessionDuration: parseFloat(row.avg_session_duration) || 0,
            createdAt: new Date()
          },
          create: {
            sessionId: session.id, // Use the integer id, not the string sessionId
            date: row.date.value ? new Date(row.date.value) : new Date(row.date),
            source: row.source || 'direct',
            medium: row.medium || 'none',
            campaignName: row.campaign_name,
            channelGroup: getChannelGroup(row.source, row.medium),
            referrer: row.page_referrer,
            deviceCategory: row.device_category,
            platform: row.platform,
            country: row.country,
            sessions: parseInt(row.sessions) || 0,
            engagedSessions: parseInt(row.engaged_sessions) || 0,
            engagementDuration: parseInt(row.total_engagement_duration) || 0,
            avgSessionDuration: parseFloat(row.avg_session_duration) || 0,
            createdAt: new Date()
          }
        });
        trafficCount++;
      } catch (err) {
        console.error('Error importing traffic source:', err, { sessionId });
      }
    }
    console.log(`Imported ${trafficCount} traffic source records.`);

    console.log('BigQuery import completed successfully!');
  } catch (err) {
    console.error('Error fetching or importing BigQuery data:', err);
  }
}

// Helper function to determine channel group based on source and medium
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

// Test function to verify BigQuery connection and data availability
async function testBigQueryConnection() {
  try {
    console.log('Testing BigQuery connection...');
    
    // First, check if the dataset exists
    console.log('Checking if dataset exists...');
    try {
      const [dataset] = await bigquery.dataset(datasetId).get();
      console.log(`✅ Dataset ${datasetId} exists`);
    } catch (err) {
      console.error(`❌ Dataset ${datasetId} does not exist or is not accessible:`, err.message);
      console.log('\n📋 To fix this, you need to:');
      console.log('1. Go to your GA4 property in Google Analytics');
      console.log('2. Navigate to Admin → Property Settings → BigQuery Links');
      console.log('3. Click "Link" to create a new BigQuery export');
      console.log('4. Select your Google Cloud Project:', projectId);
      console.log('5. Wait 24-48 hours for data to start flowing');
      return false;
    }
    
    // Check what tables exist in the dataset
    console.log('Checking available tables...');
    try {
      const [tables] = await bigquery.dataset(datasetId).getTables();
      console.log(`Found ${tables.length} tables in dataset:`);
      tables.forEach(table => {
        console.log(`  - ${table.id}`);
      });
      
      if (tables.length === 0) {
        console.log('❌ No tables found. GA4 export may not be set up or no data has been exported yet.');
        return false;
      }
    } catch (err) {
      console.error('Error listing tables:', err.message);
      return false;
    }
    
    // Try a simple query on the most recent events table
    console.log('Testing data access...');
    const testQuery = `
      SELECT 
        COUNT(*) as total_events,
        MIN(event_date) as earliest_date,
        MAX(event_date) as latest_date
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      LIMIT 1
    `;
    
    const [rows] = await bigquery.query(testQuery);
    
    if (rows.length > 0) {
      console.log('✅ BigQuery connection successful!');
      console.log('Data summary:', rows[0]);
      return true;
    } else {
      console.log('❌ No data found in BigQuery tables');
      return false;
    }
  } catch (err) {
    console.error('BigQuery connection test failed:', err.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('Starting BigQuery GA4 import process...');
  
  // Test connection first
  const connectionOk = await testBigQueryConnection();
  if (!connectionOk) {
    console.error('BigQuery connection failed. Please check your configuration.');
    process.exit(1);
  }
  
  // Proceed with import
  await fetchAndImportFromBigQuery();
}

// For ES modules, call the main function
main().catch(console.error);

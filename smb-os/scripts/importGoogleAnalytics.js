import { BetaAnalyticsDataClient } from '@google-analytics/data';
import db from '../app/db.server.js';
import path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const propertyId = process.env.GA4_PROPERTY_ID; // e.g., '123456789'
const serviceAccountPath = process.env.GA4_SERVICE_ACCOUNT_JSON || 'service-account.json';

const analytics = new BetaAnalyticsDataClient({
  keyFilename: path.resolve(serviceAccountPath)
});

function parseDateYYYYMMDD(dateStr) {
  // dateStr is in format YYYYMMDD
  if (!dateStr || dateStr.length !== 8) return new Date();
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  return new Date(year, month, day);
}

async function fetchAndImport() {
  try {
    // Import events and pageviews (updated for 9-dimension limit)
    const [eventResponse] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '2024-01-01', endDate: 'today' }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'sessionDefaultChannelGroup' },
        { name: 'pageReferrer' },
        { name: 'deviceCategory' },
        { name: 'eventName' },
        { name: 'pagePath' }
      ],
      metrics: [{ name: 'eventCount' }],
      limit: 500, // Limit to most recent 500 actions
    });
    let eventCount = 0;
    let pageviewCount = 0;
    for (const row of eventResponse.rows) {
      const date = row.dimensionValues?.[0]?.value;
      const sessionSource = row.dimensionValues?.[1]?.value;
      const sessionMedium = row.dimensionValues?.[2]?.value;
      const sessionCampaignName = row.dimensionValues?.[3]?.value;
      const sessionDefaultChannelGroup = row.dimensionValues?.[4]?.value;
      const pageReferrer = row.dimensionValues?.[5]?.value;
      const deviceCategory = row.dimensionValues?.[6]?.value;
      const eventName = row.dimensionValues?.[7]?.value;
      const pagePath = row.dimensionValues?.[8]?.value;
      const eventCountValue = row.metricValues?.[0]?.value;
      const eventTime = parseDateYYYYMMDD(date) || new Date();
      // Build composite key for session lookup (7 shared dimensions)
      const compositeKey = [
        date, sessionSource, sessionMedium, sessionCampaignName,
        sessionDefaultChannelGroup, pageReferrer, deviceCategory
      ].map(v => v || '').join('|');
      // Find the session
      const session = await db.googleAnalyticsSession.findUnique({ where: { sessionId: compositeKey } });
      if (!session) {
        console.warn('No session found for event, skipping:', { compositeKey, eventName, pagePath, date });
        continue;
      }
      // Import event, linking to session
      await db.googleAnalyticsEvent.create({
        data: {
          eventName,
          eventParams: JSON.stringify({ eventCount: eventCountValue, pagePath }),
          eventTime,
          createdAt: new Date(),
          sessionId: session.id, // This links the event to the session
        },
      });
      eventCount++;
      // Import pageview if eventName is 'page_view'
      if (eventName === 'page_view') {
        await db.googleAnalyticsPageview.create({
          data: {
            pagePath,
            eventTime,
            createdAt: new Date(),
            sessionId: session.id,
          },
        });
        pageviewCount++;
      }
    }
    console.log(`Imported ${eventCount} events and ${pageviewCount} pageviews.`);

    // Import traffic source data (no session linkage)
    const [trafficResponse] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '2024-07-01', endDate: 'today' }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'sessionDefaultChannelGroup' },
        { name: 'pageReferrer' },
        { name: 'deviceCategory' },
        { name: 'platform' },
        { name: 'country' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'userEngagementDuration' },
        { name: 'averageSessionDuration' }
      ],
      limit: 1000
    });
    console.log('trafficResponse.rows:', trafficResponse.rows);
    let trafficCount = 0;
    for (const row of trafficResponse.rows) {
      const date = row.dimensionValues?.[0]?.value;
      const sessionSource = row.dimensionValues?.[1]?.value;
      const sessionMedium = row.dimensionValues?.[2]?.value;
      const sessionCampaignName = row.dimensionValues?.[3]?.value;
      const sessionDefaultChannelGroup = row.dimensionValues?.[4]?.value;
      const pageReferrer = row.dimensionValues?.[5]?.value;
      const deviceCategory = row.dimensionValues?.[6]?.value;
      const platform = row.dimensionValues?.[7]?.value;
      const country = row.dimensionValues?.[8]?.value;
      const sessions = row.metricValues?.[0]?.value ? parseInt(row.metricValues[0].value, 10) : null;
      const engagedSessions = row.metricValues?.[1]?.value ? parseInt(row.metricValues[1].value, 10) : null;
      const engagementDuration = row.metricValues?.[2]?.value ? parseInt(row.metricValues[2].value, 10) : null;
      const avgSessionDuration = row.metricValues?.[3]?.value ? parseFloat(row.metricValues[3].value) : null;
      // Build composite key for session lookup (7 shared dimensions)
      const compositeKey = [
        date, sessionSource, sessionMedium, sessionCampaignName,
        sessionDefaultChannelGroup, pageReferrer, deviceCategory
      ].map(v => v || '').join('|');
      // Find the session
      const session = await db.googleAnalyticsSession.findUnique({ where: { sessionId: compositeKey } });
      if (!session) {
        console.warn('No session found for traffic source, skipping:', { compositeKey });
        continue;
      }
      await db.googleAnalyticsTrafficSource.create({
        data: {
          date: parseDateYYYYMMDD(date),
          source: sessionSource,
          medium: sessionMedium,
          campaignName: sessionCampaignName,
          channelGroup: sessionDefaultChannelGroup,
          referrer: pageReferrer,
          deviceCategory,
          platform,
          country,
          sessions,
          engagedSessions,
          engagementDuration,
          avgSessionDuration,
          sessionId: session.id, // Link to session
          createdAt: new Date(),
        },
      });
      trafficCount++;
    }
    console.log(`Imported ${trafficCount} traffic source records.`);

    // Import session aggregates and upsert all fields matching the Prisma schema (7 shared dimensions)
    const [sessionResponse] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '2024-07-01', endDate: 'today' }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
        { name: 'sessionDefaultChannelGroup' },
        { name: 'pageReferrer' },
        { name: 'deviceCategory' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'averageSessionDuration' },
        { name: 'userEngagementDuration' }
      ],
      limit: 1000
    });
    console.log('sessionResponse.rows:', sessionResponse.rows);
    let sessionCount = 0;
    for (const row of sessionResponse.rows || []) {
      const date = row.dimensionValues?.[0]?.value;
      const sessionSource = row.dimensionValues?.[1]?.value;
      const sessionMedium = row.dimensionValues?.[2]?.value;
      const sessionCampaignName = row.dimensionValues?.[3]?.value;
      const sessionDefaultChannelGroup = row.dimensionValues?.[4]?.value;
      const pageReferrer = row.dimensionValues?.[5]?.value;
      const deviceCategory = row.dimensionValues?.[6]?.value;
      const sessions = row.metricValues?.[0]?.value ? parseInt(row.metricValues[0].value, 10) : null;
      const engagedSessions = row.metricValues?.[1]?.value ? parseInt(row.metricValues[1].value, 10) : null;
      const averageSessionDuration = row.metricValues?.[2]?.value ? parseFloat(row.metricValues[2].value) : null;
      const userEngagementDuration = row.metricValues?.[3]?.value ? parseFloat(row.metricValues[3].value) : null;
      // Composite key for upsert (7 shared dimensions)
      const compositeKey = [
        date, sessionSource, sessionMedium, sessionCampaignName,
        sessionDefaultChannelGroup, pageReferrer, deviceCategory
      ].map(v => v || '').join('|');
      try {
        await db.googleAnalyticsSession.upsert({
          where: { sessionId: compositeKey },
          update: {
            sessionStart: date ? parseDateYYYYMMDD(date) : null,
            sessionSource,
            sessionMedium,
            sessionCampaignName,
            sessionDefaultChannelGroup,
            pageReferrer,
            deviceCategory,
            sessions,
            engagedSessions,
            sessionDuration: averageSessionDuration,
            engagementTime: userEngagementDuration,
          },
          create: {
            sessionId: compositeKey,
            sessionStart: date ? parseDateYYYYMMDD(date) : null,
            sessionSource,
            sessionMedium,
            sessionCampaignName,
            sessionDefaultChannelGroup,
            pageReferrer,
            deviceCategory,
            sessions,
            engagedSessions,
            sessionDuration: averageSessionDuration,
            engagementTime: userEngagementDuration,
          }
        });
        sessionCount++;
      } catch (err) {
        console.error('Error inserting session aggregate:', err, { compositeKey });
      }
    }
    console.log(`Imported ${sessionCount} session aggregate records.`);
    // If this works, incrementally add more dimensions/metrics from the recommended list above.
  } catch (err) {
    console.error('Error fetching or importing GA4 data:', err);
  }
}

async function testTrafficSourceSessionLinkage() {
  try {
    const [response] = await analytics.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '2024-01-01', endDate: 'today' }],
      dimensions: [
        { name: 'sessionId' },
        { name: 'source' },
        { name: 'medium' },
        { name: 'campaign' },
        { name: 'keyword' },
        { name: 'gclid' },
      ],
      metrics: [{ name: 'activeUsers' }], // minimal metric just to allow the query
      limit: 10,
    });
    if (response.rows && response.rows.length > 0) {
      console.log('First traffic source row with sessionId:', response.rows[0]);
    } else {
      console.log('No rows returned for traffic source test.');
    }
  } catch (err) {
    console.error('Error testing traffic source session linkage:', err);
  }
}

// For ES modules, just call the main import function
fetchAndImport(); 
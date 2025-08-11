import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const datasetId = process.env.GA4_BIGQUERY_DATASET_ID;
const serviceAccountPath = process.env.GA4_SERVICE_ACCOUNT_JSON || 'service-account.json';

const bigquery = new BigQuery({
  projectId,
  keyFilename: path.resolve(serviceAccountPath)
});

async function exploreSchema() {
  try {
    console.log('Exploring BigQuery GA4 schema...');
    
    // Get the most recent table
    const [tables] = await bigquery.dataset(datasetId).getTables();
    const eventsTables = tables.filter(table => table.id.startsWith('events_'));
    
    if (eventsTables.length === 0) {
      console.log('No events tables found');
      return;
    }
    
    const latestTable = eventsTables.sort((a, b) => b.id.localeCompare(a.id))[0];
    console.log(`Using table: ${latestTable.id}`);
    
    // Query to see the actual structure and sample data - using only basic fields first
    const exploreQuery = `
      SELECT 
        event_date,
        event_timestamp,
        event_name,
        event_params,
        user_pseudo_id,
        platform,
        geo,
        device,
        traffic_source
      FROM \`${projectId}.${datasetId}.${latestTable.id}\`
      LIMIT 3
    `;
    
    console.log('Sample data from GA4 BigQuery:');
    const [rows] = await bigquery.query(exploreQuery);
    
    rows.forEach((row, index) => {
      console.log(`\n--- Row ${index + 1} ---`);
      console.log('Event Date:', row.event_date);
      console.log('Event Name:', row.event_name);
      console.log('User Pseudo ID:', row.user_pseudo_id);
      console.log('Platform:', row.platform);
      console.log('Page Location:', row.page_location);
      console.log('Traffic Source:', JSON.stringify(row.traffic_source, null, 2));
      console.log('Device:', JSON.stringify(row.device, null, 2));
      console.log('Geo:', JSON.stringify(row.geo, null, 2));
      
      if (row.event_params && row.event_params.length > 0) {
        console.log('Event Params:');
        row.event_params.forEach(param => {
          console.log(`  ${param.key}: ${JSON.stringify(param.value)}`);
        });
      }
    });
    
    // Check what fields are actually available
    console.log('\n--- Checking available fields ---');
    const fieldsQuery = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT user_pseudo_id) as unique_users,
        COUNT(DISTINCT event_name) as unique_event_names,
        ARRAY_AGG(DISTINCT event_name LIMIT 10) as sample_event_names
      FROM \`${projectId}.${datasetId}.${latestTable.id}\`
    `;
    
    const [fieldRows] = await bigquery.query(fieldsQuery);
    console.log('Field summary:', fieldRows[0]);
    
  } catch (err) {
    console.error('Error exploring schema:', err);
  }
}

exploreSchema().catch(console.error);

import fs from 'fs/promises';
import path from 'path';

const queuePath = path.resolve('./webhook-queue-products-create.jsonl');

async function processQueue() {
  try {
    const data = await fs.readFile(queuePath, 'utf8');
    const lines = data.trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const record = JSON.parse(line);
      // Here you would process the webhook (e.g., update your DB)
      console.log('Processing queued webhook:', record);
    }
    // Clear the queue after processing
    await fs.writeFile(queuePath, '', 'utf8');
    console.log('✅ Queue processed and cleared.');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No queued webhooks to process.');
    } else {
      console.error('Error processing queue:', err);
    }
  }
}

await processQueue(); 
// Create this as a separate utility file: app/utils/webhook-registration.js
import { readFileSync } from 'fs';
import { join } from 'path';

function getAppUrlFromConfig() {
  try {
    const configPath = join(process.cwd(), 'shopify.app.toml');
    const configContent = readFileSync(configPath, 'utf8');
    const appUrlMatch = configContent.match(/application_url\s*=\s*"([^"]+)"/);
    if (appUrlMatch) {
      return appUrlMatch[1];
    }
  } catch (error) {
    console.warn('⚠️ Could not read app URL from shopify.app.toml:', error.message);
  }
  return null;
}

async function deleteOldWebhooks(admin, webhooksToDelete) {
  console.log(`🗑️ Deleting ${webhooksToDelete.length} old webhooks...`);
  
  for (const webhook of webhooksToDelete) {
    try {
      console.log(`🗑️ Attempting to delete webhook ${webhook.topic} with ID: ${webhook.id}`);
      
      const deleteMutation = await admin.graphql(
        `#graphql
        mutation webhookSubscriptionDelete($id: ID!) {
          webhookSubscriptionDelete(id: $id) {
            deletedWebhookSubscriptionId
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            id: webhook.id
          }
        }
      );
      
      const deleteResponse = await deleteMutation.json();
      console.log(`🗑️ Delete response for ${webhook.topic}:`, JSON.stringify(deleteResponse, null, 2));
      
      if (deleteResponse.data.webhookSubscriptionDelete.userErrors.length > 0) {
        console.error(`❌ Failed to delete webhook ${webhook.topic}:`, deleteResponse.data.webhookSubscriptionDelete.userErrors);
      } else {
        console.log(`✅ Deleted old webhook ${webhook.topic} (${webhook.endpoint.callbackUrl})`);
      }
    } catch (error) {
      console.error(`❌ Error deleting webhook ${webhook.topic}:`, error);
    }
  }
}

export async function registerWebhooks(admin, shopDomain) {
  console.log(`🔄 Re-registering webhooks for shop: ${shopDomain}`);
  
  // Only register webhooks that don't require special approval
  const webhookTopics = [
    { topic: "products/create", uri: "/webhooks/products/create" },
    { topic: "products/update", uri: "/webhooks/products/update" },
    { topic: "app/uninstalled", uri: "/webhooks/app/uninstalled" },
    { topic: "app/scopes_update", uri: "/webhooks/app/scopes_update" }
  ];

  const results = [];

  try {
    // First, get all existing webhooks
    const existingWebhooksQuery = await admin.graphql(
        `#graphql
      query getWebhookSubscriptions {
        webhookSubscriptions(first: 50) {
            edges {
              node {
                id
              topic
                endpoint {
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
            }
          }
      }`
      );
      
    const existingWebhooksResponse = await existingWebhooksQuery.json();
    const existingWebhooks = existingWebhooksResponse.data.webhookSubscriptions.edges;

    // Check if existing webhooks are pointing to the correct URL
    console.log(`📋 Found ${existingWebhooks.length} existing webhooks. Checking URLs...`);
    
    // Get app URL from environment or config file
    const appUrl = process.env.SHOPIFY_APP_URL || getAppUrlFromConfig();
    if (!appUrl) {
      throw new Error('Could not determine app URL. Please set SHOPIFY_APP_URL environment variable or ensure shopify.app.toml has application_url set.');
    }
    console.log(`🔗 Using app URL: ${appUrl}`);
    
    // Check which webhooks need to be updated or created
    const webhooksToUpdate = [];
    for (const edge of existingWebhooks) {
      const webhook = edge.node;
      const callbackUrl = webhook.endpoint?.callbackUrl;
      if (callbackUrl && !callbackUrl.includes(appUrl)) {
        console.log(`⚠️ Webhook ${webhook.topic} points to old URL: ${callbackUrl}`);
        webhooksToUpdate.push(webhook);
      } else if (callbackUrl && callbackUrl.includes(appUrl)) {
        console.log(`✅ Webhook ${webhook.topic} already points to correct URL: ${callbackUrl}`);
      }
    }

    // --- FIXED LOGIC STARTS HERE ---
    // If there are no existing webhooks, register all required webhooks
    if (existingWebhooks.length === 0) {
      console.log(`⚠️ No webhooks found. Registering all required webhooks...`);
    } else if (webhooksToUpdate.length === 0) {
      // Check if all required topics are present
      const missingTopics = webhookTopics.filter(({ topic }) => {
        const topicName = topic.toUpperCase().replace(/\//g, '_');
        return !existingWebhooks.some(edge => {
          const webhook = edge.node;
          return webhook.topic === topicName && webhook.endpoint?.callbackUrl?.includes(appUrl);
        });
      });
      if (missingTopics.length === 0) {
        console.log(`🎉 All webhooks are already pointing to the correct URL!`);
        return results;
      } else {
        console.log(`⚠️ Some required webhooks are missing. Registering missing webhooks...`);
      }
    }
    // --- FIXED LOGIC ENDS HERE ---

    if (webhooksToUpdate.length > 0) {
      console.log(`📝 Need to update ${webhooksToUpdate.length} webhooks with incorrect URLs...`);
      // Delete old webhooks first
      await deleteOldWebhooks(admin, webhooksToUpdate);
    }

    // Register new webhooks
    console.log(`📝 Registering ${webhookTopics.length} new webhooks...`);

    // Only create webhooks for topics that don't have the correct URL
    const topicsNeedingWebhooks = webhookTopics.filter(({ topic }) => {
      const topicName = topic.toUpperCase().replace(/\//g, '_');
      const hasCorrectWebhook = existingWebhooks.some(edge => {
        const webhook = edge.node;
        return webhook.topic === topicName && 
               webhook.endpoint?.callbackUrl?.includes(appUrl);
      });
      return !hasCorrectWebhook;
    });

    console.log(`📝 Creating webhooks for ${topicsNeedingWebhooks.length} topics that need them...`);
    
    for (const { topic, uri } of topicsNeedingWebhooks) {
      try {
        const webhookMutation = await admin.graphql(
          `#graphql
          mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
              webhookSubscription {
                id
                topic
                endpoint {
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              topic: topic.toUpperCase().replace(/\//g, '_'),
              webhookSubscription: {
                callbackUrl: `${appUrl}${uri}`,
                format: "JSON"
              }
            }
          }
        );
        
        const webhookResponse = await webhookMutation.json();
        if (webhookResponse.data.webhookSubscriptionCreate.userErrors.length > 0) {
          console.error(`❌ Failed to register webhook for ${topic}:`, webhookResponse.data.webhookSubscriptionCreate.userErrors);
          results.push({ topic, status: 'failed', errors: webhookResponse.data.webhookSubscriptionCreate.userErrors });
        } else {
          const webhook = webhookResponse.data.webhookSubscriptionCreate.webhookSubscription;
          console.log(`✅ Successfully registered webhook for ${topic}: ${webhook.endpoint.callbackUrl}`);
          results.push({ topic, status: 'created', webhook });
        }
      } catch (error) {
        console.error(`❌ Error registering webhook for ${topic}:`, error);
        results.push({ topic, status: 'error', error: error.message });
      }
    }

    // Add results for topics that already have correct webhooks
    for (const { topic } of webhookTopics) {
      const topicName = topic.toUpperCase().replace(/\//g, '_');
      const hasCorrectWebhook = existingWebhooks.some(edge => {
        const webhook = edge.node;
        return webhook.topic === topicName && 
               webhook.endpoint?.callbackUrl?.includes(appUrl);
      });
      
      if (hasCorrectWebhook) {
        console.log(`✅ Webhook for ${topic} already exists with correct URL`);
        results.push({ topic, status: 'exists' });
      }
    }

    console.log(`🎉 Webhook re-registration completed for ${shopDomain}`);
    console.log(`📊 Results:`, results.map(r => `${r.topic}: ${r.status}`).join(', '));

  } catch (error) {
    console.error("❌ Error during webhook re-registration:", error);
    throw error;
  }

  return results;
}

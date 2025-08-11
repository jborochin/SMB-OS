import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "../app/db.server.js";
import { registerWebhooks } from "../app/webhook-registration.js";

// Get the new URL from command line argument or environment
const newUrl = process.argv[2] || process.env.SHOPIFY_APP_URL;

if (!newUrl) {
  console.error("❌ Please provide the new app URL as an argument or set SHOPIFY_APP_URL");
  console.error("Usage: node scripts/update-webhooks.js https://your-new-url.trycloudflare.com");
  process.exit(1);
}

console.log(`🔄 Updating webhooks to use URL: ${newUrl}`);

// Update environment variable
process.env.SHOPIFY_APP_URL = newUrl;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: "2025-01",
  scopes: process.env.SCOPES?.split(","),
  appUrl: newUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
});

async function updateWebhooksForAllShops() {
  try {
    // Get all shops from database
    const shops = await prisma.shop.findMany();
    
    if (shops.length === 0) {
      console.log("⚠️  No shops found in database. Make sure your app is installed on at least one shop.");
      return;
    }

    console.log(`📦 Found ${shops.length} shop(s) to update webhooks for`);

    for (const shop of shops) {
      console.log(`\n🏪 Updating webhooks for shop: ${shop.domain}`);
      
      try {
        // Get session for this shop
        const session = await prisma.session.findFirst({
          where: { shop: shop.domain }
        });

        if (!session) {
          console.log(`⚠️  No session found for shop ${shop.domain}, skipping`);
          continue;
        }

        // Create admin client with proper session
        const sessionObj = {
          shop: shop.domain,
          accessToken: session.accessToken,
          id: session.id,
          state: session.state,
          isOnline: session.isOnline === 1,
          scope: session.scope,
          expires: session.expires
        };
        
        const admin = shopify.unauthenticated.admin(sessionObj);

        // First, delete existing webhooks to avoid duplicates
        console.log("🗑️  Removing old webhooks...");
        const existingWebhooksQuery = await admin.graphql(`
          query {
            webhookSubscriptions(first: 50) {
              edges {
                node {
                  id
                  endpoint {
                    ... on WebhookHttpEndpoint {
                      callbackUrl
                    }
                  }
                }
              }
            }
          }
        `);

        const existingWebhooksResponse = await existingWebhooksQuery.json();
        const existingWebhooks = existingWebhooksResponse.data.webhookSubscriptions.edges;

        for (const webhook of existingWebhooks) {
          const callbackUrl = webhook.node.endpoint?.callbackUrl;
          if (callbackUrl && (callbackUrl.includes('trycloudflare.com') || callbackUrl.includes('ngrok.io'))) {
            console.log(`🗑️  Deleting old webhook: ${callbackUrl}`);
            await admin.graphql(`
              mutation webhookSubscriptionDelete($id: ID!) {
                webhookSubscriptionDelete(id: $id) {
                  deletedWebhookSubscriptionId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: { id: webhook.node.id }
            });
          }
        }

        // Register new webhooks
        console.log("✅ Registering new webhooks...");
        const results = await registerWebhooks(admin, shop.domain);
        
        console.log(`✅ Webhook update completed for ${shop.domain}`);
        results.forEach(result => {
          console.log(`   - ${result.topic}: ${result.status}`);
        });

      } catch (error) {
        console.error(`❌ Failed to update webhooks for shop ${shop.domain}:`, error.message);
      }
    }

    console.log("\n🎉 Webhook update process completed!");
    console.log("\n💡 Remember to update your .env file with the new SHOPIFY_APP_URL:");
    console.log(`SHOPIFY_APP_URL=${newUrl}`);

  } catch (error) {
    console.error("❌ Error updating webhooks:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateWebhooksForAllShops();

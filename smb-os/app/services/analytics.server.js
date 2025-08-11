/**
 * Analytics Service for tracking app installations and store events
 */

// Track app installation
export async function trackAppInstallation(shopDomain, session) {
  try {
    // Send to Google Analytics 4
    const eventData = {
      event: 'app_installation',
      shop_domain: shopDomain,
      timestamp: new Date().toISOString(),
      user_agent: session?.userAgent || 'unknown',
      shop_id: session?.shopifyId || null,
      access_scopes: session?.accessScopes || [],
      plan_name: session?.planName || 'free'
    };

    console.log('📊 Analytics: App installation tracked:', eventData);
    
    // You can also send to your own analytics endpoint
    await sendToAnalyticsEndpoint(eventData);
    
    return true;
  } catch (error) {
    console.error('❌ Analytics: Failed to track app installation:', error);
    return false;
  }
}

// Track store-specific events
export async function trackStoreEvent(shopDomain, eventName, eventData = {}) {
  try {
    const analyticsData = {
      event: eventName,
      shop_domain: shopDomain,
      timestamp: new Date().toISOString(),
      ...eventData
    };

    console.log(`📊 Analytics: Store event tracked - ${eventName}:`, analyticsData);
    
    // Send to Google Analytics 4
    await sendToAnalyticsEndpoint(analyticsData);
    
    return true;
  } catch (error) {
    console.error(`❌ Analytics: Failed to track event ${eventName}:`, error);
    return false;
  }
}

// Track feature usage
export async function trackFeatureUsage(shopDomain, featureName, usageData = {}) {
  try {
    const analyticsData = {
      event: 'feature_usage',
      shop_domain: shopDomain,
      feature_name: featureName,
      timestamp: new Date().toISOString(),
      ...usageData
    };

    console.log(`📊 Analytics: Feature usage tracked - ${featureName}:`, analyticsData);
    
    // Send to Google Analytics 4
    await sendToAnalyticsEndpoint(analyticsData);
    
    // Track in database
    await trackFeatureUsageInDatabase(shopDomain, featureName, usageData);
    
    return true;
  } catch (error) {
    console.error(`❌ Analytics: Failed to track feature usage ${featureName}:`, error);
    return false;
  }
}

// Track feature usage in database
async function trackFeatureUsageInDatabase(shopDomain, featureName, usageData = {}) {
  try {
    const db = await import("../db.server.js").then(module => module.default);
    
    // Find the shop
    const shop = await db.shop.findUnique({
      where: { domain: shopDomain }
    });
    
    if (!shop) {
      console.error(`❌ Analytics: Shop not found for domain: ${shopDomain}`);
      return;
    }
    
    // Create feature usage record
    await db.featureUsage.create({
      data: {
        shopId: shop.id,
        featureName: featureName,
        usageData: JSON.stringify(usageData)
      }
    });
    
    console.log(`✅ Analytics: Feature usage saved to database - ${featureName} for ${shopDomain}`);
  } catch (error) {
    console.error(`❌ Analytics: Failed to save feature usage to database:`, error);
  }
}

// Track webhook events
export async function trackWebhookEvent(shopDomain, webhookTopic, eventData = {}) {
  try {
    const analyticsData = {
      event: 'webhook_received',
      shop_domain: shopDomain,
      webhook_topic: webhookTopic,
      timestamp: new Date().toISOString(),
      ...eventData
    };

    console.log(`📊 Analytics: Webhook event tracked - ${webhookTopic}:`, analyticsData);
    
    await sendToAnalyticsEndpoint(analyticsData);
    
    return true;
  } catch (error) {
    console.error(`❌ Analytics: Failed to track webhook event ${webhookTopic}:`, error);
    return false;
  }
}

// Send data to analytics endpoint (Google Analytics 4)
async function sendToAnalyticsEndpoint(data) {
  try {
    const GA_MEASUREMENT_ID = 'G-B6JMRMQ46P'; // Your GA4 Measurement ID
    const GA_API_SECRET = process.env.GA_API_SECRET; // Set this in your environment variables
    
    if (!GA_API_SECRET) {
      console.log('⚠️ Analytics: GA_API_SECRET not set, skipping server-side tracking');
      return;
    }

    const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;
    
    const payload = {
      client_id: data.shop_domain || 'unknown',
      events: [{
        name: data.event,
        params: {
          shop_domain: data.shop_domain,
          feature_name: data.feature_name,
          webhook_topic: data.webhook_topic,
          ...data
        }
      }]
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('❌ Analytics: Failed to send to GA4:', response.status);
    } else {
      console.log('✅ Analytics: Data sent to GA4 successfully');
    }
  } catch (error) {
    console.error('❌ Analytics: Error sending to GA4:', error);
  }
}

// Get analytics summary for dashboard
export async function getAnalyticsSummary() {
  try {
    // Import database
    const db = await import("../db.server.js").then(module => module.default);
    
    // Get real data from database
    const shops = await db.shop.findMany({
      select: {
        id: true,
        domain: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: true,
            customers: true,
            orders: true
          }
        }
      }
    });

    // Calculate active stores (stores that have accessed the app in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeStores = shops.filter(shop => 
      new Date(shop.updatedAt) > thirtyDaysAgo
    ).length;

    // Get total webhook events from the queue file
    let totalWebhooks = 0;
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const queuePath = path.resolve("./webhook-queue-products-create.jsonl");
      const queueContent = await fs.readFile(queuePath, "utf8");
      totalWebhooks = queueContent.split('\n').filter(line => line.trim()).length;
    } catch (error) {
      console.log("No webhook queue file found, setting count to 0");
    }

    // Get popular features from database
    const featureUsage = await db.featureUsage.groupBy({
      by: ['featureName'],
      _count: {
        featureName: true
      },
      orderBy: {
        _count: {
          featureName: 'desc'
        }
      },
      take: 10
    });

    const popularFeatures = featureUsage.map(feature => ({
      name: feature.featureName,
      count: feature._count.featureName
    }));

    return {
      total_installations: shops.length,
      active_stores: activeStores,
      total_webhooks: totalWebhooks,
      popular_features: popularFeatures
    };
  } catch (error) {
    console.error("❌ Analytics: Failed to get analytics summary:", error);
    return {
      total_installations: 0,
      active_stores: 0,
      total_webhooks: 0,
      popular_features: []
    };
  }
} 
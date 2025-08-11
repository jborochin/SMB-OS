import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, Banner, ProgressBar } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { InitialSyncService } from "../services/initial-sync.server.js";
import db from "../db.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Check if shop has been synced before
  const shop = await db.shop.findUnique({
    where: { domain: session.shop },
    include: {
      syncLogs: {
        where: { syncType: 'initial' },
        orderBy: { startedAt: 'desc' },
        take: 1
      }
    }
  });

  const hasInitialSync = shop?.lastSyncAt !== null;
  const lastSyncLog = shop?.syncLogs[0];

  return json({
    shop: session.shop,
    hasInitialSync,
    lastSyncLog: lastSyncLog ? {
      ...lastSyncLog,
      shopId: lastSyncLog.shopId.toString()
    } : null,
    shopData: shop ? {
      ...shop,
      shopifyId: shop.shopifyId.toString(),
      syncLogs: shop.syncLogs?.map(log => ({
        ...log,
        shopId: log.shopId.toString()
      }))
    } : null
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    console.log(`🚀 Starting initial sync for shop: ${session.shop}`);
    
    const syncService = new InitialSyncService(admin, session.shop);
    const result = await syncService.syncAllData();
    
    return json({ 
      success: result.success, 
      message: result.message || result.error,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Initial sync failed:", error);
    return json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export default function InitialSync() {
  const { shop, hasInitialSync, lastSyncLog, shopData } = useLoaderData();
  const actionData = useActionData();

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getSyncStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'critical';
      case 'started': return 'info';
      default: return 'warning';
    }
  };

  return (
    <Page title="Initial Data Sync">
      <BlockStack gap="500">
        {actionData && (
          <Banner
            title={actionData.success ? "Sync Completed" : "Sync Failed"}
            status={actionData.success ? "success" : "critical"}
          >
            <Text as="p">{actionData.message}</Text>
            <Text as="p" variant="bodySm">
              {formatDate(actionData.timestamp)}
            </Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Store Data Synchronization
            </Text>
            
            <Text as="p" variant="bodyMd">
              This will populate your database with all existing store data including:
            </Text>
            
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">• Products and variants ✅</Text>
              <Text as="p" variant="bodyMd">• Collections ✅</Text>
              <Text as="p" variant="bodyMd">• Shop information ✅</Text>
              <Text as="p" variant="bodyMd" tone="subdued">• Customers and addresses ⚠️ (Requires special approval)</Text>
              <Text as="p" variant="bodyMd" tone="subdued">• Orders and line items ⚠️ (Requires special approval)</Text>
            </BlockStack>

            <Banner status="info">
              <Text as="p">
                <strong>Note:</strong> Customer and order data require special approval from Shopify. 
                Currently only products, collections, and shop data are synced.
              </Text>
            </Banner>

            {hasInitialSync ? (
              <Banner status="success">
                <Text as="p">
                  Initial sync completed on {formatDate(shopData?.lastSyncAt)}
                </Text>
              </Banner>
            ) : (
              <Banner status="warning">
                <Text as="p">
                  No initial sync has been performed yet. Click the button below to start.
                </Text>
              </Banner>
            )}

            <Form method="post">
              <Button 
                submit 
                variant="primary"
                disabled={actionData?.success === false}
              >
                {hasInitialSync ? 'Re-sync All Data' : 'Start Initial Sync'}
              </Button>
            </Form>
          </BlockStack>
        </Card>

        {lastSyncLog && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Last Sync Status
              </Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Status:</strong> 
                  <span style={{ 
                    color: getSyncStatusColor(lastSyncLog.status) === 'success' ? '#008060' : 
                           getSyncStatusColor(lastSyncLog.status) === 'critical' ? '#D72C0D' : '#0070F3'
                  }}>
                    {lastSyncLog.status.toUpperCase()}
                  </span>
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Started:</strong> {formatDate(lastSyncLog.startedAt)}
                </Text>
                
                {lastSyncLog.completedAt && (
                  <Text as="p" variant="bodyMd">
                    <strong>Completed:</strong> {formatDate(lastSyncLog.completedAt)}
                  </Text>
                )}
                
                <Text as="p" variant="bodyMd">
                  <strong>Records Processed:</strong> {lastSyncLog.recordsProcessed}
                </Text>
                
                {lastSyncLog.recordsTotal > 0 && (
                  <Text as="p" variant="bodyMd">
                    <strong>Total Records:</strong> {lastSyncLog.recordsTotal}
                  </Text>
                )}
                
                {lastSyncLog.errorMessage && (
                  <Text as="p" variant="bodyMd" tone="critical">
                    <strong>Error:</strong> {lastSyncLog.errorMessage}
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {shopData && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Current Data Summary
              </Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Shop:</strong> {shopData.name} ({shopData.domain})
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Products:</strong> {shopData.products?.length || 0}
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Customers:</strong> {shopData.customers?.length || 0}
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Orders:</strong> {shopData.orders?.length || 0}
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Collections:</strong> {shopData.collections?.length || 0}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

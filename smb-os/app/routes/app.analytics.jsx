import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { 
  Page, 
  Card, 
  Text, 
  BlockStack, 
  InlineStack,
  Badge,
  Layout,
  LegacyCard,
  DataTable,
  Banner,
  Button
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getAnalyticsSummary } from "../services/analytics.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Get analytics summary
  const analyticsData = await getAnalyticsSummary();
  
  // Add some debug info
  console.log('📊 Analytics Dashboard - Shop:', session.shop);
  console.log('📊 Analytics Dashboard - Data:', analyticsData);
  
  return json({
    shop: session.shop,
    analytics: analyticsData
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  try {
    const formData = await request.formData();
    const action = formData.get("action");
    
    if (action === "test-analytics") {
      const { trackFeatureUsage } = await import("../services/analytics.server.js");
      
      // Test different feature usage events
      await trackFeatureUsage(session.shop, 'analytics_test', {
        test_type: 'manual_trigger',
        timestamp: new Date().toISOString()
      });
      
      return json({ 
        success: true, 
        message: "Test analytics event triggered successfully!" 
      });
    }
    
    return json({ success: false, message: "Unknown action" });
  } catch (error) {
    console.error("Analytics test failed:", error);
    return json({ success: false, message: error.message });
  }
};

export default function Analytics() {
  const { shop, analytics } = useLoaderData();
  const actionData = useActionData();

  return (
    <Page title="Analytics Dashboard">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData && (
              <Banner status={actionData.success ? "success" : "critical"}>
                <Text as="p">{actionData.message}</Text>
              </Banner>
            )}

            <Banner status="info">
              <Text as="p">
                <strong>Analytics Dashboard</strong> - Track app usage and store activity
              </Text>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  App Overview
                </Text>
                
                <InlineStack gap="400">
                  <LegacyCard sectioned>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Total Installations</Text>
                      <Text as="p" variant="headingLg">{analytics.total_installations}</Text>
                    </BlockStack>
                  </LegacyCard>
                  
                  <LegacyCard sectioned>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Active Stores</Text>
                      <Text as="p" variant="headingLg">{analytics.active_stores}</Text>
                    </BlockStack>
                  </LegacyCard>
                  
                  <LegacyCard sectioned>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Webhook Events</Text>
                      <Text as="p" variant="headingLg">{analytics.total_webhooks}</Text>
                    </BlockStack>
                  </LegacyCard>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Popular Features
                </Text>
                
                {analytics.popular_features.length > 0 ? (
                  <DataTable
                    columnContentTypes={['text', 'number']}
                    headings={['Feature', 'Usage Count']}
                    rows={analytics.popular_features.map(feature => [
                      feature.name,
                      feature.count.toString()
                    ])}
                  />
                ) : (
                  <Text as="p" variant="bodyMd">
                    No feature usage data available yet.
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Google Analytics Integration
                </Text>
                
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Measurement ID:</strong> G-B6JMRMQ46P
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Status:</strong> 
                    <Badge status="success">Active</Badge>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Tracked events include:
                  </Text>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">• App installations</Text>
                    <Text as="p" variant="bodyMd">• Store access</Text>
                    <Text as="p" variant="bodyMd">• Feature usage</Text>
                    <Text as="p" variant="bodyMd">• Webhook events</Text>
                    <Text as="p" variant="bodyMd">• Product creation via AI</Text>
                  </BlockStack>
                  
                  <Form method="post">
                    <input type="hidden" name="action" value="test-analytics" />
                    <Button submit variant="secondary">
                      Test Analytics Event
                    </Button>
                  </Form>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 
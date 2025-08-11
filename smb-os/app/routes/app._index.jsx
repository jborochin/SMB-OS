import { json } from "@remix-run/node";
import { useLoaderData, useActionData } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, InlineStack, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Get shop data from database
  const shopData = await db.shop.findUnique({
    where: { domain: session.shop },
    include: {
      _count: {
        select: {
          products: true,
          customers: true,
          orders: true
        }
      }
    }
  });

  // Convert BigInt values to strings to avoid serialization errors
  const serializedShopData = shopData ? {
    ...shopData,
    id: shopData.id.toString(),
    shopifyId: shopData.shopifyId ? shopData.shopifyId.toString() : null,
    createdAt: shopData.createdAt.toISOString(),
    updatedAt: shopData.updatedAt.toISOString(),
    lastSyncAt: shopData.lastSyncAt ? shopData.lastSyncAt.toISOString() : null,
    _count: shopData._count
  } : null;

  return json({ 
    shop: session.shop,
    shopData: serializedShopData,
    apiKey: process.env.SHOPIFY_API_KEY || "" 
  });
};

export const action = async ({ request }) => {
  console.log("🔍 CHILD ACTION: Called - Starting action");
  console.log("🔍 CHILD ACTION: Request URL:", request.url);
  console.log("🔍 CHILD ACTION: Request method:", request.method);
  
  try {
    const { admin, session } = await authenticate.admin(request);
    console.log("🔍 CHILD ACTION: Authentication successful");
    
    const formData = await request.formData();
    const action = formData.get("action");
    console.log("🔍 CHILD ACTION: Action type:", action);

    if (action === "test-webhook") {
      console.log("🔍 CHILD ACTION: Creating test product...");
      try {
        // Create a test product to trigger webhook
        const response = await admin.graphql(
          `#graphql
          mutation {
            productCreate(product: {
              title: "Test Product - ${new Date().toISOString()}"
              productType: "Test"
              vendor: "Webhook Test"
              status: ACTIVE
            }) {
              product {
                id
                title
              }
              userErrors {
                field
                message
              }
            }
          }`
        );
        
        const result = await response.json();
        console.log("🔍 CHILD ACTION: GraphQL result:", result);
        
        if (result.data.productCreate.userErrors.length > 0) {
          console.error("❌ CHILD ACTION: GraphQL errors:", result.data.productCreate.userErrors);
          return json({ 
            success: false, 
            error: result.data.productCreate.userErrors[0].message 
          });
        }
        
        console.log("✅ CHILD ACTION: Product created successfully");
        return json({ 
          success: true, 
          message: "Test product created! Check your server console for webhook logs.",
          product: result.data.productCreate.product
        });
      } catch (error) {
        console.error("❌ CHILD ACTION: Error creating product:", error);
        return json({ success: false, error: error.message });
      }
    }

    console.log("🔍 CHILD ACTION: Unknown action:", action);
    return json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("❌ CHILD ACTION: Authentication error:", error);
    return json({ success: false, error: "Authentication failed" });
  }
};

export default function Index() {
  const { shop, shopData, apiKey } = useLoaderData();
  const actionData = useActionData();

  return (
    <Page title="SMB-OS Dashboard">
      <BlockStack gap="500">
        {actionData && (
          <Banner status={actionData.success ? "success" : "critical"}>
            <Text as="p">
              {actionData.success ? actionData.message : actionData.error}
            </Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Shop Information</Text>
            <BlockStack gap="200">
              <Text as="p"><strong>Domain:</strong> {shop}</Text>
              <Text as="p"><strong>Database ID:</strong> {shopData?.id || "Not found"}</Text>
              <Text as="p"><strong>Products in DB:</strong> {shopData?._count?.products || 0}</Text>
              <Text as="p"><strong>Customers in DB:</strong> {shopData?._count?.customers || 0}</Text>
              <Text as="p"><strong>Orders in DB:</strong> {shopData?._count?.orders || 0}</Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Webhook Testing</Text>
            <Text as="p">
              Click the button below to create a test product. This will trigger the 
              <code>products/create</code> webhook and add the product to your database.
            </Text>
            <form method="post">
              <input type="hidden" name="action" value="test-webhook" />
              <Button submit variant="primary">
                Create Test Product & Trigger Webhook
              </Button>
            </form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Quick Links</Text>
            <InlineStack gap="300">
              <Button url="/app/debug/webhook-test" variant="secondary">
                Webhook Debug
              </Button>
              <Button url="/app/initial-sync" variant="secondary">
                Initial Sync
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

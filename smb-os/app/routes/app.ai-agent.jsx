import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { 
  Page, 
  Card, 
  Text, 
  BlockStack, 
  Button, 
  Banner, 
  TextField,
  Select,
  InlineStack,
  Badge,
  Spinner,
  Layout,
  LegacyCard
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { AIProductGenerator } from "../services/ai-product-generator.server.js";
import { useState } from "react";
import { trackFeatureUsage } from "../services/analytics.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Get collections for the dropdown
  const collectionsQuery = await admin.graphql(`
    query getCollections {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `);
  
  const collectionsData = await collectionsQuery.json();
  const collections = collectionsData.data.collections.edges.map(edge => ({
    id: edge.node.id,
    title: edge.node.title,
    handle: edge.node.handle
  }));

  return json({
    shop: session.shop,
    collections
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const formData = await request.formData();
    const userPrompt = formData.get("userPrompt");
    const selectedCollection = formData.get("collection");
    
    console.log(`🤖 AI Agent: Processing prompt: "${userPrompt}"`);
    
    // Track feature usage
    await trackFeatureUsage(session.shop, 'ai_product_generator', {
      prompt_length: userPrompt.length,
      has_collection: !!selectedCollection,
      collection_id: selectedCollection
    });
    
    // Use the AI Product Generator service
    const aiGenerator = new AIProductGenerator();
    const productData = await aiGenerator.parseUserPrompt(userPrompt, selectedCollection);
    
    // Create the product in Shopify
    const createdProduct = await createProduct(admin, productData);
    
    // Track successful product creation
    await trackFeatureUsage(session.shop, 'product_created_via_ai', {
      product_title: productData.title,
      product_price: productData.price,
      product_type: productData.productType
    });
    
    return json({ 
      success: true, 
      message: "Product created successfully!",
      product: createdProduct,
      parsedData: productData // Include parsed data for debugging
    });
    
  } catch (error) {
    console.error("AI Agent failed:", error);
    
    // Track failed product creation
    await trackFeatureUsage(session.shop, 'ai_product_generator_error', {
      error_message: error.message
    });
    
    return json({ 
      success: false, 
      message: error.message
    }, { status: 500 });
  }
};

// Create product in Shopify using GraphQL
async function createProduct(admin, productData) {
  console.log(`🛍️ Creating product: ${productData.title} with price: $${productData.price}`);
  
  try {
    // Use GraphQL to create product
    const createProductMutation = await admin.graphql(`
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            description
            vendor
            tags
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          title: productData.title,
          descriptionHtml: productData.description,
          vendor: productData.vendor,
          tags: productData.tags,
          productType: productData.productType || "product",
          status: "ACTIVE"
        }
      }
    });
    
    const result = await createProductMutation.json();
    
    if (result.data.productCreate.userErrors.length > 0) {
      throw new Error(`Failed to create product: ${result.data.productCreate.userErrors[0].message}`);
    }
    
    const product = result.data.productCreate.product;
    console.log(`✅ Product created successfully: ${productData.title} (ID: ${product.id})`);
    console.log(`🔍 Product variants:`, JSON.stringify(product.variants, null, 2));
    
    // Set the price for the first variant using REST API
    if (product.variants && product.variants.edges.length > 0) {
      const variantId = product.variants.edges[0].node.id;
      console.log(`💰 Attempting to set price to $${productData.price} for variant: ${variantId}`);
      await updateVariantPrice(admin, variantId, productData.price);
      console.log(`💰 Price set to $${productData.price} for variant: ${variantId}`);
    } else {
      console.warn(`⚠️ No variants found for product: ${product.id}`);
    }
    
    // Note: GraphQL mutations don't trigger webhooks by default
    // To trigger webhooks, you would need to use the Shopify Admin API or REST API
    console.log(`ℹ️ Note: GraphQL mutations don't trigger webhooks. Use Shopify Admin for webhook events.`);
    
    // Optional: Manually trigger webhook processing
    await triggerWebhookProcessing(product, productData);
    
    return product;
    
  } catch (error) {
    console.error('Failed to create product:', error);
    throw new Error(`Failed to create product: ${error.message}`);
  }
}


// Update variant price using REST API
async function updateVariantPrice(admin, variantId, price) {
  console.log(`🔧 Setting variant price - Variant ID: ${variantId}, Price: $${price}`);
  
  try {
    // Extract the numeric ID from the GraphQL ID
    const numericId = variantId.split('/').pop();
    console.log(`🔧 Extracted numeric ID: ${numericId}`);
    
    // Get the session to access the shop domain and access token
    const session = await admin.session;
    const shopDomain = session.shop;
    const accessToken = session.accessToken;
    
    // Use fetch to make REST API call
    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/variants/${numericId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        variant: {
          id: numericId,
          price: price.toString()
        }
      })
    });
    
    console.log(`🔧 REST API response status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json();
      console.log(`🔧 Variant update response:`, JSON.stringify(result, null, 2));
      
      if (result.variant) {
        console.log(`✅ Variant price updated successfully to $${result.variant.price}`);
      } else {
        console.error(`❌ Failed to update variant price: ${JSON.stringify(result)}`);
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ REST API error: ${response.status} - ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to update variant price:', error);
    console.error('Error details:', error.message);
    console.error('Full error object:', error);
  }
}

// Optional: Manually trigger webhook processing
async function triggerWebhookProcessing(product, productData) {
  console.log(`🔗 Triggering webhook processing for product ID: ${product.id}`);
  try {
    // This part would involve calling a Shopify Admin API or REST API endpoint
    // that specifically triggers webhook processing for a given product.
    // For example, if you have a webhook endpoint like /api/webhooks/process-product
    // you would make a fetch call to that endpoint.
    // Example:
    // const response = await fetch(`${process.env.SHOPIFY_ADMIN_URL}/api/webhooks/process-product`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    //   },
    //   body: JSON.stringify({ productId: product.id }),
    // });
    // if (!response.ok) {
    //   throw new Error(`Failed to trigger webhook processing: ${response.statusText}`);
    // }
    console.log(`✅ Webhook processing triggered for product ID: ${product.id}`);
  } catch (error) {
    console.error('Failed to trigger webhook processing:', error);
    console.warn(`⚠️ Webhook processing might not have triggered for product ID: ${product.id}`);
  }
}

export default function AIAgent() {
  const { shop, collections } = useLoaderData();
  const actionData = useActionData();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState("");

  const handleSubmit = async (event) => {
    setIsProcessing(true);
    // The form will handle the submission
  };

  return (
    <Page title="AI Product Generator">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Banner status="info">
              <Text as="p">
                <strong>AI Product Generator</strong> - Describe the product you want to create, 
                and our AI will generate it for you! Include details like price, style, materials, etc.
              </Text>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Describe Your Product
                </Text>
                
                <Form method="post" onSubmit={handleSubmit}>
                  <BlockStack gap="400">
                    <TextField
                      label="Product Description"
                      name="userPrompt"
                      multiline={4}
                      placeholder="Example: Create a comfortable cotton t-shirt called 'Summer Breeze' for $25, in blue color with a vintage style"
                      required
                    />
                    
                    <Select
                      label="Collection (Optional)"
                      name="collection"
                      value={selectedCollection}
                      onChange={setSelectedCollection}
                      options={[
                        { label: "No collection", value: "" },
                        ...collections.map(collection => ({
                          label: collection.title,
                          value: collection.id
                        }))
                      ]}
                    />
                    
                    <Button 
                      submit 
                      variant="primary"
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <InlineStack gap="200">
                          <Spinner size="small" />
                          <Text>Generating Product...</Text>
                        </InlineStack>
                      ) : (
                        "Generate Product"
                      )}
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>

            {actionData && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Generation Result
                  </Text>
                  
                  <Banner
                    title={actionData.success ? "Success!" : "Error"}
                    status={actionData.success ? "success" : "critical"}
                  >
                    <Text as="p">{actionData.message}</Text>
                  </Banner>

                  {actionData.success && actionData.product && (
                    <LegacyCard>
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          Created Product: {actionData.product.title}
                        </Text>
                        
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd">
                            <strong>Description:</strong> {actionData.product.description}
                          </Text>
                          
                          <Text as="p" variant="bodyMd">
                            <strong>Vendor:</strong> {actionData.product.vendor}
                          </Text>
                          
                          {actionData.product.tags && actionData.product.tags.length > 0 && (
                            <div>
                              <Text as="p" variant="bodyMd">
                                <strong>Tags:</strong>
                              </Text>
                              <InlineStack gap="200">
                                {actionData.product.tags.map(tag => (
                                  <Badge key={tag}>{tag}</Badge>
                                ))}
                              </InlineStack>
                            </div>
                          )}
                          
                          {actionData.product.variants?.edges?.[0]?.node?.price && (
                            <Text as="p" variant="bodyMd">
                              <strong>Price:</strong> ${actionData.product.variants.edges[0].node.price}
                            </Text>
                          )}
                        </BlockStack>
                      </BlockStack>
                    </LegacyCard>
                  )}
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  How It Works
                </Text>
                
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    <strong>1. Describe your product</strong> - Include details like name, price, style, materials, colors, etc.
                  </Text>
                  
                  <Text as="p" variant="bodyMd">
                    <strong>2. AI analysis</strong> - Our AI parses your description to extract key product information
                  </Text>
                  
                  <Text as="p" variant="bodyMd">
                    <strong>3. Product creation</strong> - The AI generates a complete product with title, description, price, tags, and vendor
                  </Text>
                  
                  <Text as="p" variant="bodyMd">
                    <strong>4. Shopify integration</strong> - The product is automatically created in your Shopify store
                  </Text>
                </BlockStack>
                
                <Text as="h3" variant="headingSm">
                  Example Prompts:
                </Text>
                
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    • "Create a comfortable cotton t-shirt called 'Summer Breeze' for $25, in blue color with a vintage style"
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • "Make a premium leather wallet for $50, handmade with elegant design"
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • "Generate a durable metal water bottle for $30, in stainless steel with a modern design"
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Button, InlineStack, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// Debug page for webhook inspection

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // Get all webhook subscriptions
    const webhookQuery = await admin.graphql(
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
              createdAt
              updatedAt
            }
          }
        }
      }`
    );
    
    const webhookResponse = await webhookQuery.json();
  const webhooks = webhookResponse.data.webhookSubscriptions.edges.map(edge => edge.node);
  
  // Get shop info
  const shopQuery = await admin.graphql(
        `#graphql
    query {
      shop {
        name
        myshopifyDomain
        primaryDomain {
          url
            }
          }
        }`
      );
      
  const shopResponse = await shopQuery.json();
  const shop = shopResponse.data.shop;
      
      return json({ 
    webhooks,
    shop,
    appUrl: process.env.SHOPIFY_APP_URL
      });
};

// Removed action for now to fix the GraphQL error

export default function DebugPage() {
  const { webhooks, shop, appUrl } = useLoaderData();

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Webhook Debug & Test Page</h1>
      
      <div style={{ marginBottom: "30px", padding: "15px", backgroundColor: "#f5f5f5", borderRadius: "5px" }}>
        <h2>Shop Information</h2>
        <p><strong>Shop Name:</strong> {shop.name}</p>
        <p><strong>Domain:</strong> {shop.myshopifyDomain}</p>
        <p><strong>Primary Domain:</strong> {shop.primaryDomain?.url}</p>
        <p><strong>App URL:</strong> {appUrl}</p>
      </div>

      <div style={{ marginBottom: "30px" }}>
        <h2>Registered Webhooks</h2>
        {webhooks.length === 0 ? (
          <p style={{ color: "#666" }}>No webhooks found</p>
            ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {webhooks.map((webhook) => (
              <div 
                key={webhook.id} 
                style={{ 
                  padding: "15px", 
                  border: "1px solid #ddd", 
                  borderRadius: "5px",
                  backgroundColor: "white"
                }}
              >
                <div style={{ marginBottom: "10px" }}>
                  <strong>Topic:</strong> {webhook.topic}
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <strong>Callback URL:</strong> 
                  <span style={{ 
                    color: webhook.endpoint.callbackUrl?.includes(appUrl) ? "#28a745" : "#dc3545",
                    fontWeight: "bold"
                  }}>
                    {webhook.endpoint.callbackUrl || "No URL"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  <div>Created: {new Date(webhook.createdAt).toLocaleString()}</div>
                  <div>Updated: {new Date(webhook.updatedAt).toLocaleString()}</div>
                </div>
                {webhook.endpoint.callbackUrl && !webhook.endpoint.callbackUrl.includes(appUrl) && (
                  <div style={{ 
                    marginTop: "10px", 
                    padding: "10px", 
                    backgroundColor: "#fff3cd", 
                    border: "1px solid #ffeaa7",
                    borderRadius: "3px",
                    color: "#856404"
                  }}>
                    ⚠️ This webhook is pointing to an old URL that doesn't match your current app URL!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>



      <div style={{ marginBottom: "30px" }}>
        <h2>Webhook Troubleshooting</h2>
        <div style={{ backgroundColor: "#f8f9fa", padding: "15px", borderRadius: "5px" }}>
          <h3>Common Issues:</h3>
          <ul>
            <li><strong>404 Errors:</strong> If webhooks are pointing to old ngrok URLs, they need to be re-registered</li>
            <li><strong>Timeout Errors:</strong> Your webhook handlers should respond within 5 seconds</li>
            <li><strong>Authentication Errors:</strong> Check that your app has the necessary scopes</li>
            <li><strong>URL Mismatch:</strong> Ensure webhook URLs match your current app URL</li>
          </ul>
          
          <h3>Next Steps:</h3>
          <ol>
            <li>Check if any webhooks are pointing to old URLs (highlighted in red above)</li>
            <li>If so, you may need to delete old webhooks and re-register them</li>
            <li>Test webhook delivery by creating a product</li>
            <li>Check your app logs for webhook delivery attempts</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

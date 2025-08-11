import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { json } from "@remix-run/node";
import { trackAppInstallation, trackStoreEvent } from "../services/analytics.server.js";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // Ensure shop exists in database
  if (session) {
    try {
      const shopData = await db.shop.upsert({
        where: { domain: session.shop },
        update: {
          name: session.shop.split('.')[0], // Extract shop name from domain
          domain: session.shop,
          email: session.email,
          updatedAt: new Date()
        },
        create: {
          name: session.shop.split('.')[0], // Extract shop name from domain
          domain: session.shop,
          email: session.email,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`✅ Shop ensured in database: ${session.shop} (ID: ${shopData.id})`);

          // Track app installation/access
          await trackAppInstallation(session.shop, session);
          await trackStoreEvent(session.shop, 'app_access', {
            shop_id: shopData.id,
            user_email: session.email
          });

          // Always register webhooks, even if already registered
          try {
            const { registerWebhooks } = await import("../webhook-registration.js");
            await registerWebhooks(admin, session.shop);
            console.log(`✅ Webhooks registered for ${session.shop}`);
          } catch (webhookError) {
            console.error('❌ Error registering webhooks:', webhookError);
          }
    } catch (error) {
      console.error('Error ensuring shop in database:', error);
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const action = async ({ request }) => {
  console.log("🔍 PARENT ACTION: Called - Delegating to child");
  try {
    // Delegate to the child route's action
    const { action } = await import("./app._index.jsx");
    console.log("🔍 PARENT ACTION: Import successful");
    return action({ request });
  } catch (error) {
    console.error("❌ PARENT ACTION: Error delegating to child route:", error);
    throw error;
  }
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/additional">Additional page</Link>
        <Link to="/app/ai-agent">AI Product Generator</Link>
        <Link to="/app/seo-optimizer">AI SEO Optimizer</Link>
        <Link to="/app/debug/webhook-test">Debug</Link>
        <Link to="/app/initial-sync">Sync</Link>
        <Link to="/app/analytics">Analytics</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import { authenticate } from "../shopify.server";
import fs from "fs/promises";
import path from "path";
import { trackWebhookEvent } from "../services/analytics.server.js";
import db from "../db.server";

export const loader = async ({ request }) => {
  return new Response("Product create webhook endpoint", { status: 200 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    // Track webhook event
    await trackWebhookEvent(shop, topic, {
      product_id: payload.id,
      product_title: payload.title,
      product_type: payload.product_type
    });

    // --- Write product to database ---
    const dbShop = await db.shop.findUnique({
      where: { domain: shop }
    });

    if (dbShop) {
      const productId = BigInt(payload.id);
      // Upsert product
      const product = await db.product.upsert({
        where: { productId },
        update: {
          title: payload.title,
          handle: payload.handle,
          vendor: payload.vendor,
          status: payload.status ? payload.status.toLowerCase() : "active",
          updatedAt: new Date(payload.updated_at || payload.created_at)
        },
        create: {
          productId,
          shopId: dbShop.id,
          title: payload.title,
          handle: payload.handle,
          vendor: payload.vendor,
          status: payload.status ? payload.status.toLowerCase() : "active",
          createdAt: new Date(payload.created_at),
          updatedAt: new Date(payload.updated_at || payload.created_at)
        }
      });

      // Upsert variants
      if (payload.variants && payload.variants.length > 0) {
        for (const variant of payload.variants) {
          const variantId = BigInt(variant.id);
          await db.productVariant.upsert({
            where: { variantId },
            update: {
              title: variant.title,
              price: parseFloat(variant.price),
              sku: variant.sku,
              inventoryQuantity: variant.inventory_quantity,
              updatedAt: new Date(variant.updated_at || variant.created_at)
            },
            create: {
              variantId,
              productId: product.id,
              title: variant.title,
              price: parseFloat(variant.price),
              sku: variant.sku,
              inventoryQuantity: variant.inventory_quantity,
              createdAt: new Date(variant.created_at),
              updatedAt: new Date(variant.updated_at || variant.created_at)
            }
          });
        }
      }

      // Upsert images
      if (payload.images && payload.images.length > 0) {
        for (const image of payload.images) {
          const imageId = BigInt(image.id);
          await db.productImage.upsert({
            where: { imageId },
            update: {
              alt: image.alt,
              width: image.width,
              height: image.height,
              src: image.src,
              updatedAt: new Date()
            },
            create: {
              imageId,
              productId: product.id,
              alt: image.alt,
              width: image.width,
              height: image.height,
              src: image.src
            }
          });
        }
      }
    } else {
      console.error(`Shop not found in database: ${shop}`);
    }
    // --- End database logic ---

    // Queue the payload for later processing (append to a file for demo)
    const queuePath = path.resolve("./webhook-queue-products-create.jsonl");
    const record = JSON.stringify({ receivedAt: new Date().toISOString(), topic, shop, payload }) + "\n";
    await fs.appendFile(queuePath, record, "utf8");
    // Respond immediately
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
};

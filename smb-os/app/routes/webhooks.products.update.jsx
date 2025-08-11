import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  return new Response("Product update webhook endpoint", { status: 200 });
};

export const action = async ({ request }) => {
  console.log("🔍 WEBHOOK: Product Updated");
  
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    // Get shop from database
    const dbShop = await db.shop.findUnique({
      where: { domain: shop }
    });

    if (!dbShop) {
      console.error(`Shop not found in database: ${shop}`);
      return new Response("Shop not found", { status: 404 });
    }

    // Update product in database
    const productId = BigInt(payload.id);
    
    const product = await db.product.upsert({
      where: { productId },
      update: {
        title: payload.title,
        handle: payload.handle,
        vendor: payload.vendor,
        status: payload.status.toLowerCase(),
        updatedAt: new Date(payload.updated_at)
      },
      create: {
        productId,
        shopId: dbShop.id,
        title: payload.title,
        handle: payload.handle,
        vendor: payload.vendor,
        status: payload.status.toLowerCase(),
        createdAt: new Date(payload.created_at),
        updatedAt: new Date(payload.updated_at)
      }
    });

    // Update variants
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
            updatedAt: new Date(variant.updated_at)
          },
          create: {
            variantId,
            productId: product.id,
            title: variant.title,
            price: parseFloat(variant.price),
            sku: variant.sku,
            inventoryQuantity: variant.inventory_quantity,
            createdAt: new Date(variant.created_at),
            updatedAt: new Date(variant.updated_at)
          }
        });
      }
    }

    // Update images
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

    console.log(`✅ Product updated: ${payload.title} (ID: ${payload.id})`);
    return new Response();
    
  } catch (error) {
    console.error("❌ Product update webhook failed:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
};

import { PrismaClient } from '@prisma/client';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('./.env') });

const prisma = new PrismaClient();

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.January25,
});

async function syncShop(shop) {
  console.log(`🔄 Syncing shop: ${shop.domain}`);
  try {
    // Get access token for the shop
    const session = await prisma.session.findFirst({ where: { shop: shop.domain } });
    if (!session) {
      console.warn(`⚠️  No session found for shop: ${shop.domain}`);
      return;
    }
    const accessToken = session.accessToken;
    const client = new shopify.rest.RestClient(shop.domain, accessToken);

    // --- PRODUCTS ---
    const products = await client.get({ path: 'products', query: { limit: 250 } });
    for (const product of products.body.products) {
      await prisma.product.upsert({
        where: { productId: BigInt(product.id) },
        update: {
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          status: product.status,
          updatedAt: new Date(product.updated_at)
        },
        create: {
          productId: BigInt(product.id),
          shopId: shop.id,
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          status: product.status,
          createdAt: new Date(product.created_at),
          updatedAt: new Date(product.updated_at)
        }
      });
    }
    console.log(`✅ Synced ${products.body.products.length} products for ${shop.domain}`);

    // --- CUSTOMERS ---
    const customers = await client.get({ path: 'customers', query: { limit: 250 } });
    for (const customer of customers.body.customers) {
      await prisma.customer.upsert({
        where: { customerId: BigInt(customer.id) },
        update: {
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          phone: customer.phone,
          totalSpent: parseFloat(customer.total_spent),
          ordersCount: customer.orders_count,
          updatedAt: new Date(customer.updated_at)
        },
        create: {
          customerId: BigInt(customer.id),
          shopId: shop.id,
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          phone: customer.phone,
          totalSpent: parseFloat(customer.total_spent),
          ordersCount: customer.orders_count,
          createdAt: new Date(customer.created_at),
          updatedAt: new Date(customer.updated_at)
        }
      });
    }
    console.log(`✅ Synced ${customers.body.customers.length} customers for ${shop.domain}`);

    // --- ORDERS ---
    const orders = await client.get({ path: 'orders', query: { limit: 250, status: 'any' } });
    for (const order of orders.body.orders) {
      await prisma.order.upsert({
        where: { orderId: BigInt(order.id) },
        update: {
          orderNumber: order.name,
          email: order.email,
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          totalPrice: parseFloat(order.total_price),
          currency: order.currency,
          updatedAt: new Date(order.updated_at)
        },
        create: {
          orderId: BigInt(order.id),
          shopId: shop.id,
          orderNumber: order.name,
          email: order.email,
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          totalPrice: parseFloat(order.total_price),
          currency: order.currency,
          createdAt: new Date(order.created_at),
          updatedAt: new Date(order.updated_at)
        }
      });
      // Optionally, sync order items (line_items)
      // You can expand this to upsert order items as well
    }
    console.log(`✅ Synced ${orders.body.orders.length} orders for ${shop.domain}`);

  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.error(`❌ 401 Unauthorized for shop ${shop.domain}. Removing session.`);
      await prisma.session.deleteMany({ where: { shop: shop.domain } });
      // Optionally, mark shop as disconnected
      await prisma.shop.update({
        where: { id: shop.id },
        data: { disconnected: true }
      });
    } else {
      console.error(`❌ Error syncing shop ${shop.domain}:`, err);
    }
  }
}

async function main() {
  const shops = await prisma.shop.findMany();
  for (const shop of shops) {
    await syncShop(shop);
  }
  await prisma.$disconnect();
}

await main(); 
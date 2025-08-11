import db from "../db.server.js";

/**
 * Initial sync service to populate database with all store data
 * Called when a store first installs the app
 */
export class InitialSyncService {
  constructor(admin, shopDomain) {
    this.admin = admin;
    this.shopDomain = shopDomain;
    this.shopId = null;
  }

  /**
   * Main sync function - orchestrates all data syncing
   */
  async syncAllData() {
    console.log(`🚀 Starting initial sync for shop: ${this.shopDomain}`);
    
    try {
      // First, sync shop data and get shop ID
      await this.syncShopData();
      
      // Then sync all other data in parallel for better performance
      // Note: Customer and order sync require special approval from Shopify
      // so we're skipping them for now
      const syncPromises = [
        this.syncProducts(),
        // this.syncCustomers(), // Requires special approval
        // this.syncOrders(),   // Requires special approval
        this.syncCollections()
      ];

      await Promise.allSettled(syncPromises);
      
      // Update last sync timestamp
      await db.shop.update({
        where: { domain: this.shopDomain },
        data: { lastSyncAt: new Date() }
      });

      console.log(`✅ Initial sync completed for shop: ${this.shopDomain}`);
      console.log(`ℹ️ Note: Customer and order sync require special approval from Shopify`);
      console.log(`ℹ️ Only products, collections, and shop data were synced`);
      return { success: true, message: "Initial sync completed successfully (products, collections, and shop data only)" };
      
    } catch (error) {
      console.error(`❌ Initial sync failed for shop: ${this.shopDomain}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync shop information
   */
  async syncShopData() {
    try {
      const shopQuery = await this.admin.graphql(`
        query getShop {
          shop {
            id
            name
            myshopifyDomain
            email
            currencyCode
            ianaTimezone
            plan {
              displayName
            }
            billingAddress {
              address1
              address2
              city
              province
              zip
              country
            }
            createdAt
          }
        }
      `);

      const shopData = await shopQuery.json();
      const shop = shopData.data.shop;

      // Upsert shop data
      const dbShop = await db.shop.upsert({
        where: { domain: this.shopDomain },
        update: {
          shopifyId: BigInt(shop.id.replace('gid://shopify/Shop/', '')),
          name: shop.name,
          email: shop.email,
          currency: shop.currencyCode,
          updatedAt: new Date()
        },
        create: {
          shopifyId: BigInt(shop.id.replace('gid://shopify/Shop/', '')),
          name: shop.name,
          domain: this.shopDomain,
          email: shop.email,
          currency: shop.currencyCode
        }
      });

      this.shopId = dbShop.id;
      
      // Create and complete sync log after shop is created
      const syncLog = await this.createSyncLog('shop', 'initial');
      await this.completeSyncLog(syncLog.id, 1, 1);
      console.log(`✅ Shop data synced for: ${this.shopDomain}`);
      
    } catch (error) {
      console.error(`❌ Shop sync failed for: ${this.shopDomain}`, error);
      throw error;
    }
  }

  /**
   * Sync all products and their variants
   */
  async syncProducts() {
    const syncLog = await this.createSyncLog('products', 'initial');
    let cursor = null;
    let totalProducts = 0;
    
    try {
      do {
        const productsQuery = await this.admin.graphql(`
          query getProducts($cursor: String) {
            products(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  title
                  handle
                  vendor
                  status
                  createdAt
                  updatedAt
                  variants(first: 100) {
                    edges {
                      node {
                        id
                        title
                        price
                        sku
                        inventoryQuantity
                        createdAt
                        updatedAt
                      }
                    }
                  }
                  images(first: 10) {
                    edges {
                      node {
                        id
                        altText
                        width
                        height
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        `, {
          variables: cursor ? { cursor } : {}
        });

        const productsData = await productsQuery.json();
        const products = productsData.data.products.edges;

        for (const productEdge of products) {
          const product = productEdge.node;
          await this.syncSingleProduct(product);
          totalProducts++;
        }

        cursor = productsData.data.products.pageInfo.hasNextPage 
          ? productsData.data.products.pageInfo.endCursor 
          : null;

        // Update progress
        await this.updateSyncLog(syncLog.id, totalProducts);
        
      } while (cursor);

      await this.completeSyncLog(syncLog.id, totalProducts, totalProducts);
      console.log(`✅ Synced ${totalProducts} products`);
      
    } catch (error) {
      await this.failSyncLog(syncLog.id, error.message);
      throw error;
    }
  }

  /**
   * Sync a single product with its variants and images
   */
  async syncSingleProduct(productData) {
    const productId = BigInt(productData.id.replace('gid://shopify/Product/', ''));
    
    // Upsert product
    const product = await db.product.upsert({
      where: { productId },
      update: {
        title: productData.title,
        handle: productData.handle,
        vendor: productData.vendor,
        status: productData.status.toLowerCase(),
        updatedAt: new Date(productData.updatedAt)
      },
      create: {
        productId,
        shopId: this.shopId,
        title: productData.title,
        handle: productData.handle,
        vendor: productData.vendor,
        status: productData.status.toLowerCase(),
        createdAt: new Date(productData.createdAt),
        updatedAt: new Date(productData.updatedAt)
      }
    });

    // Sync variants
    for (const variantEdge of productData.variants.edges) {
      const variant = variantEdge.node;
      const variantId = BigInt(variant.id.replace('gid://shopify/ProductVariant/', ''));
      
      await db.productVariant.upsert({
        where: { variantId },
        update: {
          title: variant.title,
          price: parseFloat(variant.price),
          sku: variant.sku,
          inventoryQuantity: variant.inventoryQuantity,
          updatedAt: new Date(variant.updatedAt)
        },
        create: {
          variantId,
          productId: product.id,
          title: variant.title,
          price: parseFloat(variant.price),
          sku: variant.sku,
          inventoryQuantity: variant.inventoryQuantity,
          createdAt: new Date(variant.createdAt),
          updatedAt: new Date(variant.updatedAt)
        }
      });
    }

    // Sync images
    for (const imageEdge of productData.images.edges) {
      const image = imageEdge.node;
      const imageId = BigInt(image.id.replace('gid://shopify/ProductImage/', ''));
      
      await db.productImage.upsert({
        where: { imageId },
        update: {
          alt: image.altText,
          width: image.width,
          height: image.height,
          src: image.url,
          updatedAt: new Date()
        },
        create: {
          imageId,
          productId: product.id,
          alt: image.altText,
          width: image.width,
          height: image.height,
          src: image.url
        }
      });
    }
  }

  /**
   * Sync all customers
   */
  async syncCustomers() {
    const syncLog = await this.createSyncLog('customers', 'initial');
    let cursor = null;
    let totalCustomers = 0;
    
    try {
      console.log(`🔄 Starting customer sync for shop: ${this.shopDomain}`);
      
      do {
        const customersQuery = await this.admin.graphql(`
          query getCustomers($cursor: String) {
            customers(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  firstName
                  lastName
                  email
                  phone
                  emailMarketingConsent {
                    marketingState
                    marketingOptInLevel
                  }
                  state
                  note
                  tags
                  taxExempt
                  createdAt
                  updatedAt
                  addresses {
                    id
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                    name
                    provinceCode
                    countryCode
                  }
                }
              }
            }
          }
        `, {
          variables: cursor ? { cursor } : {}
        });

        const customersData = await customersQuery.json();
        
        // Check for GraphQL errors
        if (customersData.errors) {
          console.error(`❌ GraphQL errors in customer sync:`, customersData.errors);
          throw new Error(`GraphQL errors: ${JSON.stringify(customersData.errors)}`);
        }
        
        const customers = customersData.data.customers.edges;
        console.log(`📋 Processing ${customers.length} customers...`);

        for (const customerEdge of customers) {
          const customer = customerEdge.node;
          try {
          await this.syncSingleCustomer(customer);
          totalCustomers++;
          } catch (error) {
            console.error(`❌ Error syncing customer ${customer.id}:`, error);
            // Continue with other customers
          }
        }

        cursor = customersData.data.customers.pageInfo.hasNextPage 
          ? customersData.data.customers.pageInfo.endCursor 
          : null;

        await this.updateSyncLog(syncLog.id, totalCustomers);
        
      } while (cursor);

      await this.completeSyncLog(syncLog.id, totalCustomers, totalCustomers);
      console.log(`✅ Synced ${totalCustomers} customers`);
      
    } catch (error) {
      console.error(`❌ Customer sync failed for shop: ${this.shopDomain}`, error);
      await this.failSyncLog(syncLog.id, error.message);
      throw error;
    }
  }

  /**
   * Sync a single customer with addresses
   */
  async syncSingleCustomer(customerData) {
    const customerId = BigInt(customerData.id.replace('gid://shopify/Customer/', ''));
    
    // Upsert customer
    const customer = await db.customer.upsert({
      where: { customerId },
      update: {
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        email: customerData.email,
        phone: customerData.phone,
        totalSpent: null, // This field is not available in the API
        ordersCount: null, // This field is not available in the API
        updatedAt: new Date(customerData.updatedAt)
      },
      create: {
        customerId,
        shopId: this.shopId,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        email: customerData.email,
        phone: customerData.phone,
        totalSpent: null, // This field is not available in the API
        ordersCount: null, // This field is not available in the API
        createdAt: new Date(customerData.createdAt),
        updatedAt: new Date(customerData.updatedAt)
      }
    });

    // Sync addresses
    for (const address of customerData.addresses) {
      const addressId = BigInt(address.id.replace('gid://shopify/MailingAddress/', ''));
      
      await db.customerAddress.upsert({
        where: { addressId },
        update: {
          firstName: address.firstName,
          lastName: address.lastName,
          company: address.company,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: address.province,
          country: address.country,
          zip: address.zip,
          phone: address.phone,
          name: address.name,
          provinceCode: address.provinceCode,
          countryCode: address.countryCode,
          default: false // This field is not available in the API, default to false
        },
        create: {
          addressId,
          customerId: customer.id,
          firstName: address.firstName,
          lastName: address.lastName,
          company: address.company,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: address.province,
          country: address.country,
          zip: address.zip,
          phone: address.phone,
          name: address.name,
          provinceCode: address.provinceCode,
          countryCode: address.countryCode,
          default: false // This field is not available in the API, default to false
        }
      });
    }
  }

  /**
   * Sync all orders
   */
  async syncOrders() {
    const syncLog = await this.createSyncLog('orders', 'initial');
    let cursor = null;
    let totalOrders = 0;
    
    try {
      console.log(`🔄 Starting order sync for shop: ${this.shopDomain}`);
      
      do {
        const ordersQuery = await this.admin.graphql(`
          query getOrders($cursor: String) {
            orders(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  name
                  email
                  currencyCode
                  test
                  totalPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  subtotalPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  totalWeight
                  totalTaxSet {
                    shopMoney {
                      amount
                    }
                  }
                  taxesIncluded
                  totalDiscountsSet {
                    shopMoney {
                      amount
                    }
                  }
                  note
                  phone
                  cancelledAt
                  cancelReason
                  processedAt
                  tags
                  createdAt
                  updatedAt
                  customer {
                    id
                  }
                  lineItems(first: 100) {
                    edges {
                      node {
                        id
                        quantity
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                          }
                        }
                        variant {
                          id
                        }
                        product {
                          id
                        }
                      }
                    }
                  }
                  shippingAddress {
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                    name
                    countryCodeV2
                    provinceCode
                    latitude
                    longitude
                  }
                  billingAddress {
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    phone
                    name
                    countryCodeV2
                    provinceCode
                    latitude
                    longitude
                  }
                }
              }
            }
          }
        `, {
          variables: cursor ? { cursor } : {}
        });

        const ordersData = await ordersQuery.json();
        
        // Check for GraphQL errors
        if (ordersData.errors) {
          console.error(`❌ GraphQL errors in order sync:`, ordersData.errors);
          throw new Error(`GraphQL errors: ${JSON.stringify(ordersData.errors)}`);
        }
        
        const orders = ordersData.data.orders.edges;
        console.log(`📋 Processing ${orders.length} orders...`);

        for (const orderEdge of orders) {
          const order = orderEdge.node;
          try {
          await this.syncSingleOrder(order);
          totalOrders++;
          } catch (error) {
            console.error(`❌ Error syncing order ${order.id}:`, error);
            // Continue with other orders
          }
        }

        cursor = ordersData.data.orders.pageInfo.hasNextPage 
          ? ordersData.data.orders.pageInfo.endCursor 
          : null;

        await this.updateSyncLog(syncLog.id, totalOrders);
        
      } while (cursor);

      await this.completeSyncLog(syncLog.id, totalOrders, totalOrders);
      console.log(`✅ Synced ${totalOrders} orders`);
      
    } catch (error) {
      console.error(`❌ Order sync failed for shop: ${this.shopDomain}`, error);
      await this.failSyncLog(syncLog.id, error.message);
      throw error;
    }
  }

  /**
   * Sync a single order with line items and addresses
   */
  async syncSingleOrder(orderData) {
    const orderId = BigInt(orderData.id.replace('gid://shopify/Order/', ''));
    
    // Find customer if exists
    let customerId = null;
    if (orderData.customer) {
      const customerShopifyId = BigInt(orderData.customer.id.replace('gid://shopify/Customer/', ''));
      const customer = await db.customer.findUnique({
        where: { customerId: customerShopifyId }
      });
      customerId = customer?.id;
    }

    // Upsert order
    const order = await db.order.upsert({
      where: { orderId },
      update: {
        orderNumber: orderData.orderNumber.toString(),
        email: orderData.email,
        financialStatus: orderData.financialStatus,
        fulfillmentStatus: orderData.fulfillmentStatus,
        totalPrice: orderData.totalPriceSet?.shopMoney ? parseFloat(orderData.totalPriceSet.shopMoney.amount) : null,
        currency: orderData.currencyCode,
        customerId,
        updatedAt: new Date(orderData.updatedAt)
      },
      create: {
        orderId,
        shopId: this.shopId,
        orderNumber: orderData.orderNumber.toString(),
        email: orderData.email,
        financialStatus: orderData.financialStatus,
        fulfillmentStatus: orderData.fulfillmentStatus,
        totalPrice: orderData.totalPriceSet?.shopMoney ? parseFloat(orderData.totalPriceSet.shopMoney.amount) : null,
        currency: orderData.currencyCode,
        customerId,
        createdAt: new Date(orderData.createdAt),
        updatedAt: new Date(orderData.updatedAt)
      }
    });

    // Sync line items
    for (const lineItemEdge of orderData.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      
      let productVariantId = null;
      let productId = null;
      
      if (lineItem.variant) {
        const variantShopifyId = BigInt(lineItem.variant.id.replace('gid://shopify/ProductVariant/', ''));
        const variant = await db.productVariant.findUnique({
          where: { variantId: variantShopifyId }
        });
        productVariantId = variant?.id;
      }
      
      if (lineItem.product) {
        const productShopifyId = BigInt(lineItem.product.id.replace('gid://shopify/Product/', ''));
        const product = await db.product.findUnique({
          where: { productId: productShopifyId }
        });
        productId = product?.id;
      }

      await db.orderItem.create({
        data: {
          orderId: order.id,
          productVariantId,
          productId,
          quantity: lineItem.quantity,
          price: parseFloat(lineItem.originalUnitPriceSet.shopMoney.amount)
        }
      });
    }

    // Sync shipping address
    if (orderData.shippingAddress) {
      await db.shippingAddress.upsert({
        where: { orderId: order.id },
        update: {
          firstName: orderData.shippingAddress.firstName,
          lastName: orderData.shippingAddress.lastName,
          company: orderData.shippingAddress.company,
          address1: orderData.shippingAddress.address1,
          address2: orderData.shippingAddress.address2,
          city: orderData.shippingAddress.city,
          province: orderData.shippingAddress.province,
          country: orderData.shippingAddress.country,
          zip: orderData.shippingAddress.zip,
          phone: orderData.shippingAddress.phone,
          name: orderData.shippingAddress.name,
          countryCode: orderData.shippingAddress.countryCodeV2,
          provinceCode: orderData.shippingAddress.provinceCode,
          latitude: orderData.shippingAddress.latitude,
          longitude: orderData.shippingAddress.longitude
        },
        create: {
          orderId: order.id,
          firstName: orderData.shippingAddress.firstName,
          lastName: orderData.shippingAddress.lastName,
          company: orderData.shippingAddress.company,
          address1: orderData.shippingAddress.address1,
          address2: orderData.shippingAddress.address2,
          city: orderData.shippingAddress.city,
          province: orderData.shippingAddress.province,
          country: orderData.shippingAddress.country,
          zip: orderData.shippingAddress.zip,
          phone: orderData.shippingAddress.phone,
          name: orderData.shippingAddress.name,
          countryCode: orderData.shippingAddress.countryCodeV2,
          provinceCode: orderData.shippingAddress.provinceCode,
          latitude: orderData.shippingAddress.latitude,
          longitude: orderData.shippingAddress.longitude
        }
      });
    }

    // Sync billing address
    if (orderData.billingAddress) {
      await db.billingAddress.upsert({
        where: { orderId: order.id },
        update: {
          firstName: orderData.billingAddress.firstName,
          lastName: orderData.billingAddress.lastName,
          company: orderData.billingAddress.company,
          address1: orderData.billingAddress.address1,
          address2: orderData.billingAddress.address2,
          city: orderData.billingAddress.city,
          province: orderData.billingAddress.province,
          country: orderData.billingAddress.country,
          zip: orderData.billingAddress.zip,
          phone: orderData.billingAddress.phone,
          name: orderData.billingAddress.name,
          countryCode: orderData.billingAddress.countryCodeV2,
          provinceCode: orderData.billingAddress.provinceCode,
          latitude: orderData.billingAddress.latitude,
          longitude: orderData.billingAddress.longitude
        },
        create: {
          orderId: order.id,
          firstName: orderData.billingAddress.firstName,
          lastName: orderData.billingAddress.lastName,
          company: orderData.billingAddress.company,
          address1: orderData.billingAddress.address1,
          address2: orderData.billingAddress.address2,
          city: orderData.billingAddress.city,
          province: orderData.billingAddress.province,
          country: orderData.billingAddress.country,
          zip: orderData.billingAddress.zip,
          phone: orderData.billingAddress.phone,
          name: orderData.billingAddress.name,
          countryCode: orderData.billingAddress.countryCodeV2,
          provinceCode: orderData.billingAddress.provinceCode,
          latitude: orderData.billingAddress.latitude,
          longitude: orderData.billingAddress.longitude
        }
      });
    }
  }

  /**
   * Sync all collections
   */
  async syncCollections() {
    const syncLog = await this.createSyncLog('collections', 'initial');
    let cursor = null;
    let totalCollections = 0;
    
    try {
      do {
        const collectionsQuery = await this.admin.graphql(`
          query getCollections($cursor: String) {
            collections(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  handle
                  title
                  products(first: 100) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        `, {
          variables: cursor ? { cursor } : {}
        });

        const collectionsData = await collectionsQuery.json();
        const collections = collectionsData.data.collections.edges;

        for (const collectionEdge of collections) {
          const collection = collectionEdge.node;
          await this.syncSingleCollection(collection);
          totalCollections++;
        }

        cursor = collectionsData.data.collections.pageInfo.hasNextPage 
          ? collectionsData.data.collections.pageInfo.endCursor 
          : null;

        await this.updateSyncLog(syncLog.id, totalCollections);
        
      } while (cursor);

      await this.completeSyncLog(syncLog.id, totalCollections, totalCollections);
      console.log(`✅ Synced ${totalCollections} collections`);
      
    } catch (error) {
      await this.failSyncLog(syncLog.id, error.message);
      throw error;
    }
  }

  /**
   * Sync a single collection with product relationships
   */
  async syncSingleCollection(collectionData) {
    const collectionId = BigInt(collectionData.id.replace('gid://shopify/Collection/', ''));
    
    // Upsert collection
    const collection = await db.collection.upsert({
      where: { collectionId },
      update: {
        handle: collectionData.handle,
        title: collectionData.title,
        updatedAt: new Date()
      },
      create: {
        collectionId,
        shopId: this.shopId,
        handle: collectionData.handle,
        title: collectionData.title,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Clear existing product relationships
    await db.collectionProduct.deleteMany({
      where: { collectionId: collection.id }
    });

    // Sync product relationships
    for (const productEdge of collectionData.products.edges) {
      const productShopifyId = BigInt(productEdge.node.id.replace('gid://shopify/Product/', ''));
      const product = await db.product.findUnique({
        where: { productId: productShopifyId }
      });
      
      if (product) {
        await db.collectionProduct.create({
          data: {
            collectionId: collection.id,
            productId: product.id
          }
        });
      }
    }
  }

  /**
   * Helper methods for sync logging
   */
  async createSyncLog(entityType, syncType) {
    return await db.syncLog.create({
      data: {
        shopId: this.shopId,
        syncType,
        entityType,
        status: 'started'
      }
    });
  }

  async updateSyncLog(syncLogId, recordsProcessed) {
    await db.syncLog.update({
      where: { id: syncLogId },
      data: { recordsProcessed }
    });
  }

  async completeSyncLog(syncLogId, recordsProcessed, recordsTotal) {
    await db.syncLog.update({
      where: { id: syncLogId },
      data: {
        status: 'completed',
        recordsProcessed,
        recordsTotal,
        completedAt: new Date()
      }
    });
  }

  async failSyncLog(syncLogId, errorMessage) {
    await db.syncLog.update({
      where: { id: syncLogId },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date()
      }
    });
  }
}

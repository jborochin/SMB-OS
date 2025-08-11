-- SQL script to manually create tables for Shopify data in PostgreSQL
-- Execute these statements in your Azure PostgreSQL database to create the necessary tables

-- Shop table to store shop information
CREATE TABLE IF NOT EXISTS "Shop" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL UNIQUE,
    "email" TEXT
);

-- Customer table to store customer information
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" SERIAL PRIMARY KEY,
    "shopId" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
);

-- Product table to store product information
CREATE TABLE IF NOT EXISTS "Product" (
    "id" SERIAL PRIMARY KEY,
    "productId" BIGINT NOT NULL UNIQUE,
    "shopId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "price" DOUBLE PRECISION,
    "inventoryQuantity" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
);

-- ProductVariant table to store product variant information
CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id" SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "title" TEXT,
    "sku" TEXT,
    "price" DOUBLE PRECISION,
    "inventoryQuantity" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
);

-- Order table to store order information
CREATE TABLE IF NOT EXISTS "Order" (
    "id" SERIAL PRIMARY KEY,
    "shopId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "orderNumber" TEXT NOT NULL UNIQUE,
    "totalPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id"),
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
);

-- OrderItem table to store order item information
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" SERIAL PRIMARY KEY,
    "orderId" INTEGER NOT NULL,
    "productVariantId" INTEGER,
    "productId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    FOREIGN KEY ("orderId") REFERENCES "Order"("id"),
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id"),
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
);

-- Collection table to store collection information
CREATE TABLE IF NOT EXISTS "Collection" (
    "id" SERIAL PRIMARY KEY,
    "shopId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
);

-- CollectionProduct table to store the relationship between collections and products
CREATE TABLE IF NOT EXISTS "CollectionProduct" (
    "collectionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    PRIMARY KEY ("collectionId", "productId"),
    FOREIGN KEY ("collectionId") REFERENCES "Collection"("id"),
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
);

-- End of script

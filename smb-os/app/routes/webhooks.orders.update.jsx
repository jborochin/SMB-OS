import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.webhook(request);

  if (!admin) {
    return json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    console.log("🔍 WEBHOOK: Order Updated", payload);

    // Extract order data
    const order = payload.order;
    if (!order) {
      console.error("❌ No order data in webhook payload");
      return json({ message: "No order data" }, { status: 400 });
    }

    console.log(`✅ Order updated: Order #${order.order_number} (ID: ${order.id}) - Status: ${order.financial_status}`);

    // Here you can add your custom logic to sync order data to your database
    // For example:
    // await syncOrderToDatabase(order);

    return json({ message: "Order webhook processed successfully" });

  } catch (error) {
    console.error("❌ Error processing order update webhook:", error);
    return json({ message: "Error processing webhook" }, { status: 500 });
  }
};

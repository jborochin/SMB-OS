import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.webhook(request);

  if (!admin) {
    return json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    console.log("🔍 WEBHOOK: Customer Updated", payload);

    // Extract customer data
    const customer = payload.customer;
    if (!customer) {
      console.error("❌ No customer data in webhook payload");
      return json({ message: "No customer data" }, { status: 400 });
    }

    console.log(`✅ Customer updated: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);

    // Here you can add your custom logic to sync customer data to your database
    // For example:
    // await syncCustomerToDatabase(customer);

    return json({ message: "Customer webhook processed successfully" });

  } catch (error) {
    console.error("❌ Error processing customer update webhook:", error);
    return json({ message: "Error processing webhook" }, { status: 500 });
  }
};

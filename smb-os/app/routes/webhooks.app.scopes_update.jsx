import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    try {
      console.log('Updating session scope for ID:', session.id);
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
      console.log('Session scope updated successfully');
    } catch (error) {
      console.error('Error updating session scope:', error);
    }
  }

  return new Response();
};

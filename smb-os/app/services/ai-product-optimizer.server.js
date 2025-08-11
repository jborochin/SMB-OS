// AI Product Optimizer Service
// This service analyzes user behavior and suggests SEO descriptions, images, and social media content for products.

import db from "../db.server";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class AIProductOptimizer {
  constructor(shopId) {
    this.shopId = shopId;
  }

  // Fetch product and related analytics data
  async getProductWithAnalytics(productId) {
    // Get product from public schema
    const product = await db.product.findUnique({
      where: { productId: BigInt(productId) },
      include: {
        variants: true,
        images: true,
      },
    });
    if (!product) throw new Error("Product not found");

    // Get Google Analytics data for this product (by page path or product handle)
    // This assumes your product page URLs follow a pattern like /products/{handle}
    const handle = product.handle;
    const pagePath = `/products/${handle}`;

    // Fetch pageviews and events from google_analytics schema
    // Note: Prisma multi-schema support: db.googleAnalyticsPageview, etc.
    const pageviews = await db.googleAnalyticsPageview.findMany({
      where: { pagePath },
      include: {
        session: {
          include: {
            user: true,
            trafficSource: true,
            events: true,
          },
        },
      },
    });

    // You can aggregate or process this data as needed
    return { product, pageviews };
  }

  // Suggest a new SEO description for the product based on analytics data
  async suggestSeoDescription(productId) {
    const { product, pageviews } = await this.getProductWithAnalytics(productId);

    // Aggregate analytics insights for prompt
    const totalViews = pageviews.length;
    const topReferrers = {};
    const searchTerms = {};
    for (const pv of pageviews) {
      const ref = pv.referrer;
      if (ref) topReferrers[ref] = (topReferrers[ref] || 0) + 1;
      // Example: extract search terms from referrer or eventParams if available
      if (pv.session && pv.session.events) {
        for (const event of pv.session.events) {
          if (event.eventName === 'search' && event.eventParams) {
            try {
              const params = JSON.parse(event.eventParams);
              if (params.query) searchTerms[params.query] = (searchTerms[params.query] || 0) + 1;
            } catch {}
          }
        }
      }
    }
    const topRefList = Object.entries(topReferrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ref, count]) => `${ref} (${count})`)
      .join(", ");
    const topSearchList = Object.entries(searchTerms)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([term, count]) => `${term} (${count})`)
      .join(", ");

    // Build prompt for OpenAI
    const prompt = `Rewrite the following Shopify product description to maximize SEO and conversion, using natural language.\n\nProduct Title: ${product.title}\nCurrent Description: ${product.description || product.title}\n\nAnalytics Insights:\n- Total Pageviews: ${totalViews}\n- Top Referrers: ${topRefList || 'N/A'}\n- Top Search Terms: ${topSearchList || 'N/A'}\n\nFocus on keywords users actually search for, and make the description engaging and persuasive.\n\nNew SEO Description:`;

    // Call OpenAI API
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are an expert Shopify SEO copywriter." },
            { role: "user", content: prompt }
          ],
          max_tokens: 300,
          temperature: 0.7
        })
      });
      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const data = await response.json();
      const suggestion = data.choices?.[0]?.message?.content?.trim() || "[No suggestion generated]";
      return {
        suggestion,
        product,
        analytics: pageviews,
        prompt
      };
    } catch (error) {
      console.error("OpenAI SEO generation failed:", error);
      return {
        suggestion: "[AI generation failed. Please try again later.]",
        product,
        analytics: pageviews,
        prompt
      };
    }
  }

  // Suggest new images for the product based on analytics data
  async suggestImages(productId) {
    const { product, pageviews } = await this.getProductWithAnalytics(productId);
    // TODO: Analyze analytics and call image generation API or suggest stock images
    return {
      suggestions: [/* URLs or prompts for images */],
      product,
      analytics: pageviews,
    };
  }

  // Suggest social media content for the product based on analytics data
  async suggestSocialMediaContent(productId) {
    const { product, pageviews } = await this.getProductWithAnalytics(productId);
    // TODO: Analyze analytics and call LLM to generate social media posts/captions/hashtags
    return {
      suggestions: [
        // Example: "Check out our best-selling product! ... #ShopNow"
      ],
      product,
      analytics: pageviews,
    };
  }
}

// Usage example (in a route or controller):
// const optimizer = new AIProductOptimizer(shopId);
// const seo = await optimizer.suggestSeoDescription(productId);
// const images = await optimizer.suggestImages(productId);
// const social = await optimizer.suggestSocialMediaContent(productId); 
/**
 * AI Product Generator Service
 * Handles parsing user prompts and generating products
 */

// Optional: Integrate with OpenAI or other AI services
// You can uncomment and configure this for more advanced AI capabilities
/*
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
*/

export class AIProductGenerator {
  constructor() {
    this.productKeywords = [
      'shirt', 't-shirt', 'hoodie', 'jacket', 'pants', 'shoes', 'hat', 'bag', 
      'mug', 'poster', 'sticker', 'book', 'toy', 'gadget', 'tool', 'jewelry',
      'accessory', 'home', 'decor', 'kitchen', 'bathroom', 'garden', 'fitness',
      'electronics', 'clothing', 'footwear', 'watch', 'sunglasses', 'belt'
    ];
    
    this.colors = [
      'red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'pink', 
      'orange', 'brown', 'gray', 'navy', 'maroon', 'teal', 'lime', 'gold', 'silver'
    ];
    
    this.materials = [
      'cotton', 'wool', 'leather', 'silk', 'denim', 'polyester', 'metal', 'wood', 
      'plastic', 'ceramic', 'glass', 'rubber', 'canvas', 'linen', 'suede', 'velvet'
    ];
    
    this.styles = [
      'vintage', 'modern', 'classic', 'trendy', 'casual', 'formal', 'sporty', 
      'elegant', 'minimalist', 'bohemian', 'industrial', 'rustic', 'contemporary'
    ];
  }

  /**
   * Parse user prompt and extract product information
   */
  async parseUserPrompt(prompt, selectedCollection = null) {
    console.log(`🔍 AI Agent: Parsing prompt: "${prompt}"`);
    
    // Extract product name
    const productName = this.extractProductName(prompt);
    
    // Extract price
    const price = this.extractPrice(prompt);
    
    // Extract description
    const description = this.extractDescription(prompt);
    
    // Extract tags
    const tags = this.extractTags(prompt);
    
    // Extract vendor
    const vendor = this.extractVendor(prompt);
    
    // Extract product type
    const productType = this.extractProductType(prompt);
    
    return {
      title: productName,
      description: description,
      price: price,
      tags: tags,
      vendor: vendor,
      productType: productType,
      collectionId: selectedCollection
    };
  }

  /**
   * Extract product name from prompt
   */
  extractProductName(prompt) {
    // Look for quoted names
    const quotedMatch = prompt.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1];
    }
    
    // Look for "called" or "named" patterns
    const calledMatch = prompt.match(/(?:called|named)\s+([a-zA-Z\s]+?)(?:\s+for|\s+in|\s+with|$)/i);
    if (calledMatch) {
      return calledMatch[1].trim();
    }
    
    // Look for product type + descriptive words
    for (const keyword of this.productKeywords) {
      if (prompt.toLowerCase().includes(keyword)) {
        const beforeKeyword = prompt.toLowerCase().split(keyword)[0];
        const words = beforeKeyword.split(' ').slice(-2).join(' ');
        if (words.trim()) {
          return `${words.trim()} ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`;
        }
        return `Custom ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`;
      }
    }
    
    return "Custom Product";
  }

  /**
   * Extract price from prompt
   */
  extractPrice(prompt) {
    // Look for dollar amounts
    const priceMatch = prompt.match(/\$?(\d+(?:\.\d{2})?)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0 && price < 10000) {
        return price;
      }
    }
    
    // Look for price ranges
    const rangeMatch = prompt.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      return (min + max) / 2;
    }
    
    return 19.99; // Default price
  }

  /**
   * Extract description from prompt
   */
  extractDescription(prompt) {
    const descriptions = [];
    
    // Extract descriptive adjectives
    const adjectives = {
      'comfortable': 'Comfortable and cozy',
      'stylish': 'Stylish and modern',
      'durable': 'Durable and long-lasting',
      'unique': 'Unique and one-of-a-kind',
      'premium': 'Premium quality',
      'handmade': 'Handcrafted with care',
      'elegant': 'Elegant and sophisticated',
      'casual': 'Perfect for casual wear',
      'formal': 'Suitable for formal occasions',
      'sporty': 'Great for active lifestyles',
      'vintage': 'Classic vintage design',
      'modern': 'Contemporary modern style',
      'trendy': 'On-trend and fashionable',
      'minimalist': 'Clean minimalist design',
      'luxury': 'Luxury quality materials'
    };
    
    for (const [word, description] of Object.entries(adjectives)) {
      if (prompt.toLowerCase().includes(word)) {
        descriptions.push(description);
      }
    }
    
    if (descriptions.length > 0) {
      return descriptions.join('. ') + '.';
    }
    
    return 'High-quality product created just for you.';
  }

  /**
   * Extract tags from prompt
   */
  extractTags(prompt) {
    const tags = [];
    
    // Extract colors
    for (const color of this.colors) {
      if (prompt.toLowerCase().includes(color)) {
        tags.push(color);
      }
    }
    
    // Extract materials
    for (const material of this.materials) {
      if (prompt.toLowerCase().includes(material)) {
        tags.push(material);
      }
    }
    
    // Extract styles
    for (const style of this.styles) {
      if (prompt.toLowerCase().includes(style)) {
        tags.push(style);
      }
    }
    
    // Extract product types
    for (const keyword of this.productKeywords) {
      if (prompt.toLowerCase().includes(keyword)) {
        tags.push(keyword);
      }
    }
    
    return tags;
  }

  /**
   * Extract vendor from prompt
   */
  extractVendor(prompt) {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('handmade') || promptLower.includes('artisan')) {
      return "Artisan Crafts";
    }
    if (promptLower.includes('premium') || promptLower.includes('luxury')) {
      return "Premium Brands";
    }
    if (promptLower.includes('sport') || promptLower.includes('athletic')) {
      return "Sports Gear";
    }
    if (promptLower.includes('vintage') || promptLower.includes('retro')) {
      return "Vintage Collection";
    }
    if (promptLower.includes('modern') || promptLower.includes('contemporary')) {
      return "Modern Designs";
    }
    if (promptLower.includes('eco') || promptLower.includes('sustainable')) {
      return "Eco-Friendly Products";
    }
    
    return "AI Generated";
  }

  /**
   * Extract product type from prompt
   */
  extractProductType(prompt) {
    const promptLower = prompt.toLowerCase();
    
    for (const keyword of this.productKeywords) {
      if (promptLower.includes(keyword)) {
        return keyword;
      }
    }
    
    return "product";
  }

  /**
   * Enhanced AI parsing using external service (optional)
   */
  async parseWithAI(prompt) {
    // Uncomment this section if you want to use OpenAI or another AI service
    /*
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a product generation assistant. Parse the user's description and return a JSON object with: title, description, price (number), tags (array), vendor (string), productType (string). Keep descriptions concise and engaging."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content;
      return JSON.parse(response);
    } catch (error) {
      console.error('AI parsing failed, falling back to rule-based parsing:', error);
      return this.parseUserPrompt(prompt);
    }
    */
    
    // Fallback to rule-based parsing
    return this.parseUserPrompt(prompt);
  }
} 
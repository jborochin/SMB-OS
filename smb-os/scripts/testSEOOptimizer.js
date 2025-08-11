import { generateSEOSuggestions, getSEOPerformanceSummary } from '../app/services/ai-seo-optimizer.server.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSEOOptimizer() {
  console.log('🧪 Testing AI SEO Optimizer...\n');

  // Test 1: Get performance summary
  console.log('📊 Testing performance summary...');
  try {
    const summary = await getSEOPerformanceSummary(30);
    
    if (summary.success) {
      console.log('✅ Performance summary retrieved successfully');
      console.log(`   - Total Page Views: ${summary.data.overview.totalPageViews.toLocaleString()}`);
      console.log(`   - Total Sessions: ${summary.data.overview.totalSessions.toLocaleString()}`);
      console.log(`   - Avg Bounce Rate: ${(summary.data.overview.avgBounceRate * 100).toFixed(1)}%`);
      console.log(`   - Top Pages: ${summary.data.topPages.length}`);
      console.log(`   - Top Traffic Sources: ${summary.data.topTrafficSources.length}`);
      
      if (summary.data.searchPerformance) {
        console.log(`   - Search Clicks: ${summary.data.searchPerformance.totalClicks.toLocaleString()}`);
        console.log(`   - Search Impressions: ${summary.data.searchPerformance.totalImpressions.toLocaleString()}`);
      } else {
        console.log('   - Search Console data: Not available');
      }
    } else {
      console.log('❌ Performance summary failed:', summary.error);
    }
  } catch (error) {
    console.log('❌ Performance summary error:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Generate AI suggestions (only if Azure OpenAI is configured)
  console.log('🤖 Testing AI SEO suggestions...');
  
  const hasAzureConfig = process.env.AZURE_OPENAI_ENDPOINT && 
                        process.env.AZURE_OPENAI_API_KEY && 
                        process.env.AZURE_OPENAI_ENDPOINT !== 'your-azure-openai-endpoint' &&
                        process.env.AZURE_OPENAI_API_KEY !== 'your-azure-openai-api-key';

  if (!hasAzureConfig) {
    console.log('⚠️  Azure OpenAI not configured - skipping AI suggestions test');
    console.log('   To test AI suggestions, update these environment variables:');
    console.log('   - AZURE_OPENAI_ENDPOINT');
    console.log('   - AZURE_OPENAI_API_KEY');
    console.log('   - AZURE_OPENAI_DEPLOYMENT_NAME (optional, defaults to gpt-4)');
    return;
  }

  try {
    console.log('   Generating AI suggestions (this may take 10-30 seconds)...');
    const suggestions = await generateSEOSuggestions({
      dateRange: 30,
      minPageViews: 5
    });
    
    if (suggestions.success) {
      console.log('✅ AI suggestions generated successfully');
      console.log(`   - Pages analyzed: ${suggestions.metadata.pagesAnalyzed}`);
      console.log(`   - Date range: ${suggestions.metadata.dateRange} days`);
      
      const data = suggestions.data;
      
      if (data.summary) {
        console.log('\n📝 AI Summary:');
        console.log(`   ${data.summary.substring(0, 200)}${data.summary.length > 200 ? '...' : ''}`);
      }
      
      if (data.keyInsights && data.keyInsights.length > 0) {
        console.log('\n💡 Key Insights:');
        data.keyInsights.forEach((insight, index) => {
          console.log(`   ${index + 1}. [${insight.type.toUpperCase()}] ${insight.title}`);
          console.log(`      ${insight.description}`);
        });
      }
      
      if (data.highPriority && data.highPriority.length > 0) {
        console.log('\n🔥 High Priority Recommendations:');
        data.highPriority.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec.title}`);
          console.log(`      Impact: ${rec.impact} | Difficulty: ${rec.difficulty} | Timeline: ${rec.timeline}`);
          console.log(`      ${rec.description.substring(0, 150)}${rec.description.length > 150 ? '...' : ''}`);
        });
      }
      
      if (data.mediumPriority && data.mediumPriority.length > 0) {
        console.log('\n⚡ Medium Priority Recommendations:');
        data.mediumPriority.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec.title}`);
        });
      }
      
      if (data.lowPriority && data.lowPriority.length > 0) {
        console.log('\n💡 Low Priority Recommendations:');
        data.lowPriority.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec.title}`);
        });
      }
      
    } else {
      console.log('❌ AI suggestions failed:', suggestions.error);
    }
  } catch (error) {
    console.log('❌ AI suggestions error:', error.message);
    
    if (error.message.includes('AI analysis failed')) {
      console.log('\n🔧 Troubleshooting tips:');
      console.log('   1. Verify your Azure OpenAI endpoint URL is correct');
      console.log('   2. Check that your API key is valid and has proper permissions');
      console.log('   3. Ensure your deployment name matches an existing deployment');
      console.log('   4. Verify the deployment has sufficient quota/capacity');
    }
  }

  console.log('\n✅ SEO Optimizer test completed!');
}

// Run the test
testSEOOptimizer().catch(console.error);

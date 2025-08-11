import OpenAI from 'openai';
import db from '../db.server.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Azure OpenAI client using the standard OpenAI package
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4'}`,
  defaultQuery: { 'api-version': '2024-02-15-preview' },
  defaultHeaders: {
    'api-key': process.env.AZURE_OPENAI_API_KEY,
  },
});

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';

/**
 * Analyze page performance and generate SEO optimization suggestions
 */
export async function generateSEOSuggestions(options = {}) {
  const {
    dateRange = 30, // days
    minPageViews = 10,
    includeSearchData = true,
    includeTrafficData = true
  } = options;

  try {
    // Get analytics data for analysis
    const analyticsData = await gatherAnalyticsData(dateRange, minPageViews);
    
    // Generate AI-powered suggestions
    const suggestions = await generateAISuggestions(analyticsData);
    
    return {
      success: true,
      data: suggestions,
      metadata: {
        dateRange,
        pagesAnalyzed: analyticsData.pages.length,
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error generating SEO suggestions:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gather comprehensive analytics data for AI analysis
 */
async function gatherAnalyticsData(dateRange, minPageViews) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dateRange);

  // Get page performance data
  const pages = await db.googleAnalyticsHistoricalPages.findMany({
    where: {
      date: {
        gte: startDate
      },
      screenPageViews: {
        gte: minPageViews
      }
    },
    orderBy: {
      screenPageViews: 'desc'
    },
    take: 50 // Limit to top 50 pages for analysis
  });

  // Get traffic source data
  const trafficSources = await db.googleAnalyticsHistoricalTraffic.findMany({
    where: {
      date: {
        gte: startDate
      }
    },
    orderBy: {
      sessions: 'desc'
    },
    take: 20
  });

  // Get device performance data
  const deviceData = await db.googleAnalyticsHistoricalDevices.findMany({
    where: {
      date: {
        gte: startDate
      }
    },
    orderBy: {
      sessions: 'desc'
    },
    take: 10
  });

  // Get geographic data
  const geoData = await db.googleAnalyticsHistoricalGeo.findMany({
    where: {
      date: {
        gte: startDate
      }
    },
    orderBy: {
      sessions: 'desc'
    },
    take: 15
  });

  // Get search console data if available
  let searchData = [];
  try {
    searchData = await db.googleAnalyticsHistoricalSearch.findMany({
      where: {
        date: {
          gte: startDate
        },
        clicks: {
          gt: 0
        }
      },
      orderBy: {
        clicks: 'desc'
      },
      take: 30
    });
  } catch (error) {
    console.log('Search console data not available:', error.message);
  }

  return {
    pages,
    trafficSources,
    deviceData,
    geoData,
    searchData,
    dateRange,
    analysisDate: new Date().toISOString()
  };
}

/**
 * Generate AI-powered SEO suggestions using Azure OpenAI
 */
async function generateAISuggestions(analyticsData) {
  const prompt = createAnalysisPrompt(analyticsData);

  try {
    const response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an expert SEO analyst and digital marketing strategist. Analyze the provided website analytics data and generate actionable SEO optimization recommendations. Focus on:

1. Page Performance Optimization
2. Content Strategy Improvements
3. Technical SEO Issues
4. User Experience Enhancements
5. Traffic Source Optimization
6. Mobile/Device Optimization
7. Geographic Targeting Opportunities

Provide specific, actionable recommendations with priority levels (High, Medium, Low) and expected impact estimates.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from AI service');
    }

    // Parse and structure the AI response
    return parseAIResponse(aiResponse, analyticsData);
  } catch (error) {
    console.error('Error calling Azure OpenAI:', error);
    
    // Provide specific error handling for common Azure OpenAI issues
    if (error.status === 403) {
      if (error.message.includes('Virtual Network/Firewall')) {
        console.log('Azure OpenAI blocked by firewall, falling back to rule-based analysis');
        return generateFallbackAnalysis(analyticsData);
      } else {
        throw new Error(`Azure OpenAI access denied (403). Please verify your API key and deployment permissions.`);
      }
    } else if (error.status === 401) {
      throw new Error(`Azure OpenAI authentication failed. Please check your API key and endpoint configuration.`);
    } else if (error.status === 404) {
      console.log('Azure OpenAI deployment not found, falling back to rule-based analysis');
      return generateFallbackAnalysis(analyticsData);
    } else if (error.status === 429) {
      throw new Error(`Azure OpenAI rate limit exceeded. Please try again in a few minutes.`);
    } else {
      console.log('Azure OpenAI error, falling back to rule-based analysis:', error.message);
      return generateFallbackAnalysis(analyticsData);
    }
  }
}

/**
 * Generate SEO recommendations using rule-based analysis (fallback when AI is unavailable)
 */
function generateFallbackAnalysis(analyticsData) {
  const { pages, trafficSources, deviceData, geoData, searchData } = analyticsData;
  
  const recommendations = {
    highPriority: [],
    mediumPriority: [],
    lowPriority: [],
    summary: 'SEO analysis completed using data-driven insights. While AI analysis is temporarily unavailable, these recommendations are based on proven SEO best practices and your actual performance data.',
    keyInsights: []
  };

  // Analyze bounce rates
  const highBouncePages = pages.filter(page => page.bounceRate && page.bounceRate > 0.7);
  if (highBouncePages.length > 0) {
    recommendations.highPriority.push({
      title: `Optimize High Bounce Rate Pages (${highBouncePages.length} pages)`,
      description: `${highBouncePages.length} pages have bounce rates above 70%. Focus on improving page load speed, content relevance, and user experience. Top offenders: ${highBouncePages.slice(0, 3).map(p => p.pagePath).join(', ')}.`,
      impact: 'High',
      difficulty: 'Medium',
      timeline: '2-4 weeks'
    });
  }

  // Analyze search console data
  if (searchData.length > 0) {
    const lowCTRQueries = searchData.filter(query => query.ctr && query.ctr < 0.02);
    if (lowCTRQueries.length > 0) {
      recommendations.highPriority.push({
        title: `Improve Search Result Click-Through Rates`,
        description: `${lowCTRQueries.length} search queries have CTR below 2%. Optimize title tags and meta descriptions for queries like: ${lowCTRQueries.slice(0, 3).map(q => `"${q.query}"`).join(', ')}.`,
        impact: 'High',
        difficulty: 'Easy',
        timeline: '1-2 weeks'
      });
    }

    const highImpressionLowClick = searchData.filter(query => query.impressions > 100 && query.clicks < 5);
    if (highImpressionLowClick.length > 0) {
      recommendations.mediumPriority.push({
        title: `Capitalize on High-Impression Keywords`,
        description: `${highImpressionLowClick.length} keywords show high search visibility but low clicks. Improve content relevance and meta descriptions for: ${highImpressionLowClick.slice(0, 3).map(q => `"${q.query}"`).join(', ')}.`,
        impact: 'Medium',
        difficulty: 'Medium',
        timeline: '2-3 weeks'
      });
    }
  }

  // Analyze traffic sources
  const organicTraffic = trafficSources.find(source => source.channelGroup === 'Organic Search');
  const totalSessions = trafficSources.reduce((sum, source) => sum + source.sessions, 0);
  
  if (organicTraffic && totalSessions > 0) {
    const organicPercentage = (organicTraffic.sessions / totalSessions) * 100;
    if (organicPercentage < 30) {
      recommendations.mediumPriority.push({
        title: 'Increase Organic Search Traffic',
        description: `Organic search represents only ${organicPercentage.toFixed(1)}% of your traffic. Focus on content creation, keyword optimization, and technical SEO to improve search rankings.`,
        impact: 'High',
        difficulty: 'Hard',
        timeline: '3-6 months'
      });
    }
  }

  // Analyze device performance
  const mobileData = deviceData.find(device => device.deviceCategory === 'mobile');
  const desktopData = deviceData.find(device => device.deviceCategory === 'desktop');
  
  if (mobileData && desktopData && mobileData.bounceRate && desktopData.bounceRate) {
    if (mobileData.bounceRate > desktopData.bounceRate + 0.1) {
      recommendations.highPriority.push({
        title: 'Optimize Mobile User Experience',
        description: `Mobile bounce rate (${(mobileData.bounceRate * 100).toFixed(1)}%) is significantly higher than desktop (${(desktopData.bounceRate * 100).toFixed(1)}%). Improve mobile page speed, navigation, and content layout.`,
        impact: 'High',
        difficulty: 'Medium',
        timeline: '2-4 weeks'
      });
    }
  }

  // Analyze page performance
  if (pages.length > 0) {
    const topPage = pages[0];
    const lowPerformingPages = pages.filter(page => page.screenPageViews < 10);
    
    if (lowPerformingPages.length > pages.length * 0.5) {
      recommendations.mediumPriority.push({
        title: 'Improve Content Distribution',
        description: `${lowPerformingPages.length} pages receive minimal traffic. Consider internal linking, content promotion, and SEO optimization for underperforming content.`,
        impact: 'Medium',
        difficulty: 'Medium',
        timeline: '4-6 weeks'
      });
    }
  }

  // Add geographic insights
  if (geoData.length > 0) {
    const topCountry = geoData[0];
    const totalGeoSessions = geoData.reduce((sum, geo) => sum + geo.sessions, 0);
    const topCountryPercentage = (topCountry.sessions / totalGeoSessions) * 100;
    
    if (topCountryPercentage > 80) {
      recommendations.lowPriority.push({
        title: 'Expand Geographic Reach',
        description: `${topCountryPercentage.toFixed(1)}% of traffic comes from ${topCountry.country}. Consider international SEO, multilingual content, or targeted marketing in other regions.`,
        impact: 'Low',
        difficulty: 'Hard',
        timeline: '6+ months'
      });
    }
  }

  // Generate key insights
  if (pages.length > 0) {
    const topPage = pages[0];
    recommendations.keyInsights.push({
      type: 'performance',
      title: 'Top Performing Page',
      description: `${topPage.pagePath} generates ${topPage.screenPageViews} page views with ${topPage.bounceRate ? (topPage.bounceRate * 100).toFixed(1) + '%' : 'unknown'} bounce rate`,
      metric: topPage.screenPageViews
    });
  }
  
  if (trafficSources.length > 0) {
    const topSource = trafficSources[0];
    recommendations.keyInsights.push({
      type: 'traffic',
      title: 'Primary Traffic Source',
      description: `${topSource.channelGroup} (${topSource.source}) drives ${topSource.sessions} sessions`,
      metric: topSource.sessions
    });
  }
  
  if (searchData.length > 0) {
    const topQuery = searchData[0];
    recommendations.keyInsights.push({
      type: 'search',
      title: 'Top Search Query',
      description: `"${topQuery.query}" generates ${topQuery.clicks} clicks from ${topQuery.impressions} impressions`,
      metric: topQuery.clicks
    });
  }

  return recommendations;
}

/**
 * Create a comprehensive analysis prompt for the AI
 */
function createAnalysisPrompt(data) {
  const { pages, trafficSources, deviceData, geoData, searchData } = data;

  let prompt = `Analyze this website's SEO performance data and provide optimization recommendations:

## PAGE PERFORMANCE DATA (Top ${pages.length} pages):
`;

  // Add page performance data
  pages.slice(0, 10).forEach((page, index) => {
    prompt += `${index + 1}. ${page.pagePath}
   - Page Views: ${page.screenPageViews}
   - Unique Views: ${page.uniquePageViews}
   - Bounce Rate: ${page.bounceRate ? (page.bounceRate * 100).toFixed(1) + '%' : 'N/A'}
   - Title: ${page.pageTitle || 'No title'}
`;
  });

  // Add traffic source data
  prompt += `\n## TRAFFIC SOURCES (Top ${trafficSources.length}):
`;
  trafficSources.slice(0, 8).forEach((source, index) => {
    prompt += `${index + 1}. ${source.source}/${source.medium} (${source.channelGroup})
   - Sessions: ${source.sessions}
   - Users: ${source.users}
   - Bounce Rate: ${source.bounceRate ? (source.bounceRate * 100).toFixed(1) + '%' : 'N/A'}
   - Avg Session Duration: ${source.averageSessionDuration ? source.averageSessionDuration.toFixed(1) + 's' : 'N/A'}
`;
  });

  // Add device data
  prompt += `\n## DEVICE PERFORMANCE:
`;
  deviceData.forEach((device, index) => {
    prompt += `${index + 1}. ${device.deviceCategory} (${device.operatingSystem || 'Unknown OS'})
   - Sessions: ${device.sessions}
   - Bounce Rate: ${device.bounceRate ? (device.bounceRate * 100).toFixed(1) + '%' : 'N/A'}
`;
  });

  // Add geographic data
  prompt += `\n## GEOGRAPHIC PERFORMANCE (Top markets):
`;
  geoData.slice(0, 8).forEach((geo, index) => {
    prompt += `${index + 1}. ${geo.country}${geo.region ? ', ' + geo.region : ''}
   - Sessions: ${geo.sessions}
   - Users: ${geo.users}
`;
  });

  // Add search console data if available
  if (searchData.length > 0) {
    prompt += `\n## SEARCH CONSOLE DATA (Top queries):
`;
    searchData.slice(0, 10).forEach((search, index) => {
      prompt += `${index + 1}. "${search.query}"
   - Clicks: ${search.clicks}
   - Impressions: ${search.impressions}
   - CTR: ${search.ctr ? (search.ctr * 100).toFixed(1) + '%' : 'N/A'}
   - Avg Position: ${search.position ? search.position.toFixed(1) : 'N/A'}
   - Page: ${search.page || 'Multiple pages'}
`;
    });
  }

  prompt += `\n## ANALYSIS REQUEST:
Based on this data, provide specific SEO optimization recommendations organized by:
1. HIGH PRIORITY actions (immediate impact)
2. MEDIUM PRIORITY actions (significant long-term impact)
3. LOW PRIORITY actions (optimization opportunities)

For each recommendation, include:
- Specific action to take
- Expected impact/benefit
- Implementation difficulty (Easy/Medium/Hard)
- Estimated timeline for results

Focus on actionable insights that can improve organic traffic, user engagement, and conversion rates.`;

  return prompt;
}

/**
 * Parse and structure the AI response into actionable recommendations
 */
function parseAIResponse(aiResponse, analyticsData) {
  // Extract structured recommendations from AI response
  const recommendations = {
    highPriority: [],
    mediumPriority: [],
    lowPriority: [],
    summary: '',
    keyInsights: []
  };

  try {
    // Split response into sections
    const sections = aiResponse.split(/(?:HIGH PRIORITY|MEDIUM PRIORITY|LOW PRIORITY)/i);
    
    if (sections.length >= 2) {
      // Extract summary (usually at the beginning)
      recommendations.summary = sections[0].trim();
      
      // Parse priority sections
      const priorities = ['highPriority', 'mediumPriority', 'lowPriority'];
      
      for (let i = 1; i < Math.min(sections.length, 4); i++) {
        const sectionContent = sections[i].trim();
        const priority = priorities[i - 1];
        
        if (priority && sectionContent) {
          recommendations[priority] = parseRecommendationSection(sectionContent);
        }
      }
    } else {
      // Fallback: treat entire response as summary
      recommendations.summary = aiResponse;
    }

    // Extract key insights
    recommendations.keyInsights = extractKeyInsights(aiResponse, analyticsData);
    
  } catch (error) {
    console.error('Error parsing AI response:', error);
    recommendations.summary = aiResponse; // Fallback to raw response
  }

  return recommendations;
}

/**
 * Parse a recommendation section into structured items
 */
function parseRecommendationSection(sectionContent) {
  const recommendations = [];
  const lines = sectionContent.split('\n').filter(line => line.trim());
  
  let currentRec = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if this is a new recommendation (starts with number or bullet)
    if (/^\d+\.|\*|\-/.test(trimmedLine)) {
      if (currentRec) {
        recommendations.push(currentRec);
      }
      
      currentRec = {
        title: trimmedLine.replace(/^\d+\.|\*|\-/, '').trim(),
        description: '',
        impact: 'Medium',
        difficulty: 'Medium',
        timeline: 'Unknown'
      };
    } else if (currentRec && trimmedLine) {
      // Add to current recommendation description
      currentRec.description += (currentRec.description ? ' ' : '') + trimmedLine;
      
      // Extract metadata from description
      if (trimmedLine.toLowerCase().includes('impact:')) {
        currentRec.impact = extractMetadata(trimmedLine, 'impact');
      }
      if (trimmedLine.toLowerCase().includes('difficulty:')) {
        currentRec.difficulty = extractMetadata(trimmedLine, 'difficulty');
      }
      if (trimmedLine.toLowerCase().includes('timeline:')) {
        currentRec.timeline = extractMetadata(trimmedLine, 'timeline');
      }
    }
  }
  
  if (currentRec) {
    recommendations.push(currentRec);
  }
  
  return recommendations;
}

/**
 * Extract metadata from recommendation text
 */
function extractMetadata(text, type) {
  const regex = new RegExp(`${type}:\\s*([^,\\.\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : 'Unknown';
}

/**
 * Extract key insights from the AI response
 */
function extractKeyInsights(aiResponse, analyticsData) {
  const insights = [];
  
  // Add data-driven insights
  if (analyticsData.pages.length > 0) {
    const topPage = analyticsData.pages[0];
    insights.push({
      type: 'performance',
      title: 'Top Performing Page',
      description: `${topPage.pagePath} generates ${topPage.screenPageViews} page views with ${topPage.bounceRate ? (topPage.bounceRate * 100).toFixed(1) + '%' : 'unknown'} bounce rate`,
      metric: topPage.screenPageViews
    });
  }
  
  if (analyticsData.trafficSources.length > 0) {
    const topSource = analyticsData.trafficSources[0];
    insights.push({
      type: 'traffic',
      title: 'Primary Traffic Source',
      description: `${topSource.channelGroup} (${topSource.source}) drives ${topSource.sessions} sessions`,
      metric: topSource.sessions
    });
  }
  
  if (analyticsData.searchData.length > 0) {
    const topQuery = analyticsData.searchData[0];
    insights.push({
      type: 'search',
      title: 'Top Search Query',
      description: `"${topQuery.query}" generates ${topQuery.clicks} clicks from ${topQuery.impressions} impressions`,
      metric: topQuery.clicks
    });
  }
  
  return insights;
}

/**
 * Get SEO performance summary for dashboard
 */
export async function getSEOPerformanceSummary(dateRange = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);

    // Get key metrics
    const [
      totalPageViews,
      totalSessions,
      avgBounceRate,
      topPages,
      topTrafficSources,
      searchPerformance
    ] = await Promise.all([
      // Total page views
      db.googleAnalyticsHistoricalPages.aggregate({
        where: { date: { gte: startDate } },
        _sum: { screenPageViews: true }
      }),
      
      // Total sessions
      db.googleAnalyticsHistoricalSessions.aggregate({
        where: { date: { gte: startDate } },
        _sum: { sessions: true }
      }),
      
      // Average bounce rate
      db.googleAnalyticsHistoricalPages.aggregate({
        where: { 
          date: { gte: startDate },
          bounceRate: { not: null }
        },
        _avg: { bounceRate: true }
      }),
      
      // Top performing pages
      db.googleAnalyticsHistoricalPages.groupBy({
        by: ['pagePath', 'pageTitle'],
        where: { date: { gte: startDate } },
        _sum: { screenPageViews: true, uniquePageViews: true },
        _avg: { bounceRate: true },
        orderBy: { _sum: { screenPageViews: 'desc' } },
        take: 5
      }),
      
      // Top traffic sources
      db.googleAnalyticsHistoricalTraffic.groupBy({
        by: ['source', 'medium', 'channelGroup'],
        where: { date: { gte: startDate } },
        _sum: { sessions: true, users: true },
        _avg: { bounceRate: true },
        orderBy: { _sum: { sessions: 'desc' } },
        take: 5
      }),
      
      // Search performance (if available)
      db.googleAnalyticsHistoricalSearch.aggregate({
        where: { date: { gte: startDate } },
        _sum: { clicks: true, impressions: true },
        _avg: { ctr: true, position: true }
      }).catch(() => null)
    ]);

    return {
      success: true,
      data: {
        overview: {
          totalPageViews: totalPageViews._sum.screenPageViews || 0,
          totalSessions: totalSessions._sum.sessions || 0,
          avgBounceRate: avgBounceRate._avg.bounceRate || 0,
          dateRange
        },
        topPages: topPages.map(page => ({
          path: page.pagePath,
          title: page.pageTitle,
          pageViews: page._sum.screenPageViews,
          uniqueViews: page._sum.uniquePageViews,
          bounceRate: page._avg.bounceRate
        })),
        topTrafficSources: topTrafficSources.map(source => ({
          source: source.source,
          medium: source.medium,
          channelGroup: source.channelGroup,
          sessions: source._sum.sessions,
          users: source._sum.users,
          bounceRate: source._avg.bounceRate
        })),
        searchPerformance: searchPerformance ? {
          totalClicks: searchPerformance._sum.clicks || 0,
          totalImpressions: searchPerformance._sum.impressions || 0,
          avgCTR: searchPerformance._avg.ctr || 0,
          avgPosition: searchPerformance._avg.position || 0
        } : null
      }
    };
  } catch (error) {
    console.error('Error getting SEO performance summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

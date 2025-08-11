import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Card,
  Layout,
  Page,
  Text,
  Button,
  Badge,
  Banner,
  Select,
  Grid,
  Box,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { generateSEOSuggestions, getSEOPerformanceSummary } from "../services/ai-seo-optimizer.server.js";

export const loader = async ({ request }) => {
  try {
    // Get performance summary
    const performanceSummary = await getSEOPerformanceSummary(30);
    
    return json({
      performanceSummary: performanceSummary.success ? performanceSummary.data : null,
      error: performanceSummary.success ? null : performanceSummary.error
    });
  } catch (error) {
    console.error("Error loading SEO optimizer data:", error);
    return json({
      performanceSummary: null,
      error: error.message
    });
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "generate_suggestions") {
    const dateRange = parseInt(formData.get("dateRange")) || 30;
    const minPageViews = parseInt(formData.get("minPageViews")) || 10;
    
    try {
      const suggestions = await generateSEOSuggestions({
        dateRange,
        minPageViews
      });
      
      return json({ suggestions });
    } catch (error) {
      console.error("Error generating SEO suggestions:", error);
      return json({ 
        error: error.message,
        suggestions: null 
      });
    }
  }
  
  return json({ error: "Invalid action" });
};

export default function SEOOptimizer() {
  const { performanceSummary, error } = useLoaderData();
  const navigation = useNavigation();
  const [suggestions, setSuggestions] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [dateRange, setDateRange] = useState("30");
  const [minPageViews, setMinPageViews] = useState("10");

  const isGenerating = navigation.state === "submitting" && 
    navigation.formData?.get("action") === "generate_suggestions";

  // Handle the action response from Remix
  const actionData = useActionData();
  
  // Update suggestions when action data changes
  useEffect(() => {
    if (actionData?.suggestions) {
      setSuggestions(actionData.suggestions);
      setAnalysisError(null);
    } else if (actionData?.error) {
      setAnalysisError(actionData.error);
      setSuggestions(null);
    }
  }, [actionData]);

  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'critical';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'success';
      case 'medium': return 'warning';
      case 'hard': return 'critical';
      default: return 'info';
    }
  };

  return (
    <Page>
      <TitleBar title="AI SEO Optimizer" />
      
      <Layout>
        <Layout.Section>
          {error && (
            <Banner status="critical" title="Error loading data">
              <p>{error}</p>
            </Banner>
          )}
          
          {/* Performance Summary */}
          {performanceSummary && (
            <Card>
              <Text variant="headingMd" as="h2">
                SEO Performance Overview (Last 30 Days)
              </Text>
              <Box paddingBlockStart="400">
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Text variant="headingLg" as="h3">
                          {performanceSummary.overview.totalPageViews.toLocaleString()}
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Total Page Views
                        </Text>
                      </div>
                    </Card>
                  </Grid.Cell>
                  
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Text variant="headingLg" as="h3">
                          {performanceSummary.overview.totalSessions.toLocaleString()}
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Total Sessions
                        </Text>
                      </div>
                    </Card>
                  </Grid.Cell>
                  
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Text variant="headingLg" as="h3">
                          {(performanceSummary.overview.avgBounceRate * 100).toFixed(1)}%
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Avg Bounce Rate
                        </Text>
                      </div>
                    </Card>
                  </Grid.Cell>
                  
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Text variant="headingLg" as="h3">
                          {performanceSummary.searchPerformance ? 
                            performanceSummary.searchPerformance.totalClicks.toLocaleString() : 
                            'N/A'
                          }
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Search Clicks
                        </Text>
                      </div>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Box>
            </Card>
          )}
        </Layout.Section>

        <Layout.Section>
          {/* AI Analysis Controls */}
          <Card>
            <Text variant="headingMd" as="h2">
              Generate AI SEO Recommendations
            </Text>
            <Box paddingBlockStart="400">
              <Form method="post">
                <input type="hidden" name="action" value="generate_suggestions" />
                <input type="hidden" name="dateRange" value={dateRange} />
                <input type="hidden" name="minPageViews" value={minPageViews} />
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <Select
                      label="Analysis Period"
                      options={[
                        { label: "Last 7 days", value: "7" },
                        { label: "Last 30 days", value: "30" },
                        { label: "Last 90 days", value: "90" },
                      ]}
                      value={dateRange}
                      onChange={setDateRange}
                    />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <Select
                      label="Minimum Page Views"
                      options={[
                        { label: "5+ views", value: "5" },
                        { label: "10+ views", value: "10" },
                        { label: "25+ views", value: "25" },
                        { label: "50+ views", value: "50" },
                      ]}
                      value={minPageViews}
                      onChange={setMinPageViews}
                    />
                  </div>
                  
                  <Button 
                    primary 
                    loading={isGenerating}
                    submit
                  >
                    {isGenerating ? "Analyzing..." : "Generate AI Recommendations"}
                  </Button>
                </div>
              </Form>
            </Box>
          </Card>
        </Layout.Section>

        {/* Analysis Error */}
        {analysisError && (
          <Layout.Section>
            <Banner status="critical" title="Analysis Error">
              <p>{analysisError}</p>
              {analysisError.includes('firewall') ? (
                <div>
                  <p><strong>Azure OpenAI Firewall Issue:</strong></p>
                  <p>Your Azure OpenAI resource has network restrictions enabled. To resolve this:</p>
                  <ul>
                    <li>Go to your Azure OpenAI resource in the Azure portal</li>
                    <li>Navigate to "Networking" settings</li>
                    <li>Either disable network restrictions or add your current IP address to the allowed list</li>
                    <li>For development, you can temporarily set "Allow access from: All networks"</li>
                  </ul>
                  <p>Don't worry - the system will automatically provide intelligent SEO recommendations using rule-based analysis instead!</p>
                </div>
              ) : (
                <p>Make sure your Azure OpenAI credentials are configured correctly in the .env file.</p>
              )}
            </Banner>
          </Layout.Section>
        )}

        {/* AI Suggestions */}
        {suggestions && (
          <>
            <Layout.Section>
              <Card>
                <Text variant="headingMd" as="h2">
                  AI Analysis Summary
                </Text>
                <Box paddingBlockStart="400">
                  <Text variant="bodyMd">
                    {suggestions.data.summary || "Analysis completed successfully."}
                  </Text>
                  
                  {suggestions.data.keyInsights && suggestions.data.keyInsights.length > 0 && (
                    <Box paddingBlockStart="400">
                      <Text variant="headingSm" as="h3">Key Insights</Text>
                      <Box paddingBlockStart="200">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {suggestions.data.keyInsights.map((insight, index) => (
                            <Card key={index} sectioned>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <Badge tone={insight.type === 'performance' ? 'success' : 
                                           insight.type === 'traffic' ? 'info' : 'warning'}>
                                  {insight.type}
                                </Badge>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <Text variant="bodyMd" fontWeight="semibold">
                                    {insight.title}
                                  </Text>
                                  <Text variant="bodyMd" color="subdued">
                                    {insight.description}
                                  </Text>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Card>
            </Layout.Section>

            {/* High Priority Recommendations */}
            {suggestions.data.highPriority && suggestions.data.highPriority.length > 0 && (
              <Layout.Section>
                <Card>
                  <Text variant="headingMd" as="h2">
                    🔥 High Priority Recommendations
                  </Text>
                  <Box paddingBlockStart="400">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {suggestions.data.highPriority.map((rec, index) => (
                        <Card key={index} sectioned>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {rec.title}
                              </Text>
                              <Badge tone={getPriorityColor('high')}>High Priority</Badge>
                              <Badge tone={getDifficultyColor(rec.difficulty)}>
                                {rec.difficulty} Difficulty
                              </Badge>
                            </div>
                            
                            <Text variant="bodyMd">
                              {rec.description}
                            </Text>
                            
                            <div style={{ display: 'flex', gap: '16px' }}>
                              <Text variant="bodySm" color="subdued">
                                Impact: {rec.impact}
                              </Text>
                              <Text variant="bodySm" color="subdued">
                                Timeline: {rec.timeline}
                              </Text>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </Box>
                </Card>
              </Layout.Section>
            )}

            {/* Medium Priority Recommendations */}
            {suggestions.data.mediumPriority && suggestions.data.mediumPriority.length > 0 && (
              <Layout.Section>
                <Card>
                  <Text variant="headingMd" as="h2">
                    ⚡ Medium Priority Recommendations
                  </Text>
                  <Box paddingBlockStart="400">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {suggestions.data.mediumPriority.map((rec, index) => (
                        <Card key={index} sectioned>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {rec.title}
                              </Text>
                              <Badge tone={getPriorityColor('medium')}>Medium Priority</Badge>
                              <Badge tone={getDifficultyColor(rec.difficulty)}>
                                {rec.difficulty} Difficulty
                              </Badge>
                            </div>
                            
                            <Text variant="bodyMd">
                              {rec.description}
                            </Text>
                            
                            <div style={{ display: 'flex', gap: '16px' }}>
                              <Text variant="bodySm" color="subdued">
                                Impact: {rec.impact}
                              </Text>
                              <Text variant="bodySm" color="subdued">
                                Timeline: {rec.timeline}
                              </Text>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </Box>
                </Card>
              </Layout.Section>
            )}

            {/* Low Priority Recommendations */}
            {suggestions.data.lowPriority && suggestions.data.lowPriority.length > 0 && (
              <Layout.Section>
                <Card>
                  <Text variant="headingMd" as="h2">
                    💡 Low Priority Recommendations
                  </Text>
                  <Box paddingBlockStart="400">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {suggestions.data.lowPriority.map((rec, index) => (
                        <Card key={index} sectioned>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Text variant="bodyMd" fontWeight="semibold">
                                {rec.title}
                              </Text>
                              <Badge tone={getPriorityColor('low')}>Low Priority</Badge>
                              <Badge tone={getDifficultyColor(rec.difficulty)}>
                                {rec.difficulty} Difficulty
                              </Badge>
                            </div>
                            
                            <Text variant="bodyMd">
                              {rec.description}
                            </Text>
                            
                            <div style={{ display: 'flex', gap: '16px' }}>
                              <Text variant="bodySm" color="subdued">
                                Impact: {rec.impact}
                              </Text>
                              <Text variant="bodySm" color="subdued">
                                Timeline: {rec.timeline}
                              </Text>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </Box>
                </Card>
              </Layout.Section>
            )}
          </>
        )}

        {/* Top Pages Performance */}
        {performanceSummary && performanceSummary.topPages && (
          <Layout.Section secondary>
            <Card>
              <Text variant="headingMd" as="h2">
                Top Performing Pages
              </Text>
              <Box paddingBlockStart="400">
                <List type="bullet">
                  {performanceSummary.topPages.map((page, index) => (
                    <List.Item key={index}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Text variant="bodyMd" fontWeight="semibold">
                          {page.path}
                        </Text>
                        <Text variant="bodySm" color="subdued">
                          {page.pageViews.toLocaleString()} views • 
                          {page.bounceRate ? ` ${(page.bounceRate * 100).toFixed(1)}% bounce rate` : ' No bounce data'}
                        </Text>
                        {page.title && (
                          <Text variant="bodySm" color="subdued">
                            {page.title}
                          </Text>
                        )}
                      </div>
                    </List.Item>
                  ))}
                </List>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* Top Traffic Sources */}
        {performanceSummary && performanceSummary.topTrafficSources && (
          <Layout.Section secondary>
            <Card>
              <Text variant="headingMd" as="h2">
                Top Traffic Sources
              </Text>
              <Box paddingBlockStart="400">
                <List type="bullet">
                  {performanceSummary.topTrafficSources.map((source, index) => (
                    <List.Item key={index}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <Text variant="bodyMd" fontWeight="semibold">
                            {source.source} / {source.medium}
                          </Text>
                          <Badge>{source.channelGroup}</Badge>
                        </div>
                        <Text variant="bodySm" color="subdued">
                          {source.sessions.toLocaleString()} sessions • 
                          {source.users.toLocaleString()} users
                          {source.bounceRate ? ` • ${(source.bounceRate * 100).toFixed(1)}% bounce rate` : ''}
                        </Text>
                      </div>
                    </List.Item>
                  ))}
                </List>
              </Box>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

# SMB-OS - Small Business Operating System

A comprehensive Shopify app built with Remix that provides AI-powered tools for small businesses to optimize their e-commerce operations.

## Features

- **AI Product Generator**: Automatically generate product descriptions and optimize listings
- **SEO Optimizer**: AI-powered SEO analysis and optimization recommendations
- **Analytics Dashboard**: Comprehensive analytics integration with Google Analytics and Search Console
- **Webhook Management**: Automated webhook handling for product and order updates
- **Initial Sync**: Seamless data synchronization with Shopify stores

## Tech Stack

- **Framework**: Remix (React-based full-stack framework)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Shopify OAuth
- **AI Integration**: OpenAI GPT models
- **Analytics**: Google Analytics 4, Google Search Console
- **Deployment**: Docker-ready with Azure DevOps integration

## Project Structure

```
├── app/                    # Main application code
│   ├── routes/            # Remix routes
│   ├── services/          # Business logic services
│   └── components/        # React components
├── prisma/                # Database schema and migrations
├── scripts/               # Utility scripts
├── public/                # Static assets
└── extensions/            # Shopify app extensions
```

## Key Services

- **AI Product Generator**: Generates optimized product descriptions using AI
- **AI SEO Optimizer**: Provides SEO recommendations and optimizations
- **Analytics Service**: Integrates with Google Analytics for comprehensive tracking
- **Initial Sync Service**: Handles data synchronization between Shopify and the app

## Development

This is a Shopify app built with modern web technologies, designed to help small businesses optimize their e-commerce operations through AI-powered tools and comprehensive analytics.

## Environment Setup

The application requires various environment variables for:
- Shopify API credentials
- Database connection
- Google Analytics/Search Console integration
- OpenAI API access

## Database

Uses PostgreSQL with Prisma ORM for data management, including:
- Shop management
- Product synchronization
- Analytics data storage
- User session handling

## Deployment

The application is containerized with Docker and includes configuration for:
- Azure DevOps pipelines
- Environment-specific deployments
- Database migrations
- Webhook management

---

*This project demonstrates full-stack development skills with modern technologies, AI integration, and comprehensive e-commerce solutions.*

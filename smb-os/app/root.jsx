import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-B6JMRMQ46P"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              console.log('Google Analytics script loaded');
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-B6JMRMQ46P');
              console.log('Google Analytics initialized with ID: G-B6JMRMQ46P');
            `,
          }}
        />
        
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        
        {/* Alternative Google Analytics implementation */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Fallback Google Analytics implementation
              if (typeof gtag === 'undefined') {
                console.log('Setting up fallback Google Analytics');
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-B6JMRMQ46P');
                console.log('Fallback Google Analytics initialized');
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

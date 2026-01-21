import { createServer } from './server';
import { config } from './config';

const app = createServer();

// Export for Vercel serverless
export default app;

// Only listen when running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(config.server.port, config.server.host, () => {
    console.log(`ArcShopper running at http://${config.server.host}:${config.server.port}`);
    console.log(`Network: ${config.arc.caip2} | Explorer: ${config.arc.explorerUrl}`);
  });
}

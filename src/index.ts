import { createServer } from './server';
import { config } from './config';

const app = createServer();

app.listen(config.server.port, config.server.host, () => {
  console.log(`ArcBot running at http://${config.server.host}:${config.server.port}`);
  console.log(`Network: ${config.arc.caip2} | Explorer: ${config.arc.explorerUrl}`);
});

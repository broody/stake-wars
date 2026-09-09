import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/', import.meta.url));
const { build, loadEnv, preview } = await import(
  new URL('../apps/web/node_modules/vite/dist/node/index.js', import.meta.url)
);
// Tailwind resolves its configuration relative to the working directory.
process.chdir(root);
process.env.NODE_ENV = 'production';
const environment = loadEnv('mainnet', root, 'VITE_');
if (environment.VITE_STARKNET_CHAIN_ID !== 'SN_MAIN') {
  throw new Error('dev:web:prod requires the SN_MAIN environment.');
}

const local = 'http://localhost:3000/__prod';
const rpc = new URL(environment.VITE_STARKNET_RPC_URL);
const torii = new URL(environment.VITE_TORII_GRAPHQL_URL);
if (torii.origin !== new URL(environment.VITE_API_DOMAIN).origin) {
  throw new Error('The production Torii gateway must use the API origin.');
}
const upstreams = {
  api: environment.VITE_API_DOMAIN,
  rpc: rpc.origin,
  operator: environment.VITE_WHISPER_OPERATOR_URL,
  assets: 'https://assets.stakewars.gg',
};
Object.assign(process.env, environment, {
  VITE_API_DOMAIN: `${local}/api`,
  VITE_STARKNET_RPC_URL: `${local}/rpc${rpc.pathname}${rpc.search}`,
  VITE_TORII_GRAPHQL_URL: `${local}/api${torii.pathname}${torii.search}`,
  VITE_WHISPER_OPERATOR_URL: `${local}/operator`,
});

function installGateway(server) {
  server.middlewares.use(async (request, response, next) => {
    const match = request.url?.match(
      /^\/__prod\/(api|rpc|operator|assets)(\/.*|$)/
    );
    if (!match) return next();

    try {
      // Production services accept the deployed site's origin. Keep the local
      // gateway bound to localhost and send browser requests through it.
      const headers = new Headers({ Origin: 'https://stakewars.gg' });
      for (const name of ['content-type', 'accept', 'authorization']) {
        if (typeof request.headers[name] === 'string') {
          headers.set(name, request.headers[name]);
        }
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const upstream = await fetch(upstreams[match[1]] + (match[2] || '/'), {
        method: request.method,
        headers,
        ...(!['GET', 'HEAD'].includes(request.method) && body.length
          ? { body }
          : {}),
        signal: AbortSignal.timeout(30_000),
      });
      response.statusCode = upstream.status;
      // fetch decompresses the response; do not forward its original encoding
      // or content length, especially when rewriting artwork URLs below.
      for (const name of ['content-type', 'cache-control', 'last-modified']) {
        if (upstream.headers.has(name)) {
          response.setHeader(name, upstream.headers.get(name));
        }
      }
      if (upstream.headers.get('content-type')?.includes('application/json')) {
        const json = (await upstream.text()).replaceAll(
          `${upstreams.assets}/`,
          `${local}/assets/`
        );
        response.end(json);
      } else {
        response.end(Buffer.from(await upstream.arrayBuffer()));
      }
    } catch (error) {
      console.error('Production gateway request failed:', error.message);
      response.statusCode = 502;
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({ error: 'Production upstream unavailable' })
      );
    }
  });
}

const directory = await mkdtemp(join(tmpdir(), 'stakewars-prod-local-'));
let server;
async function stop() {
  if (server) {
    const closed = new Promise((resolve) => server.httpServer.close(resolve));
    server.httpServer.closeAllConnections();
    await closed;
  }
  await rm(directory, { recursive: true, force: true });
}
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await stop();
    process.exit(0);
  });
}

try {
  const configuration = {
    root,
    configFile: join(root, 'vite.config.ts'),
    mode: 'mainnet',
    build: { outDir: join(directory, 'dist'), emptyOutDir: true },
    preview: { host: 'localhost', port: 3000, strictPort: true },
    plugins: [
      {
        name: 'local-production-gateway',
        configurePreviewServer: installGateway,
      },
    ],
  };
  await build(configuration);
  server = await preview(configuration);
  console.log('\nLocal production build using live Mainnet data:');
  console.log('  http://localhost:3000/play');
  console.log('Press Ctrl+C to stop. Re-run pnpm dev:web:prod to rebuild.');
} catch (error) {
  await stop();
  console.error(error.message);
  process.exitCode = 1;
}

// Bundle the Survivor house bot, the sim and starknet.js into one file that
// runs on any machine with Node 20 or later.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
await build({
  root: local('../'),
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: local('./survivor-bot.ts'),
    outDir: local('../bot-dist/'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'survivor-bot.cjs' },
    },
  },
  ssr: { noExternal: true, target: 'node' },
});

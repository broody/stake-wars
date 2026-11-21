// Build the same simulation the browser plays into the API's Fly build context.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
await build({
  root: local('../'),
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: local('./survivor-verifier.ts'),
    outDir: local('../../api/generated/'),
    emptyOutDir: false,
    minify: true,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'survivor-verifier.cjs' },
    },
  },
  ssr: { noExternal: ['three'] },
});

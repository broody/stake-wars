// The funding page's dev server: the site's Vite config plus a proxy for
// reading balances. The production RPC only answers the stakewars.gg origin,
// so reads go to the RPC in FUND_BOTS_RPC_URL instead. By default that is
// the validator's Pathfinder through an SSH tunnel on local port 19545.
// The wallet sends the transaction through its own RPC either way.
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config';

const target = new URL(
  process.env.FUND_BOTS_RPC_URL ?? 'http://127.0.0.1:19545/rpc/v0_9'
);

export default mergeConfig(
  base,
  defineConfig({
    server: {
      proxy: {
        '/fund-bots-rpc': {
          target: target.origin,
          changeOrigin: true,
          rewrite: () => target.pathname,
        },
      },
    },
  })
);

// Write the Survivor bot wallets' public addresses for the local funding page.
// It reads the sncast accounts file but copies only each account's name,
// address and type. Private keys never leave that file.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';

const source =
  process.argv[2] ??
  `${homedir()}/.starknet_accounts/stakewars_survivor_bots_sncast.json`;
const target = new URL('../tools/fund-bots/bots.local.json', import.meta.url);

const accounts =
  JSON.parse(readFileSync(source, 'utf8'))['alpha-mainnet'] ?? {};
const bots = Object.entries(accounts)
  .filter(([name]) => name.startsWith('survivor-bot-'))
  .map(([name, account]) => ({
    name,
    address: account.address,
    type: account.type,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (bots.length === 0) {
  console.error(`No survivor-bot-* mainnet accounts in ${source}.`);
  process.exit(1);
}
writeFileSync(target, JSON.stringify(bots, null, 2) + '\n');
console.log(`Wrote ${bots.length} bot addresses for the funding page.`);

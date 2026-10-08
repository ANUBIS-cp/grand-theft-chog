// Spot-checks the generated data against the Chog contract on Monad.
// Usage: node packages/data/scripts/verify-onchain.ts [count]
import { createPublicClient, http, parseAbi } from 'viem';
import { CHOGS, COLLECTION, metadataIdFor } from '../src/index.ts';

const RPC = process.env.MONAD_RPC ?? 'https://rpc.monad.xyz';
const abi = parseAbi([
  'function tokenURI(uint256) view returns (string)',
  'function totalSupply() view returns (uint256)',
]);
const client = createPublicClient({ transport: http(RPC, { retryCount: 2 }) });
const n = Number(process.argv[2] ?? 25);

try {
  const supply = await client.readContract({
    address: COLLECTION.contract,
    abi,
    functionName: 'totalSupply',
  });
  if (supply !== BigInt(COLLECTION.supply)) throw new Error(`totalSupply ${supply} != ${COLLECTION.supply}`);
  const picks = new Set<number>([1, COLLECTION.supply]);
  while (picks.size < n) picks.add(1 + Math.floor(Math.random() * COLLECTION.supply));
  let ok = 0;
  for (const id of picks) {
    const uri = await client.readContract({
      address: COLLECTION.contract,
      abi,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    });
    const expected = `${COLLECTION.baseURI}${metadataIdFor(id)}.json`;
    if (uri !== expected || CHOGS[id - 1]!.metadataId !== metadataIdFor(id)) {
      console.log(`MISMATCH token ${id}`);
      process.exitCode = 1;
    } else ok++;
  }
  console.log(`${ok}/${picks.size} tokens match tokenURI on-chain; totalSupply ${supply}`);
} catch (e) {
  // Never print the error object: it can contain the RPC URL.
  console.log('error', (e as { name?: string }).name ?? 'unknown');
  process.exitCode = 1;
}

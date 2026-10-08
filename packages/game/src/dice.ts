import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Every roll in the game: HMAC-SHA256(daySeed, label) -> 1..100.
 * The hash of each day's seed is published on Monad before the day starts and the seed after it ends,
 * so anyone can recompute every roll and nobody can predict one in advance.
 * Labels are built from game state only (see `rollLabel`), never from anything the server can pick freely.
 */
export function roll(seedHex: string, label: string): number {
  const mac = hmac(sha256, hexToBytes(seedHex), utf8ToBytes(label));
  const n = ((mac[0]! << 24) | (mac[1]! << 16) | (mac[2]! << 8) | mac[3]!) >>> 0;
  return (n % 100) + 1;
}

/** A roll succeeds when it is at or under the odds (odds 64 -> rolls 1..64 win). */
export function passes(rollValue: number, odds: number): boolean {
  return rollValue <= odds;
}

export function rollLabel(kind: string, ...parts: (string | number)[]): string {
  return [kind, ...parts].join(':');
}

/** The value published on-chain before the day: sha256 of the seed bytes. */
export function seedCommitment(seedHex: string): string {
  return bytesToHex(sha256(hexToBytes(seedHex)));
}

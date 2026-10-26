import { describe, expect, it } from 'vitest';
import { chatHistory, cleanText, say } from './chat.ts';

describe('chat', () => {
  it('keeps plain text and takes out links', () => {
    expect(cleanText('  gm   chogs \n')).toBe('gm chogs');
    expect(cleanText('claim at https://evil.example/x now')).toBe('claim at [link] now');
    expect(cleanText('go to chog-airdrop.xyz fast')).toBe('go to [link] fast');
    expect(cleanText('a‮b​c')).toBe('a b c');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText('x'.repeat(300))!.length).toBe(241);
  });

  it('only Chogs talk, gang rooms need a gang, and floods are slowed', () => {
    const me = { chog: 7, name: 'Chog #7', gang: 'lazoor' };
    expect(say({ chog: null, name: 'Guest', gang: null }, 'city', 'hi', 0)).toBe('guest');
    expect(say({ ...me, gang: null }, 'gang', 'hi', 0)).toBe('no-gang');
    const m = say(me, 'gang', 'robbing mcga, who is in?', 1000);
    expect(typeof m === 'object' && m.gang).toBe('lazoor');
    expect(say(me, 'city', 'again', 1200)).toBe('slow');
    for (let i = 1; i <= 4; i++) expect(typeof say(me, 'city', `m${i}`, 1000 + i * 1000)).toBe('object');
    expect(say(me, 'city', 'too many', 5500)).toBe('slow');
    expect(chatHistory('lazoor').some((x) => x.room === 'gang')).toBe(true);
    expect(chatHistory('mcga').some((x) => x.room === 'gang')).toBe(false);
  });

  it('sends Chog stickers by number only', () => {
    const me = { chog: 8, name: 'Chog #8', gang: null };
    const m = say(me, 'city', 'ignored', 50_000, 16);
    expect(typeof m === 'object' && [m.sticker, m.text]).toEqual([16, '😵']);
    expect(say(me, 'city', '', 60_000, 119)).toBe('empty');
    expect(say(me, 'city', '', 70_000, '../x.png')).toBe('empty');
    expect(say(me, 'city', 'hi', 80_000, 2.5)).toMatchObject({ text: 'hi' });
  });
});

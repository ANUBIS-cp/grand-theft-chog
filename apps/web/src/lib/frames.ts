// Screens that refresh 120 times a second (newer iPhones, many Androids) would draw the game twice as often as a
// 60 Hz one for no visible gain, and that's what heats a phone. A game loop asks this each frame: it watches the
// first frames, and on a fast screen draws every other one (120 -> 60, 144 -> 72). A 60 or 90 Hz screen draws
// every frame, as before. Every loop moves things by the time passed, so skipping a frame changes no speed.

/** A new gate for one game loop: call it with each frame's time; false means skip this frame. */
export function frameGate() {
  const gaps: number[] = [];
  let prev = 0;
  let half = false;
  let skip = false;
  return (now: number): boolean => {
    if (prev && gaps.length < 30) {
      gaps.push(now - prev);
      if (gaps.length === 30) half = [...gaps].sort((a, b) => a - b)[15]! < 10.5;
    }
    prev = now;
    if (!half) return true;
    skip = !skip;
    return !skip;
  };
}

// Text length as the whole system counts it (M10-D1): Unicode code points, the same unit as zod's
// `.max()` (importer, cloud mapper) and Postgres `char_length` (cloud constraints). `string.length`
// counts UTF-16 code units and would reject 60 emoji that the file and the cloud accept.

/** Number of Unicode code points in `s` (an emoji or a CJK extension-B character counts once). */
export function charLength(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

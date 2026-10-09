// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { scanUntranslated } from './i18n-scan';

const data = {
  en: { 'nav.today': 'Today', 'goalCard.toGo': '{{n}} min to go', 'goalCard.plusOne': '+1%', 'format.goalsCount_one': '{{count}} goal', 'format.goalsCount_other': '{{count}} goals' },
  vi: { 'nav.today': 'Hôm nay', 'goalCard.toGo': 'Còn {{n}} phút', 'goalCard.plusOne': '+1%', 'format.goalsCount_other': '{{count}} mục tiêu' },
};

describe('scanUntranslated (NFR-11c)', () => {
  it('reports en strings, interpolated en strings, raw keys and a11y attributes; ignores identical values and user data', () => {
    document.body.innerHTML = `
      <main>
        <h1>Hôm nay</h1>
        <p>Today</p>
        <p>10 min to go</p>
        <p>1 goal</p>
        <span>+1%</span>
        <span>Read</span>
        <span>errors.GOAL_NAME_REQUIRED</span>
        <button aria-label="Today"></button>
        <input placeholder="Còn 5 phút" />
      </main>`;
    document.title = 'Today';
    const hits = scanUntranslated(document, data).map((h) => h.text);
    expect(hits).toEqual(['Today', '10 min to go', '1 goal', 'errors.GOAL_NAME_REQUIRED', 'Today', 'Today']);
  });

  it('returns nothing for a translated subtree', () => {
    document.body.innerHTML = '<div id="x"><p>Hôm nay</p><p>Còn 10 phút</p><p>Read</p></div>';
    document.title = '';
    expect(scanUntranslated(document.getElementById('x')!, data)).toEqual([]);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseStringPromise } from 'xml2js';
import { renderMobileBook, renderMobileCurrent, renderMobileFilm, renderMobileMusic, renderMobileInstagram, renderMobileHero, renderMobileSocial, renderMobileDiscord, mobileLines } from './mobile-cards.js';
import { normaliseBook, responsiveCard } from './update-profile.js';
const kit = { normaliseRating: rating => normaliseBook({ user_rating: [rating] }).rating, publicationLabel: value => value ? `published ${value}` : '', monthYear: () => 'Oct 2026' };
const book = { title: 'A title that needs several lines on a small phone screen', author: 'An Author & Another Author', rating: 4.25, published: 'Oct 2026', pages: 341, readAt: '2026-10-17', review: 'the pacing was slow. the characters were compelling. the ending was disappointing.' };

test('mobile cards are valid 360-unit SVGs with no scripts or remote artwork dependencies', async () => {
  const hero = await fs.readFile(new URL('../assets/hero.svg', import.meta.url), 'utf8');
  const svgs = [renderMobileBook(book, null, 0, kit), renderMobileCurrent(null), renderMobileCurrent({ ...book, progress: { page: null, total: null, percent: 42 } }, null), renderMobileFilm({ title: 'Film', year: 2026, rating: 3.5 }, null, 0, kit), renderMobileMusic({ source: 'unavailable', playbackState: 'unknown' }, null), renderMobileInstagram({ username: 'hnitch' }, null), renderMobileHero(hero), renderMobileSocial()];
  for (const svg of svgs) {
    await parseStringPromise(svg);
    assert.match(svg, /viewBox="0 0 360 \d+"/);
    assert.doesNotMatch(svg, /<script|foreignObject|href="https?:|NaN|undefined/);
    const height = Number(svg.match(/height="(\d+)"/)[1]);
    assert.ok(height <= 300, `Unexpectedly tall card: ${height}`);
  }
});
test('mobile ratings keep quarter stars and screen-reader descriptions carry the full title', () => {
  for (let q = 1; q <= 20; q++) {
    const svg = renderMobileBook({ ...book, rating: q / 4 }, null, 0, kit);
    assert.ok(svg.includes(`${q / 4} out of 5 stars`));
    assert.ok(svg.includes(`${q / 4} ★`));
    assert.ok(svg.includes(book.title));
  }
});
test('long labels are ellipsized rather than shrunk into illegible text', () => {
  const result = mobileLines('a really long title with many many many words to fit', 12, 2);
  assert.equal(result.length, 2);
  assert.ok(result[1].endsWith('…'));
  const svg = renderMobileBook(book, null, 0, kit);
  assert.doesNotMatch(svg, /font-size="(?:[0-9]|1[01])(?:\.\d+)?"/);
});
test('empty shelf copy, real progress, and unknown music stay honest', () => {
  assert.match(renderMobileCurrent(null), /not reading anything , rn/);
  assert.match(renderMobileCurrent({ ...book, progress: { page: 148, total: 320, percent: 46.25 } }), /page 148 of 320 · 46.25%/);
  const unknown = renderMobileMusic({ source: 'unavailable', playbackState: 'unknown', title: 'Unverified track', artist: 'Wrong artist' });
  assert.doesNotMatch(unknown, /Unverified track|Wrong artist|now playing/);
});
test('README uses mobile sources with an accessible desktop fallback', () => {
  const html = responsiveCard('goodreads-1', 'Read: title & author; 4.25 stars', 'abc');
  assert.match(html, /media="\(max-width: 600px\)"/);
  assert.match(html, /goodreads-1-mobile.svg\?v=abc/);
  assert.match(html, /<img src=".\/assets\/activity\/goodreads-1.svg\?v=abc"/);
  assert.match(html, /title &amp; author; 4.25 stars/);
});

test('mobile Discord keeps status, guild tag and safe fallback copy', async () => {
  const svg = renderMobileDiscord({ displayName: 'hn', username: 'hnitch', status: 'dnd', guildTag: 'EN', memberSince: 2020, devices: [], activity: 'no public activity right now' }, null);
  await parseStringPromise(svg);
  assert.match(svg, /do not disturb/);
  assert.match(svg, /@hnitch · EN/);
  assert.match(svg, /since 2020/);
});

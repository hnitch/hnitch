import assert from "node:assert/strict";
import test from "node:test";
import { extractReviewMoods, ratingMood } from "./review-moods.js";
import { renderBookCurrent, renderBookTile } from "./update-profile.js";

test("pulls short evidence-backed moods from a mixed review", () => {
  const review = "i BREEZED through it. the atmosphere was gloomy , but i wanted more explanation. horror nonstop.";
  const moods = extractReviewMoods(review);
  assert.deepEqual(moods, ["breezed through", "gloomy", "more explanation"]);
  for (const mood of moods) assert.match(review.toLowerCase(), new RegExp(mood));
});

test("Verity's explicitly denied boredom does not erase its actual mixed reaction", () => {
  const review = "i was flying through chapters because i needed to know. this book is literally the definition of TMI. yet i cannot even pretend i was bored because i read this ridiculously fast. you completely hooked me , grossed me out , pissed me off.";
  assert.deepEqual(extractReviewMoods(review), ["completely hooked me", "definition of tmi", "grossed me out"]);
  assert.deepEqual(extractReviewMoods("i cannot even pretend i was bored"), []);
  assert.deepEqual(extractReviewMoods("i was bored"), ["i was bored"]);
});

test("does not invent moods without written evidence", () => {
  assert.deepEqual(extractReviewMoods(""), []);
  assert.deepEqual(extractReviewMoods("the book is 400 pages long"), []);
  assert.deepEqual(extractReviewMoods("i was not immediately invested"), []);
});

test("A Stage Set for Villains keeps both the enthusiasm and the caveat", () => {
  const review = "every time i picked it back up i was immediately invested again. the whole thing was so dramatic and moody. i really did love this , it just needed tightening.";
  assert.deepEqual(extractReviewMoods(review), ["immediately invested", "dramatic and moody", "needed tightening"]);
});

test("ratings affect only the star chip palette", () => {
  assert.equal(ratingMood(4).color, "#8edfd4");
  assert.equal(ratingMood(3).color, "#ffe58c");
  assert.equal(ratingMood(2).color, "#ff9f9a");
});

test("keeps each chip concise", () => {
  const moods = extractReviewMoods("it completely blindsided me with a spooky aesthetic , beautiful prose and mystery / thriller elements");
  assert.ok(moods.length <= 3);
  assert.ok(moods.every((mood) => mood.length <= 22));
});

test("empty shelf is honest and fully designed", () => {
  const svg = renderBookCurrent(null, null);
  assert.match(svg, /not reading anything , RN/);
  assert.match(svg, /font-size="22" font-style="italic"/);
  assert.match(svg, /translate\(43 51\) scale\(\.76\)/);
  assert.match(svg, />\.\.\.<\/text>/);
  assert.doesNotMatch(svg, /it never stays this way for long|right now\./);
  assert.doesNotMatch(svg, /NEXT CHAPTER PENDING/);
  assert.doesNotMatch(svg, /between books|obsession is loading|progress not shared/);
});

test("read receipt shows review-grounded chips instead of a summary", () => {
  const svg = renderBookTile({
    title: "Example Book", author: "Example Author", rating: 4,
    review: "this completely blindsided me. i loved the spooky aesthetic and mystery/thriller blend.",
  }, null, 0);
  assert.match(svg, /blindsided me/);
  assert.match(svg, /spooky aesthetic/);
  assert.match(svg, /mystery\/thriller/);
  assert.match(svg, /#163b39/);
  assert.doesNotMatch(svg, /reviewSummary|H164 194H810/);
});

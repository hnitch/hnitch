import assert from "node:assert/strict";
import test from "node:test";
import { extractReviewMoods, ratingMood } from "./review-moods.js";
import { renderBookCurrent, renderBookTile } from "./update-profile.js";

test("pulls short evidence-backed moods from a mixed review", () => {
  const review = "i BREEZED through it. the atmosphere was gloomy , but i wanted more explanation. horror nonstop.";
  const moods = extractReviewMoods(review);
  assert.deepEqual(moods, ["breezed through", "gloomy", "horror"]);
  for (const mood of moods) assert.match(review.toLowerCase(), new RegExp(mood));
});

test("does not invent moods without written evidence", () => {
  assert.deepEqual(extractReviewMoods(""), []);
  assert.deepEqual(extractReviewMoods("the book is 400 pages long"), []);
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
  assert.match(svg, /not reading anything/);
  assert.match(svg, /it never stays this way for long/);
  assert.match(svg, /NEXT CHAPTER PENDING/);
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

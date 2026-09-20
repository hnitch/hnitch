import assert from "node:assert/strict";
import test from "node:test";
import { matchFableProgress, progressFromFable } from "./fable-progress.js";

const book = { title: "Verity", author: "Colleen Hoover" };
const entry = (reading_progress, title = "Verity", author = "Colleen Hoover") => ({
  book: { title, authors: [{ name: author }], page_count: 336 },
  reading_progress,
});

test("uses only logged Fable progress, never the catalogue page count", () => {
  assert.deepEqual(progressFromFable(entry({ current_page: 96, page_count: 320 })), {
    page: 96, total: 320, percent: 30, source: "fable",
  });
  assert.equal(progressFromFable(entry(null)), null);
  assert.equal(progressFromFable(entry({ current_page: 96 })), null);
});

test("matches an unambiguous Goodreads title and author", () => {
  assert.equal(matchFableProgress(book, [entry({ current_page: 96, page_count: 320 })])?.percent, 30);
  assert.equal(matchFableProgress(book, [entry({ current_page: 96, page_count: 320 }, "Verity", "Someone Else")]), null);
  assert.equal(matchFableProgress(book, [entry({ current_page: 96, page_count: 320 }), entry({ current_page: 40, page_count: 320 })]), null);
  assert.equal(matchFableProgress({ title: "Vengeful (Villains , #2)", author: "V. E. Schwab" }, [entry({ current_page: 80, page_count: 400 }, "Vengeful", "V. E. Schwab")])?.percent, 20);
});

test("rejects impossible progress", () => {
  assert.equal(progressFromFable(entry({ current_page: 400, page_count: 320 })), null);
  assert.equal(progressFromFable(entry({ current_page: -1, page_count: 320 })), null);
  assert.equal(progressFromFable(entry({ percentage: 112 })), null);
  assert.deepEqual(progressFromFable(entry({ percentage: 22.6 })), {
    page: null, total: null, percent: 23, source: "fable",
  });
});

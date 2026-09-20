import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseReadingProgress, progressForCurrentBook } from "./reading-progress.js";
import { saveReadingProgress, verifyReadingProgress } from "./save-reading-progress.js";

const book = { bookId: "123", title: "Test Book", pages: 341, dateAdded: "2026-09-17T00:00:00Z" };

test("page, edition-specific total, and percentage input", () => {
  assert.deepEqual(parseReadingProgress("148", 341), { page: 148, total: 341, percent: 43, source: "shortcut" });
  assert.deepEqual(parseReadingProgress("148/320", 341), { page: 148, total: 320, percent: 46, source: "shortcut" });
  assert.deepEqual(parseReadingProgress("42%", 341), { page: null, total: null, percent: 42, source: "shortcut" });
  assert.throws(() => parseReadingProgress("342", 341), /greater than/);
  assert.throws(() => parseReadingProgress("101%", 341), /between 0 and 100/);
  assert.throws(() => parseReadingProgress("12", null), /no known page count/);
  assert.throws(() => parseReadingProgress("12abc", 341), /Enter a page/);
});

test("saved progress applies only to the same book and reading session", () => {
  const saved = { bookId: "123", dateAdded: book.dateAdded, updatedAt: "2026-09-20T00:00:00Z", progress: parseReadingProgress("148", 341) };
  assert.deepEqual(progressForCurrentBook(saved, book), saved.progress);
  assert.equal(progressForCurrentBook(saved, { ...book, bookId: "456" }), null);
  assert.equal(progressForCurrentBook(saved, { ...book, dateAdded: "2026-09-18T00:00:00Z" }), null);
  assert.equal(progressForCurrentBook({ ...saved, progress: { ...saved.progress, percent: 99 } }, book), null);
});

test("dispatch rejects a stale book and writes only validated progress", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hnitch-progress-test-"));
  try {
    await fs.mkdir(path.join(root, "data"));
    await fs.writeFile(path.join(root, "data", "activity.json"), JSON.stringify({ goodreads: { current: book } }));
    await assert.rejects(() => saveReadingProgress({ bookId: "456", input: "12", root }), /book changed/);
    await assert.rejects(() => saveReadingProgress({ bookId: "123", input: "500", root }), /greater than/);
    await assert.rejects(fs.stat(path.join(root, "data", "reading-progress.json")));
    assert.equal(await saveReadingProgress({ bookId: "123", input: "148", root }), true);
    const saved = JSON.parse(await fs.readFile(path.join(root, "data", "reading-progress.json"), "utf8"));
    assert.deepEqual(progressForCurrentBook(saved, book), parseReadingProgress("148", 341));
    await assert.rejects(() => verifyReadingProgress({ bookId: "123", root }), /did not reach/);
    await fs.writeFile(path.join(root, "data", "activity.json"), JSON.stringify({ goodreads: { current: { ...book, progress: saved.progress } } }));
    assert.equal(await verifyReadingProgress({ bookId: "123", root }), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

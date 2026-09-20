import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseReadingProgress } from "./reading-progress.js";

export async function saveReadingProgress({ bookId, input, root = process.cwd() }) {
  if (!bookId && !input) return false;
  if (!/^\d+$/.test(String(bookId ?? "")) || !String(input ?? "").trim()) {
    throw new Error("Both the current Goodreads book ID and progress are required");
  }
  const activity = JSON.parse(await fs.readFile(path.join(root, "data", "activity.json"), "utf8"));
  const current = activity.goodreads?.current;
  if (!current || String(current.bookId) !== String(bookId)) {
    throw new Error("The book changed since the shortcut opened. Run it again to load the current book.");
  }
  const progress = parseReadingProgress(input, current.pages);
  await fs.writeFile(path.join(root, "data", "reading-progress.json"), `${JSON.stringify({
    bookId: String(bookId),
    dateAdded: current.dateAdded,
    progress,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log(`saved reading progress for Goodreads book ${bookId}`);
  return true;
}

export async function verifyReadingProgress({ bookId, root = process.cwd() }) {
  const activity = JSON.parse(await fs.readFile(path.join(root, "data", "activity.json"), "utf8"));
  const saved = JSON.parse(await fs.readFile(path.join(root, "data", "reading-progress.json"), "utf8"));
  const current = activity.goodreads?.current;
  if (!current || String(current.bookId) !== String(bookId)
    || JSON.stringify(current.progress) !== JSON.stringify(saved.progress)
    || saved.bookId !== String(bookId)) {
    throw new Error("Progress did not reach the same current Goodreads book. Nothing was committed; please try again.");
  }
  console.log(`verified reading progress for Goodreads book ${bookId}`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const operation = process.argv.includes("--verify")
    ? verifyReadingProgress({ bookId: process.env.READING_BOOK_ID })
    : saveReadingProgress({ bookId: process.env.READING_BOOK_ID, input: process.env.READING_PROGRESS });
  operation
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

import fs from "node:fs/promises";
import { reviewMoodEvidence } from "./review-moods.js";

// Read-only inspection of the exact evidence used by the current cards.
const activity = JSON.parse(await fs.readFile(new URL("../data/activity.json", import.meta.url), "utf8"));
console.log(JSON.stringify(activity.goodreads.recent.map((book) => ({
  title: book.title,
  moods: reviewMoodEvidence(book.review),
})), null, 2));

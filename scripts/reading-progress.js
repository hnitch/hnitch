export function parseReadingProgress(input, defaultTotal) {
  const value = String(input ?? "").trim();
  const percent = value.match(/^(\d{1,3})(?:\.(\d))?%$/);
  if (percent) {
    const amount = Number(`${percent[1]}.${percent[2] ?? "0"}`);
    if (amount > 100) throw new Error("Percentage must be between 0 and 100");
    return { page: null, total: null, percent: Math.round(amount), source: "shortcut" };
  }

  const pages = value.match(/^(\d{1,6})(?:\s*\/\s*(\d{1,6}))?$/);
  if (!pages) throw new Error("Enter a page number, page/total, or percentage (for example: 148, 148/320, 42%)");
  const page = Number(pages[1]);
  const total = pages[2] ? Number(pages[2]) : Number(defaultTotal);
  if (!Number.isSafeInteger(total) || total < 1) {
    throw new Error("This book has no known page count; enter page/total or a percentage");
  }
  if (page > total) throw new Error(`Page ${page} is greater than the total of ${total}`);
  return { page, total, percent: Math.round((page / total) * 100), source: "shortcut" };
}

export function progressForCurrentBook(saved, book) {
  if (!saved || !book || String(saved.bookId) !== String(book.bookId)) return null;
  const savedStart = Date.parse(saved.dateAdded);
  const bookStart = Date.parse(book.dateAdded);
  if (!Number.isFinite(savedStart) || savedStart !== bookStart) return null;
  if (!Number.isFinite(Date.parse(saved.updatedAt))) return null;
  const progress = saved.progress;
  if (!progress || progress.source !== "shortcut") return null;
  if (progress.page === null && progress.total === null) {
    if (!Number.isInteger(progress.percent) || progress.percent < 0 || progress.percent > 100) return null;
    return progress;
  }
  if (!Number.isInteger(progress.page) || !Number.isInteger(progress.total)
    || progress.page < 0 || progress.total < 1 || progress.page > progress.total
    || progress.percent !== Math.round((progress.page / progress.total) * 100)) return null;
  return progress;
}

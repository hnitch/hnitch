function normalise(value = "") {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseTitle(value = "") {
  return normalise(String(value).replace(/\s*\([^)]*#\s*\d+[^)]*\)\s*$/, ""));
}

function validNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function progressFromFable(entry) {
  const progress = entry?.reading_progress;
  if (!progress || typeof progress !== "object") return null;

  const page = validNumber(progress.current_page);
  const total = validNumber(progress.page_count);
  const reportedPercent = validNumber(progress.percent_complete ?? progress.percentage);
  if (page === null && reportedPercent === null) return null;
  if (total !== null && (total === 0 || (page !== null && page > total))) return null;
  if (reportedPercent !== null && reportedPercent > 100) return null;

  const percent = total !== null && page !== null
    ? Math.round((page / total) * 100)
    : reportedPercent !== null
      ? Math.round(reportedPercent)
      : null;
  if (percent === null) return null;
  return { page, total: page === null ? null : total, percent, source: "fable" };
}

export function matchFableProgress(goodreadsBook, entries) {
  if (!goodreadsBook?.title || !goodreadsBook?.author || !Array.isArray(entries)) return null;
  const title = normaliseTitle(goodreadsBook.title);
  const author = normalise(goodreadsBook.author);
  const matches = entries.filter((entry) => {
    if (normaliseTitle(entry?.book?.title) !== title) return false;
    return entry.book.authors?.some((item) => normalise(item?.name) === author);
  });
  if (matches.length !== 1) return null;
  return progressFromFable(matches[0]);
}

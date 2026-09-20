// These chips are deliberately extractive: every label must be supported by
// words in the public review. Ratings control only the colour of the stars.
const PHRASES = [
  { group: "reaction", pattern: /\bblindsided me\b/iu },
  { group: "reaction", pattern: /\bno regrets\b/iu },
  { group: "reaction", pattern: /\bbreezed through\b/iu },
  { group: "reaction", pattern: /\bbinge[ -]?read\b/iu },
  { group: "reaction", pattern: /\bdevoured it\b/iu },
  { group: "reaction", pattern: /\bfight for my life\b/iu },
  { group: "reaction", pattern: /\balmost dnfed\b/iu },
  { group: "reaction", pattern: /\bfigured out\b/iu },
  { group: "reaction", pattern: /\bkept me hooked\b/iu },
  { group: "reaction", pattern: /\bneeded to know\b/iu },
  { group: "reaction", pattern: /\bcould not put (?:it|this) down\b/iu },
  { group: "reaction", pattern: /\bstill thinking\b/iu },
  { group: "reaction", pattern: /\bnot for me\b/iu },
  { group: "reaction", pattern: /\bi loved it\b/iu },
  { group: "reaction", pattern: /\bi was bored\b/iu },
  { group: "craft", pattern: /\bspooky aesthetic\b/iu },
  { group: "craft", pattern: /\bgloomy\b/iu },
  { group: "craft", pattern: /\bunsettling\b/iu },
  { group: "craft", pattern: /\bwall of information\b/iu },
  { group: "craft", pattern: /\binfo overload\b/iu },
  { group: "craft", pattern: /\brushed\b/iu },
  { group: "craft", pattern: /\bweirdly tame\b/iu },
  { group: "craft", pattern: /\bway too many questions\b/iu },
  { group: "craft", pattern: /\bmore explanation\b/iu },
  { group: "craft", pattern: /\bvery shaky\b/iu },
  { group: "craft", pattern: /\bunderdeveloped worldbuilding\b/iu },
  { group: "craft", pattern: /\bbeautiful prose\b/iu },
  { group: "craft", pattern: /\bslow burn\b/iu },
  { group: "craft", pattern: /\bplot twist\b/iu },
  { group: "craft", pattern: /\bchemistry\b/iu },
  { group: "craft", pattern: /\bheartbreaking\b/iu },
  { group: "craft", pattern: /\bchaotic\b/iu },
  { group: "craft", pattern: /\bcreepy\b/iu },
  { group: "craft", pattern: /\bromance\b/iu },
  { group: "genre", pattern: /\bmystery\s*\/\s*thriller\b/iu },
  { group: "genre", pattern: /\bhorror\b/iu },
  { group: "genre", pattern: /\bfantasy\b/iu },
  { group: "genre", pattern: /\bmystery\b/iu },
  { group: "genre", pattern: /\bthriller\b/iu },
  { group: "genre", pattern: /\bsci[ -]?fi\b/iu },
  { group: "genre", pattern: /\bdystopian\b/iu },
];

function cleanReview(review) {
  return String(review || "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractReviewMoods(review, limit = 3) {
  const source = cleanReview(review);
  if (!source) return [];
  const selected = [];
  const groups = new Set();
  for (const { group, pattern } of PHRASES) {
    if (selected.length >= limit) break;
    if (groups.has(group)) continue;
    const match = source.match(pattern);
    if (!match) continue;
    const label = match[0].toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
    if (label.length > 22 || selected.includes(label)) continue;
    selected.push(label);
    groups.add(group);
  }
  // A second pass can add another distinct reaction or craft note before we
  // ever infer anything. A review with no clear match receives no fake tags.
  for (const { pattern } of PHRASES) {
    if (selected.length >= limit) break;
    const match = source.match(pattern);
    if (!match) continue;
    const label = match[0].toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
    if (label.length > 22 || selected.includes(label)) continue;
    selected.push(label);
  }
  return selected;
}

export function ratingMood(rating) {
  const value = Number(rating) || 0;
  if (value >= 4) return { color: "#8edfd4", background: "#163b39" };
  if (value >= 3) return { color: "#ffe58c", background: "#3d3726" };
  if (value > 0) return { color: "#ff9f9a", background: "#462c34" };
  return { color: "#bdb1ca", background: "#332c3b" };
}

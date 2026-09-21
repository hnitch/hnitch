// These chips are deliberately extractive: every label must be supported by
// words in the public review. Ratings control only the colour of the stars.
const PHRASES = [
  { group: "reaction", pattern: /\bcompletely hooked me\b/iu },
  { group: "reaction", pattern: /\bgrossed me out\b/iu },
  { group: "reaction", pattern: /\bpissed me off\b/iu },
  { group: "reaction", pattern: /\bblindsided me\b/iu },
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
  { group: "reaction", pattern: /\bi was bored\b/iu, negationSensitive: true },
  { group: "craft", pattern: /\bdefinition of TMI\b/iu },
  { group: "craft", pattern: /\bthird wheeling\b/iu },
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
  { group: "genre", pattern: /\bmystery\s*\/\s*thriller\b/iu },
  { group: "genre", pattern: /\bhorror\b/iu },
  { group: "genre", pattern: /\bfantasy\b/iu },
  { group: "genre", pattern: /\bmystery\b/iu },
  { group: "genre", pattern: /\bthriller\b/iu },
  { group: "genre", pattern: /\bsci[ -]?fi\b/iu },
  { group: "genre", pattern: /\bdystopian\b/iu },
  { group: "genre", pattern: /\bromance\b/iu },
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
  const candidates = { reaction: [], craft: [], genre: [] };
  for (const { group, pattern, negationSensitive } of PHRASES) {
    const match = source.match(pattern);
    if (!match) continue;
    const label = match[0].toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
    if (label.length > 22 || candidates[group].includes(label)) continue;
    // A literal substring is not an endorsement: "cannot even pretend i was
    // bored" must never be displayed as "i was bored".
    if (negationSensitive) {
      const clause = source.slice(Math.max(0, match.index - 90), match.index).split(/[.!?;…]/u).at(-1);
      const lead = clause.trim().split(/\s+/u).slice(-6).join(" ");
      if (/\b(?:not|never|cannot|can't|couldn't|didn't|did\s+not)\b/iu.test(lead)) continue;
    }
    candidates[group].push(label);
  }
  // Start with the reading experience and a concrete reason. More personal
  // reactions or craft notes outrank generic genre labels for the last chip.
  const selected = [];
  const ranked = [
    candidates.reaction[0], candidates.craft[0],
    ...candidates.reaction.slice(1), ...candidates.craft.slice(1),
    ...candidates.genre,
  ];
  for (const label of ranked) {
    if (selected.length >= limit) break;
    if (label && !selected.includes(label)) selected.push(label);
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

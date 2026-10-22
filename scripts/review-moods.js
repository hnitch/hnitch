// Deterministic, conservative review extraction. Labels are short quotations
// or narrowly defined paraphrases; every result retains its source evidence.
// Genre words are never mood evidence: a comparison is not a classification.
const RULES = [
  // Scoped observations outrank blanket descriptions of the same aspect.
  { label: "creepy first half", aspect: "atmosphere", tone: "positive", priority: 110, pattern: /\bthe first half was creepy(?:y+)?(?: as hell)?\b/iu },
  { label: "slow to start", aspect: "pacing", tone: "negative", priority: 105, pattern: /\b(?:waiting for [^.?!;]{0,65} to start for half the book|(?:practically )?nothing happens for the first (?:50%|half)|(?:mystery|story|plot) takes half the book to (?:properly )?get going)(?!\w)/iu },
  { label: "dragging middle", aspect: "pacing", tone: "negative", priority: 105, pattern: /\ban entire stretch in the middle[^.?!;]{0,160}\bi was begging the story to pick up again\b/iu },
  { label: "flat payoff", aspect: "payoff", tone: "negative", priority: 102, pattern: /\b(?:entire )?payoff (?:feel|felt|was)(?: so| very)? flat\b/iu },
  { label: "predictable ending", aspect: "ending", tone: "negative", priority: 100, pattern: /\b(?:the ending was predictable|exactly what i thought was going to happen\s*[,…]*\s*happened)\b/iu },
  { label: "guessed the twist", aspect: "twists", tone: "negative", priority: 100, pattern: /\b(?:the twist\s*[,…]*\s*(?:yeah\s*)?i guessed it|i (?:literally |already )?guessed the twist)\b/iu },
  { label: "surprise twists", aspect: "twists", tone: "positive", priority: 100, pattern: /\b(?:a few |some |several )?twists i (?:did not|didn't) see coming\b/iu },
  { label: "strong epilogue", aspect: "ending", tone: "positive", priority: 100, pattern: /\b(?:the )?epilogue (?:really )?(?:pulled|tied) (?:things|everything) together\b/iu },
  { label: "hooked throughout", aspect: "engagement", tone: "positive", priority: 103, pattern: /\bi was hooked (?:the entire time|throughout)\b/iu },
  { label: "lost me later", aspect: "engagement", tone: "negative", priority: 104, pattern: /\b(?:second half (?:slowly )?lost me|first half[^.?!;]{0,80}second half[^.?!;]{0,40}lost me)\b/iu },
  { label: "no emotional pull", aspect: "characters", tone: "negative", priority: 96, pattern: /\bi (?:did not|didn't) feel emotionally connected to (?:any of them|the characters)\b/iu },
  { label: "romance fell flat", aspect: "relationships", tone: "negative", priority: 96, pattern: /\bthe romance[^.?!;]{0,75}did (?:absolutely )?nothing for me\b/iu },
  { label: "early giveaway", aspect: "twists", tone: "negative", priority: 95, pattern: /\bi figured out who [^.?!;]{0,45} in record time\b/iu },
  { label: "messy & gory", aspect: "content", tone: "neutral", priority: 90, pattern: /\b(?:it was |this was )?messy\s*,\s*gory\b/iu },
  { label: "loved the variety", aspect: "variety", tone: "positive", priority: 96, pattern: /\b(?:every time i thought i knew[^.?!;]{0,150}something completely different[^.?!;]{0,60}i loved all of it)\b/iu },
  { label: "wanted more lore", aspect: "worldbuilding", tone: "negative", priority: 90, pattern: /\bi (?:really )?wanted more of[^.?!;]{0,30}it is the lore\b/iu },
  { label: "kept thinking", aspect: "engagement", tone: "positive", priority: 90, pattern: /\bkept thinking about it whenever i was doing something else\b/iu },
  { label: "hooked me", aspect: "engagement", tone: "positive", priority: 100, pattern: /\b(?:completely hooked me|kept me hooked|could not put (?:it|this) down|couldn't put (?:it|this) down)\b/iu },
  { label: "immediately invested", aspect: "engagement", tone: "positive", priority: 100, pattern: /\bimmediately invested\b/iu },
  { label: "too much tmi", aspect: "content", tone: "negative", priority: 105, pattern: /\bdefinition of tmi\b/iu },
  { label: "grossed me out", aspect: "reaction", tone: "negative", priority: 95, pattern: /\bgrossed me out\b/iu },
  { label: "pissed me off", aspect: "reaction", tone: "negative", priority: 94, pattern: /\bpissed me off\b/iu },
  { label: "blindsided me", aspect: "surprise", tone: "neutral", priority: 98, pattern: /\bblindsided me\b/iu },
  { label: "breezed through", aspect: "engagement", tone: "positive", priority: 99, pattern: /\b(?:breezed through|binge[ -]?read|devoured it|read (?:this|it) ridiculously fast)\b/iu },
  { label: "needed to know", aspect: "engagement", tone: "positive", priority: 88, pattern: /\bneeded to know\b/iu },
  { label: "almost dnfed", aspect: "engagement", tone: "negative", priority: 100, pattern: /\balmost dnfed\b/iu },
  { label: "hard to finish", aspect: "engagement", tone: "negative", priority: 99, pattern: /\bfight for my life (?:just )?to finish\b/iu },
  { label: "still thinking", aspect: "reaction", tone: "neutral", priority: 80, pattern: /\bstill thinking (?:about (?:it|this|the book))\b/iu },
  { label: "not for me", aspect: "reaction", tone: "negative", priority: 70, pattern: /\bnot for me\b/iu },
  { label: "loved it", aspect: "reaction", tone: "positive", priority: 70, pattern: /\bi loved (?:it|this)\b/iu },
  { label: "i was bored", aspect: "engagement", tone: "negative", priority: 85, pattern: /\bi was bored\b/iu },
  { label: "dramatic & moody", aspect: "atmosphere", tone: "neutral", priority: 95, pattern: /\bdramatic and moody\b/iu },
  { label: "needed tightening", aspect: "pacing", tone: "negative", priority: 99, pattern: /\bneeded tightening\b/iu },
  { label: "third wheeling", aspect: "content", tone: "negative", priority: 85, pattern: /\bthird wheeling\b/iu },
  { label: "spooky aesthetic", aspect: "atmosphere", tone: "neutral", priority: 70, pattern: /\bspooky aesthetic\b/iu },
  { label: "gloomy", aspect: "atmosphere", tone: "neutral", priority: 75, pattern: /\bgloomy\b/iu },
  { label: "unsettling", aspect: "atmosphere", tone: "neutral", priority: 74, pattern: /\bunsettling\b/iu },
  { label: "info overload", aspect: "exposition", tone: "negative", priority: 98, pattern: /\b(?:wall of information|info overload)\b/iu },
  { label: "rushed relationships", aspect: "relationships", tone: "negative", priority: 95, pattern: /\brelationship[^.?!;]{0,100}development was (?:so )?rushed\b/iu },
  { label: "rushed ending", aspect: "ending", tone: "negative", priority: 95, pattern: /\b(?:rushed ending|ending (?:felt|was) (?:so |very |too )?rushed)\b/iu },
  { label: "weirdly tame", aspect: "payoff", tone: "negative", priority: 90, pattern: /\bweirdly tame\b/iu },
  { label: "more explanation", aspect: "exposition", tone: "negative", priority: 80, pattern: /\b(?:wanted|needed|need) (?:a little |much |way )?more explanation\b/iu },
  { label: "shaky finale", aspect: "ending", tone: "negative", priority: 90, pattern: /\b(?:towards? the end[^.?!;]{0,150}(?:very |so )?shaky|final stretch felt so jarring)\b/iu },
  { label: "thin worldbuilding", aspect: "worldbuilding", tone: "negative", priority: 90, pattern: /\bunderdeveloped worldbuilding\b/iu },
  { label: "beautiful prose", aspect: "writing", tone: "positive", priority: 85, pattern: /\bbeautiful prose\b/iu },
  { label: "addictive read", aspect: "engagement", tone: "positive", priority: 100, pattern: /\b(?:this book|the book|the story|it) (?:was|is|felt) (?:so |really |ridiculously |incredibly |very )*addictive\b/iu },
  { label: "excellent pacing", aspect: "pacing", tone: "positive", priority: 99, pattern: /\b(?:the )?pacing (?:was|is|felt) (?:so |really |absolutely )*(?:incredible|excellent|amazing|fantastic)\b/iu },
  { label: "emotional read", aspect: "emotion", tone: "neutral", priority: 90, pattern: /\b(?:emotionally (?:exhausting|intense|overwhelming)|(?:this book|the book|it) (?:was|is) (?:so |really )*emotional)\b/iu },
  { label: "choppy writing", aspect: "writing", tone: "negative", priority: 95, pattern: /\b(?:choppy (?:sentences|writing)|writing (?:was|felt) choppy)\b/iu },
  { label: "strong chemistry", aspect: "relationships", tone: "positive", priority: 85, pattern: /\b(?:great|strong|amazing|incredible) chemistry\b/iu },
  { label: "no chemistry", aspect: "relationships", tone: "negative", priority: 85, pattern: /\b(?:no|zero) chemistry\b/iu },
  { label: "heartbreaking", aspect: "emotion", tone: "neutral", priority: 80, pattern: /\bheartbreaking\b/iu },
  { label: "chaotic", aspect: "atmosphere", tone: "neutral", priority: 70, pattern: /\bchaotic\b/iu },
  { label: "creepy", aspect: "atmosphere", tone: "neutral", priority: 72, pattern: /\bcreepy(?:y+)?\b/iu },
];

function cleanReview(review) {
  return String(review || "")
    .replace(/<br\s*\/?\s*>|<\/p>/giu, "\n")
    .replace(/<[^>]*>/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[‘’]/gu, "'")
    .replace(/&(?:nbsp|amp);/giu, " ")
    .replace(/[^\S\n]+/gu, " ")
    .trim();
}

// Preserve a whole clause as evidence, and re-evaluate each occurrence. A
// rejected early mention must not hide a later, clearly stated reaction.
function clauses(source, title = "") {
  const currentTitle = cleanReview(title).replace(/\s*\([^)]*\)\s*$/u, "").toLowerCase();
  let externalSubject = false;
  return source.split(/(?<=[.!?;])\s+|\n+|\s+\b(?:but|however|instead|yet)\b\s*[, :]*/iu)
    .map((text) => text.trim()).filter(Boolean).map((text) => {
      if (currentTitle.length > 2 && text.toLowerCase().includes(currentTitle)) externalSubject = false;
      else if (EXTERNAL_SUBJECT.test(text)) externalSubject = true;
      else if (/\b(?:this book|the book|this novel|the novel|the story|while reading|i (?:read|went into|picked up))\b/iu.test(text)) externalSubject = false;
      return { text, externalSubject };
    });
}

const EXTERNAL_SUBJECT = /\b(?:movie|film|trailer|teaser|reels|adaptation|sequel|next book|previous book|other books?|last book|first book|book one|book three|cover|edition|artwork|blurb)\b/iu;
const NEGATION = /\b(?:not|never|no|nothing|neither|cannot|can't|couldn't|didn't|wasn't|isn't|weren't|don't|doesn't|did not|was not|is not|hardly|barely)\b/iu;

function supportedContext(clause, match) {
  const before = clause.slice(0, match.index);
  const after = clause.slice(match.index + match[0].length);
  // Skip quoted opinions and references to adaptations, other books, packaging,
  // and general preferences. Conservative rejection is preferable to a guess.
  if (/["“][^"”]*["”]/u.test(clause) || /\?\s*$/u.test(clause)
    || EXTERNAL_SUBJECT.test(clause)
    || /\b(?:people|everyone|friends|readers|reviews|reviewers)\s+(?:said|say|thought|found|called)\b/iu.test(clause)
    || /\b(?:i love (?:books|stories)|usually|normally)\b/iu.test(before)) return false;
  // Expectations and counterfactuals do not describe the reading experience.
  if (/\b(?:expect(?:ed|ing)?|hop(?:e|ed|ing)|wish(?:ed)?|wanted|promised|supposed|would|could|might|if)\b/iu.test(before)) return false;
  // Negation belongs to the matched phrase only when explicitly encoded in its
  // rule (e.g. "not for me", "no chemistry", "twists I didn't see coming").
  // Keep the complete prefix: conjunctions and commas do not end negation.
  // "not because I was bored" and "never said, or thought, I loved it"
  // must not turn into affirmative claims. False omissions are safer than
  // reversing the review; contrast boundaries are handled by clauses().
  const explicitCause = /\bbecause\s*$/iu.test(before)
    && /^(?:this book|the book|the story)\b/iu.test(match[0])
    && /\b(?:before|then|so|and)\s+i\b/iu.test(before)
    && !NEGATION.test(before.split(/\b(?:before|then|so|and)\s+i\b/iu).at(-1))
    && !/\b(?:not|never)(?:\s+\w+){0,3}\s+because\s*$/iu.test(before);
  if (NEGATION.test(before) && !explicitCause) return false;
  // Reported speech, uncertainty and comparisons are not direct reactions.
  if (/\b(?:said|says|say|claimed|claims|told|apparently|supposedly|maybe|perhaps|whether|as if|as though|rather than|instead of)\b/iu.test(before)) return false;
  // Do not flatten a temporary or qualified reaction into a whole-book claim.
  if (/\b(?:at first|initially|for a (?:moment|while)|in places|sometimes|only when|only because|until|used to)\b/iu.test(clause)
    || /\b(?:first|second|last) half\b/iu.test(clause) && !/\b(?:first|second|middle|later|start)\b/iu.test(match[0])) return false;
  if (/^\s*(?:[,:]\s*)?(?:it|this|the book)?\s*(?:was |is )?(?:not|never)\b/iu.test(after)) return false;
  return true;
}

export function reviewMoodEvidence(review, limit = 3, { title = "" } = {}) {
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(3, Math.floor(limit))) : 3;
  if (!count) return [];
  const source = cleanReview(review);
  const segments = clauses(source, title);
  const candidates = [];
  for (const [order, rule] of RULES.entries()) {
    for (const { text: clause, externalSubject } of segments) {
      if (externalSubject) continue;
      for (const match of clause.matchAll(new RegExp(rule.pattern.source, "giu"))) {
        if (!supportedContext(clause, match)) continue;
        candidates.push({ ...rule, order, evidence: clause, matched: match[0] });
        break;
      }
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || a.order - b.order);
  const unique = candidates.filter((item, i) => candidates.findIndex((other) => other.label === item.label) === i);
  // Opposing claims about the same aspect need context we cannot safely
  // compress. Omit that aspect rather than choosing a side from rule order.
  const conflicted = new Set(unique.filter((item) => item.tone !== "neutral"
    && unique.some((other) => other.aspect === item.aspect && other.tone !== "neutral" && other.tone !== item.tone))
    .map((item) => item.aspect));
  const eligible = unique.filter((item) => !conflicted.has(item.aspect));
  const selected = [];
  // Include the strongest specific criticism and praise when both are stated.
  // Never use the star rating to infer sentiment or pad a sparse review.
  // For a one-chip request, keep the strongest evidence regardless of tone.
  if (count === 1 && eligible[0]) selected.push(eligible[0]);
  for (const tone of ["negative", "positive", "neutral"]) {
    const candidate = eligible.find((item) => item.tone === tone && !selected.some((s) => s.aspect === item.aspect));
    if (candidate && selected.length < count) selected.push(candidate);
    if (selected.length === 2) break;
  }
  for (const candidate of eligible) {
    if (selected.length >= count) break;
    if (!selected.some((item) => item.aspect === candidate.aspect)) selected.push(candidate);
  }
  return selected.sort((a, b) => b.priority - a.priority || a.order - b.order)
    .map(({ label, aspect, tone, evidence, matched }) => ({ label, aspect, tone, evidence, matched }));
}

export function extractReviewMoods(review, limit = 3, context = {}) {
  return reviewMoodEvidence(review, limit, context).map(({ label }) => label);
}

export function ratingMood(rating) {
  const value = Number(rating) || 0;
  if (value >= 4) return { color: "#8edfd4", background: "#163b39" };
  if (value >= 3) return { color: "#ffe58c", background: "#3d3726" };
  if (value > 0) return { color: "#ff9f9a", background: "#462c34" };
  return { color: "#bdb1ca", background: "#332c3b" };
}

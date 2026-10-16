import assert from "node:assert/strict";
import test from "node:test";
import { extractReviewMoods, ratingMood, reviewMoodEvidence } from "./review-moods.js";
import { renderBookCurrent, renderBookTile } from "./update-profile.js";

test("pulls short evidence-backed moods from a mixed review", () => {
  const review = "i BREEZED through it. the atmosphere was gloomy , but i wanted more explanation. horror nonstop.";
  const moods = extractReviewMoods(review);
  assert.deepEqual(moods, ["breezed through", "more explanation", "gloomy"]);
  for (const mood of moods) assert.match(review.toLowerCase(), new RegExp(mood));
});

test("Verity's explicitly denied boredom does not erase its actual mixed reaction", () => {
  const review = "i was flying through chapters because i needed to know. this book is literally the definition of TMI. yet i cannot even pretend i was bored because i read this ridiculously fast. you completely hooked me , grossed me out , pissed me off.";
  assert.deepEqual(extractReviewMoods(review), ["too much tmi", "hooked me", "grossed me out"]);
  assert.deepEqual(extractReviewMoods("i cannot even pretend i was bored"), []);
  assert.deepEqual(extractReviewMoods("i was bored"), ["i was bored"]);
});

test("does not invent moods without written evidence", () => {
  assert.deepEqual(extractReviewMoods(""), []);
  assert.deepEqual(extractReviewMoods("the book is 400 pages long"), []);
  assert.deepEqual(extractReviewMoods("i was not immediately invested"), []);
});

test("A Stage Set for Villains keeps both the enthusiasm and the caveat", () => {
  const review = "every time i picked it back up i was immediately invested again. the whole thing was so dramatic and moody. i really did love this , it just needed tightening.";
  assert.deepEqual(extractReviewMoods(review), ["immediately invested", "needed tightening", "dramatic & moody"]);
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
  assert.match(svg, /not reading anything , rn/);
  assert.doesNotMatch(svg, /\bRN\b/);
  assert.match(svg, /font-size="22" font-style="italic"/);
  assert.match(svg, /id="empty-shelf-icon" transform="translate\(94 126\)"/);
  assert.match(svg, /x="-56" y="-56" width="112" height="112"/);
  assert.match(svg, />\.\.\.<\/text>/);
  assert.doesNotMatch(svg, /it never stays this way for long|right now\./);
  assert.doesNotMatch(svg, /NEXT CHAPTER PENDING/);
  assert.doesNotMatch(svg, /between books|obsession is loading|progress not shared/);
});

test("read receipt shows review-grounded chips instead of a summary", () => {
  const svg = renderBookTile({
    title: "Example Book", author: "Example Author", rating: 4,
    review: "this completely blindsided me. i loved the spooky aesthetic and mystery/thriller blend.",
  }, null, 0);
  assert.match(svg, /blindsided me/);
  assert.match(svg, /spooky aesthetic/);
  assert.doesNotMatch(svg, /mystery\/thriller/);
  assert.match(svg, /#163b39/);
  assert.doesNotMatch(svg, /reviewSummary|H164 194H810/);
});

test("Alpine Hotel keeps criticism and credit without classifying comparisons as genres", () => {
  const review = "i expected a clever murder mystery. what i got felt more like a cozy fantasy. i would not consider this a thriller. practically nothing happens for the first 50% of a murder mystery. it made the entire payoff feel so flat. there were a few twists i did not see coming.";
  assert.deepEqual(extractReviewMoods(review), ["slow to start", "flat payoff", "surprise twists"]);
  assert.deepEqual(extractReviewMoods("i expected horror but it felt more like fantasy. this is supposed to be a thriller."), []);
});

test("The Ending Writes Itself preserves enthusiasm alongside a guessed twist", () => {
  const review = "i went into this expecting a dark moody thriller. the twist… yeah i guessed it. the epilogue REALLY pulled things together. i was hooked the entire time.";
  assert.deepEqual(extractReviewMoods(review), ["hooked throughout", "guessed the twist", "strong epilogue"]);
});

test("Incidents keeps the first-half qualification and ignores hopes for its adaptation", () => {
  const review = "the first half was creepy as hell. there was an entire stretch in the middle where everyone was talking and i was begging the story to pick up again. exactly what i thought was going to happen… happened. i hope the movie has beautiful prose. the trailer was chaotic.";
  assert.deepEqual(extractReviewMoods(review), ["creepy first half", "dragging middle", "predictable ending"]);
});

test("negated, hypothetical, quoted and other people's opinions cannot become moods", () => {
  for (const review of [
    "i wanted beautiful prose.", "i expected it to be creepy.", "i hoped it would be heartbreaking.",
    "if only it had beautiful prose.", "i could call it creepy.", "it was never unsettling.",
    "the prose was not beautiful prose.", "i didn't think it needed tightening.",
    "i wasn’t immediately invested.", "i cannot even pretend i was bored.",
    "i did not think i loved it.", 'everyone said "beautiful prose".', "my friends called it creepy.",
    "i loved it?", "the ending was not a flat payoff.",
  ]) assert.deepEqual(extractReviewMoods(review), [], review);
});

test("an early rejected mention does not hide a later direct observation", () => {
  assert.deepEqual(extractReviewMoods("i expected beautiful prose. the book had beautiful prose."), ["beautiful prose"]);
  assert.deepEqual(extractReviewMoods("i expected beautiful prose but the book was unsettling."), ["unsettling"]);
  assert.deepEqual(extractReviewMoods("it wasn't creepy, but the book had beautiful prose."), ["beautiful prose"]);
});

test("other media and books do not leak through following pronouns", () => {
  assert.deepEqual(extractReviewMoods("the movie was creepy. it was heartbreaking. this book had beautiful prose."), ["beautiful prose"]);
  assert.deepEqual(extractReviewMoods("my previous book had beautiful prose. it was unsettling. this book needed tightening."), ["needed tightening"]);
  assert.deepEqual(extractReviewMoods("i loved the edition's spooky aesthetic."), []);
  assert.deepEqual(extractReviewMoods("i saw the teaser reels. it had a spooky aesthetic. the book needed tightening."), ["needed tightening"]);
});

test("specific relationship, engagement and collection observations have constrained labels", () => {
  const review = "i did not feel emotionally connected to any of them. the second half slowly lost me. i noticed the choppy sentences.";
  assert.deepEqual(extractReviewMoods(review), ["lost me later", "no emotional pull", "choppy writing"]);
  assert.deepEqual(extractReviewMoods("the romance did absolutely nothing for me. i figured out who the witch was in record time. the final stretch felt so jarring."), ["romance fell flat", "early giveaway", "shaky finale"]);
  assert.deepEqual(extractReviewMoods("every time i thought i knew the story, it threw something completely different at me and i loved all of it. it was messy, gory."), ["loved the variety", "messy & gory"]);
  assert.deepEqual(extractReviewMoods("i hoped the second half slowly lost me."), []);
});

test("chips cover distinct aspects and keep evidence for every label", () => {
  const review = "this book was gloomy and unsettling and creepy. i breezed through it and needed to know. the ending felt rushed.";
  const results = reviewMoodEvidence(review);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((mood) => mood.aspect)).size, 3);
  for (const mood of results) {
    assert.ok(review.includes(mood.evidence));
    assert.ok(mood.evidence.includes(mood.matched));
    assert.ok(mood.label.length <= 22);
  }
});

test("ambiguous contradictions and sparse reviews are not padded", () => {
  assert.deepEqual(extractReviewMoods("i was hooked throughout. i was bored."), []);
  assert.deepEqual(extractReviewMoods("this book had beautiful prose."), ["beautiful prose"]);
  assert.deepEqual(extractReviewMoods("mystery. thriller. fantasy. chemistry. plot twist."), []);
  assert.deepEqual(extractReviewMoods("i loved it", 0), []);
  assert.deepEqual(extractReviewMoods("i loved it", -1), []);
  assert.deepEqual(extractReviewMoods("i was hooked throughout. the ending was predictable.", 1), ["hooked throughout"]);
});

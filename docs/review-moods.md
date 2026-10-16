# Review mood samplers

The chips describe the reader's experience. They do not assign a book's genre.
Mentioning fantasy, expecting a thriller, or comparing a book with another
story is insufficient evidence for a genre label.

The extractor runs locally as ordinary JavaScript during the profile refresh.
It uses no language model, paid service, credentials, or extra network calls.

## Evidence and selection

- Each rule identifies an explicit observation and maps it to a short quotation
  or constrained paraphrase. For example, "the entire payoff feel so flat"
  supports "flat payoff"; an isolated mention of "payoff" does not.
- Sentence and contrast boundaries separate expectations from what happened.
  Negated, hypothetical, quoted, and attributed opinions are rejected.
- References to adaptations, other books, covers, and editions are excluded.
  An external subject remains excluded until the text returns to the book.
- Qualifiers stay meaningful: "creepy first half" takes precedence over a
  blanket "creepy" label for the same review.
- Specific observations outrank generic reactions. The selection includes
  praise and criticism where both are supported, with one chip per aspect.
  Opposing claims about the same aspect are omitted rather than arbitrarily
  picking one. Ratings never determine or invent mood text.
- There are at most three chips. A sparse or ambiguous review may have fewer;
  a review with no supported matches links to the full review. A book without
  a written review keeps the existing "no written review" state.

This is conservative phrase matching, not general language understanding.
Sarcasm, indirect references, and new wording can still be missed. Prefer
omitting an uncertain label to adding a generic label to reach three chips.

## Inspect and maintain

Run `npm run moods:audit` to see every current label, its aspect, the exact
matched phrase, and its surrounding evidence. It only reads the saved activity
data; it does not refresh or publish anything.

Rules live in `scripts/review-moods.js`. When adding a rule, include a positive
example and counterexamples for negation, expectation, and other subjects in
`scripts/review-moods.test.js`. Avoid book-title-specific overrides. The tests
also cover the original Verity and A Stage Set for Villains regressions.

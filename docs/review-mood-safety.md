# Review mood safeguards

Cards extract up to three short observations from the written review. Ratings
only control the star styling; they must never supply a reaction or override text.

Every selected label retains the source clause and matched phrase. Run
`npm run moods:audit` to inspect the evidence for the current shelf.

## Context rules

- Preserve negation across commas, conjunctions and causal wording. “Not because
  I was bored” is not boredom. An ambiguous negative sentence is omitted.
- Reject expectations, hypothetical statements, quoted or attributed opinions,
  and uncertain comparisons rather than presenting them as the reader's reaction.
- Track references to other books or media through subsequent pronouns. The
  current book's title or an explicit current-book reference can restore context.
  Titles are supplied from book data, never maintained as an exception list.
- Do not turn a temporary reaction into a whole-book claim. Keep supported
  scoped labels, such as “creepy first half”; otherwise omit the observation.
- Omit conflicting claims about the same aspect instead of choosing a side.
- Never pad to three chips when the text supports fewer.

This is a conservative rule-based extractor, not complete language understanding.
It can miss valid observations, especially sarcasm and complex references. A
missing chip is preferable to a confident misrepresentation. New phrase rules
must pass the same context checks as existing ones.

## Regression checks

`npm run check` includes negation matrices across multiple labels, arbitrary-title
comparisons, attribution, uncertainty, temporal qualifiers, mixed reactions, and
the rendered-card check for emotional breaks being misread as boredom. Add new
failures as reusable language patterns, not title-specific overrides.

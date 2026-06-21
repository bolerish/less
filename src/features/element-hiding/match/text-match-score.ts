const MIN_TEXT_SNIPPET_LENGTH = 24;
const EXACT_OR_PREFIX_SCORE = 4;
const CONTAINED_SNIPPET_SCORE = 3;

export function computeTextMatchScore(
  candidateText: string | undefined,
  storedText: string | null | undefined,
): number {
  if (candidateText === undefined || storedText == null) return 0;
  if (candidateText === storedText || candidateText.startsWith(storedText)) return EXACT_OR_PREFIX_SCORE;
  if (storedText.length >= MIN_TEXT_SNIPPET_LENGTH && candidateText.includes(storedText)) {
    return CONTAINED_SNIPPET_SCORE;
  }
  return 0;
}

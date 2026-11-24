import type { Category, Transaction } from '../storage';
import { formatMinorUnits } from './money';

/**
 * A hashtag starts with `#` followed by at least one letter or digit. A bare
 * `#`, `##`, or `#!` is punctuation, not a tag, so it is ignored. Underscores
 * are allowed after the first character (e.g. `#eating_out`).
 */
const HASHTAG_RE = /#[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*/gu;

/**
 * Extract the normalised `#tag` tokens from a description, preserving the
 * first spelling seen and dropping later case-insensitive duplicates.
 */
export function parseTags(description: string | null | undefined): string[] {
  if (!description) return [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const match of description.matchAll(HASHTAG_RE)) {
    const tag = match[0];
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

function normalizeTag(tag?: string): string | null {
  if (tag === undefined) return null;
  const trimmed = tag.trim().toLowerCase();
  if (trimmed === '') return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/**
 * Filter history by the free-text query and, optionally, an exact hashtag.
 * The query matches case-insensitive substrings of the description, the
 * category name, or the formatted rupee amount (`₹123.45`); the tag filter is
 * an exact, case-insensitive hashtag match. Both conditions must hold.
 */
export function filterTransactionsByQueryAndTags(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  query: string,
  selectedTag?: string
): Transaction[] {
  const needle = query.trim().toLowerCase();
  const tag = normalizeTag(selectedTag);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return transactions.filter((transaction) => {
    if (tag !== null) {
      const hasTag = parseTags(transaction.description).some(
        (candidate) => candidate.toLowerCase() === tag
      );
      if (!hasTag) return false;
    }

    if (needle === '') return true;

    const categoryName = categoryNames.get(transaction.categoryId) ?? '';
    const searchable = [
      transaction.description ?? '',
      categoryName,
      formatMinorUnits(transaction.amountMinor),
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(needle);
  });
}

import { describe, expect, test } from 'bun:test';

import {
  filterTransactionsByQueryAndTags,
  parseTags,
} from '../src/lib/transactionSearch';
import type { Category, Transaction } from '../src/storage';

const categories: Category[] = [
  { id: 1, type: 'expense', name: 'Food', isBuiltin: true, isArchived: false },
  { id: 2, type: 'expense', name: 'Transport', isBuiltin: true, isArchived: false },
  { id: 3, type: 'income', name: 'Salary', isBuiltin: true, isArchived: false },
];

function makeTransaction(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    type: 'expense',
    amountMinor: 1000,
    date: '2026-11-01',
    description: null,
    categoryId: 1,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

const transactions: Transaction[] = [
  makeTransaction({ id: 1, amountMinor: 12345, description: 'Team lunch #food', categoryId: 1 }),
  makeTransaction({ id: 2, amountMinor: 45000, description: null, categoryId: 2 }),
  makeTransaction({ id: 3, amountMinor: 100000, description: 'Client payment #sidegig', categoryId: 3 }),
  makeTransaction({ id: 4, amountMinor: 5000, description: 'Coffee #Office #Lunch', categoryId: 1 }),
];

function ids(rows: Transaction[]): number[] {
  return rows.map((row) => row.id);
}

describe('Transaction search and hashtags', () => {
  test('test_parse_tags_extracts_hashtags_and_ignores_empty_or_special_chars', () => {
    expect(parseTags('Team lunch #food with the #Team')).toEqual(['#food', '#Team']);
    expect(parseTags('Bare hashes # and #! ## ### , #')).toEqual([]);
    expect(parseTags('Punctuation #_ #__ #.,; ')).toEqual([]);
    expect(parseTags('#food #Food #FOOD #food')).toEqual(['#food']);
    expect(parseTags('  #travel_2026  #lunch  ')).toEqual(['#travel_2026', '#lunch']);
    expect(parseTags('Trailing #food, and (bracketed) #work.')).toEqual([
      '#food',
      '#work',
    ]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('no hashtags here')).toEqual([]);
  });

  test('test_filter_by_query_matches_description_category_and_formatted_rupees', () => {
    // Description (case-insensitive, includes a second word in the same row).
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, 'lunch'))).toEqual([
      1, 4,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, 'COFFEE'))).toEqual([
      4,
    ]);

    // Category name, even when the row has no description at all.
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, 'transport'))).toEqual([
      2,
    ]);

    // Formatted rupee amount, with and without the currency symbol/grouping.
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '123.45'))).toEqual([
      1,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '₹123.45'))).toEqual([
      1,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '₹1,000.00'))).toEqual([
      3,
    ]);

    // Whitespace-only and unmatched queries.
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '   '))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, 'no-such-thing'))).toEqual(
      []
    );
  });

  test('test_filter_by_query_and_tag_combines_filters_accurately', () => {
    // Tag alone, with and without the leading '#' and in any case.
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '', '#food'))).toEqual([
      1,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '', 'food'))).toEqual([
      1,
    ]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '', '#LUNCH'))).toEqual([
      4,
    ]);

    // Query and tag are combined with AND.
    expect(
      ids(filterTransactionsByQueryAndTags(transactions, categories, 'coffee', '#office'))
    ).toEqual([4]);
    expect(
      ids(filterTransactionsByQueryAndTags(transactions, categories, 'lunch', '#office'))
    ).toEqual([4]);
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, 'coffee', '#food'))).toEqual(
      []
    );
    expect(
      ids(filterTransactionsByQueryAndTags(transactions, categories, 'no-such-thing', '#food'))
    ).toEqual([]);

    // Category search still works together with a tag.
    expect(
      ids(filterTransactionsByQueryAndTags(transactions, categories, 'salary', '#sidegig'))
    ).toEqual([3]);

    // An unknown or empty tag matches nothing rather than everything.
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '', '#missing'))).toEqual(
      []
    );
    expect(ids(filterTransactionsByQueryAndTags(transactions, categories, '', '   '))).toEqual([
      1, 2, 3, 4,
    ]);

    // A description without hashtags can never satisfy a tag filter.
    expect(
      ids(filterTransactionsByQueryAndTags([transactions[1]], categories, 'transport', '#transport'))
    ).toEqual([]);
  });
});

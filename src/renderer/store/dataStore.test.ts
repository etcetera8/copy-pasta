// @vitest-environment jsdom
//
// Characterization tests for the CURRENT (pre-modernization) store.
//
// These pin down two real defects so the Phase 3 rewrite has a concrete target.
// `it.fails` asserts that the body currently THROWS — i.e. the behaviour is
// known-broken today. Phase 3 replaces dataStore with ClipboardStore and these
// become ordinary passing assertions.
//
// Bug 1: addData aliases `unpinnedData = data` (same array reference), so
//        pinData's splice on unpinnedData also deletes from data.
import { describe, it, expect } from 'vitest';
import dataStore from './dataStore';

describe('dataStore (legacy, known-broken)', () => {
  it.fails('BUG 1: pinning an item should not delete it from data', () => {
    dataStore.clearData();
    dataStore.addData({ text: 'alpha' });
    dataStore.addData({ text: 'beta' });

    const alpha = dataStore.data[0];
    expect(dataStore.data).toHaveLength(2);

    dataStore.pinData(alpha.id);

    // Both items should still exist: one pinned, one not.
    expect(dataStore.data.map((i) => i.text)).toContain('alpha');
    expect(dataStore.data.map((i) => i.text)).toContain('beta');
  });

  it.fails('BUG 1b: data and unpinnedData must not be the same array object', () => {
    dataStore.clearData();
    dataStore.addData({ text: 'gamma' });
    expect(dataStore.unpinnedData).not.toBe(dataStore.data);
  });
});

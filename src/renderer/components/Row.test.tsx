// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '../../shared/types';
import Row from './Row';

const item: Item = { id: 1_700_000_000_000, text: 'alpha', pinned: false };

function renderRow(overrides: Partial<Parameters<typeof Row>[0]> = {}) {
  const { container } = render(
    <Row
      value={item}
      handleClick={vi.fn()}
      handleDelete={vi.fn()}
      handlePin={vi.fn()}
      isEven={false}
      pinned={false}
      {...overrides}
    />,
  );
  return container.querySelector('.row')!;
}

describe('Row', () => {
  // Bug 14: the class was `!isEven ? 'even' : ''`, so the zebra stripe landed
  // on the odd rows and the first row was never striped.
  it('marks an even row with the even class', () => {
    expect(renderRow({ isEven: true }).classList.contains('even')).toBe(true);
  });

  it('leaves an odd row unstriped', () => {
    expect(renderRow({ isEven: false }).classList.contains('even')).toBe(false);
  });
});

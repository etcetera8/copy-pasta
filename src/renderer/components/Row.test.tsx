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

  // The pin art is a CSS mask keyed off `aria-pressed`, so which of the two
  // SVGs is painted is not observable in jsdom -- assert the state that
  // selects it, and that the icon element is present to be masked.
  it('shows the outline pin when unpinned', () => {
    const button = renderRow({ pinned: false }).querySelector('.pin-btn')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Pin');
    expect(button.querySelector('.pin-icon')).not.toBeNull();
  });

  it('shows the filled pin when pinned', () => {
    const button = renderRow({ pinned: true }).querySelector('.pin-btn')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Unpin');
    expect(button.querySelector('.pin-icon')).not.toBeNull();
  });

  it('calls handlePin with the row item', () => {
    const handlePin = vi.fn();
    const { container } = render(
      <Row
        value={item}
        handleClick={vi.fn()}
        handleDelete={vi.fn()}
        handlePin={handlePin}
        isEven={false}
        pinned={false}
      />,
    );
    container.querySelector<HTMLButtonElement>('.pin-btn')!.click();
    expect(handlePin).toHaveBeenCalledWith(item);
  });

});

import type { Item } from '../../shared/types';
import '../styles/row.scss';

interface RowProps {
  value: Item;
  handleClick: (item: Item) => void;
  handleDelete: (id: number) => void;
  handlePin: (item: Item) => void;
  isEven: boolean;
  pinned: boolean;
}

// `Item` no longer carries a preformatted `date` string -- `id` is the capture
// time, so the display value is derived from it.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  month: 'numeric',
  day: '2-digit',
});

const Row = ({ value, handleClick, handleDelete, handlePin, isEven, pinned}: RowProps) => (
  <div
    id={String(value.id)}
    className={`row ${isEven ? 'even' : ''}`}
    data-content={value.text}
  >
    <span
      className="data"
      onClick={(): void => handleClick(value)}
    >
      {value.text}
    </span>
    <span className="date">{dateFormat.format(new Date(value.id))}</span>

    <button
      className="pin-btn"
      onClick={(): void => handlePin(value)}
      aria-pressed={pinned}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      title={pinned ? 'Unpin' : 'Pin'}
    >
      {/* Filled vs outline is chosen in CSS off `aria-pressed`, so the icon
          can be masked to `currentColor` and follow the active theme. */}
      <span className="pin-icon" aria-hidden="true" />
    </button>

    <button className="delete-btn" onClick={(): void => handleDelete(value.id)}>&#10005;</button>
  </div>
);

export default Row;

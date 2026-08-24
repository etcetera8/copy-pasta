import { observer } from 'mobx-react';
import { ChangeEvent, FC, useEffect, useState } from 'react';
import type { Item } from '../../shared/types';
import Row from '../components/Row';
import { DAY_IN_MILLISECONDS } from "../constants";
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ClipboardStore } from '../store/clipboardStore';
import '../styles/landing.scss';

const SEARCH_DEBOUNCE_MS = 500;

interface IProps {
  store: ClipboardStore;
}

export const Landing: FC<IProps>= observer(({ store }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [pageNumber, setPageNumber] = useState<number>(1);
  // The input stays fully controlled and responsive; only the filtering that
  // walks the whole history waits for typing to stop.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    // Clipboard polling lives in the main process now; new text arrives here.
    const offClipboardText = window.copyPasta.onClipboardText(storeCopy);
    const offToggleTheme = window.copyPasta.onToggleTheme(() => {
      store.toggleTheme();
    });
    store.clearExpired();
    document.addEventListener('keydown', escapeListener, false);

    return () => {
      offClipboardText();
      offToggleTheme();
      document.removeEventListener('keydown', escapeListener, false);
    }
  }, [])

  // The handle stays local to the effect. It used to live in `useState`, which
  // meant the `[]`-deps cleanup closed over the first render's `null` and the
  // interval was never cleared -- it outlived every unmount and reload, still
  // holding the store it was created with.
  useEffect(() => {
    const id = setInterval(() => store.clearExpired(), DAY_IN_MILLISECONDS);
    return () => clearInterval(id);
  }, [store]);

  // Driven by the store rather than poked at from the toggle handler, so a
  // theme restored from history.json applies once hydration lands.
  useEffect(() => {
    document.body.classList.toggle('light-theme', store.lightTheme);
  }, [store.lightTheme]);

  const escapeListener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') window.copyPasta.hideWindow();
  }

  const storeCopy = (text: string): void => {
    store.add(text);
  };

  const addToClipboard = (item: Item): void => {
    // The old code deleted the item first and let the clipboard listener
    // re-add it. Main's watcher now suppresses the app's own write
    // (`noteWrite`), so deleting here would just lose the item -- the entry
    // simply stays where it is.
    void window.copyPasta.writeClipboard(item.text);
    window.copyPasta.hideAndPaste();
  }

  const removeFromHistory = (id: number): void => {
    store.remove(id);
  }

  const handlePin = (item: Item): void => {
    store.togglePin(item.id);
  }

  const handleSearch = (e: ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(e.target.value);
  }

  const paginateData = (array: Item[], pageSize = 13): Item[] => (
    array.slice(0, pageNumber * pageSize)
  )

  return(
      <main>
        <h2>Copy Pasta</h2>

        <section className="controls">
          <input
            autoFocus
            className="search"
            type="text"
            placeholder="Search"
            onChange={handleSearch}
            value={searchTerm}
          />
          <button className="btn" onClick={(): void => store.clear()}>Clear All</button>
        </section>
        <section className="row-wrap">
          <div className="flex-around" style={{ height: 40 }}>
            <span className="table-head">Content</span>
            <span className="table-head">Date</span>
          </div>
          {/* One list for both cases: `results` falls back to the full ordered
              history when the query is empty. */}
          {paginateData(store.results(debouncedSearchTerm)).map((v, i) => {
            return (
              <Row
                value={v}
                key={v.id}
                handleClick={addToClipboard}
                handleDelete={removeFromHistory}
                handlePin={handlePin}
                isEven={i % 2 === 0}
                pinned={v.pinned}
              />
            );
          })}
          <button
            className="btn load-more"
            onClick={(): void => setPageNumber(pageNumber + 1)}
          >
            Show More
          </button>
        </section>
      </main>
    )
  }
)

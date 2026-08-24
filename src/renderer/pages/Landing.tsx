import { observer } from 'mobx-react';
import { FC, useEffect, useState } from 'react';
import { DebounceInput } from 'react-debounce-input';
import type { Item } from '../../shared/types';
import Row from '../components/Row';
import { DAY_IN_MILLISECONDS } from "../constants";
import { ClipboardStore } from '../store/clipboardStore';
import '../styles/landing.scss';

interface IProps {
  store: ClipboardStore;
}

export const Landing: FC<IProps>= observer(({ store }) => {
  const  [intervalId, setIntervalId] = useState<NodeJS.Timeout>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [pageNumber, setPageNumber] = useState<number>(1);

  useEffect(() => {
    // Clipboard polling lives in the main process now; new text arrives here.
    const offClipboardText = window.copyPasta.onClipboardText(storeCopy);
    const offToggleTheme = window.copyPasta.onToggleTheme(() => {
      store.toggleTheme();
    });
    checkForExpiredHistoryInterval();
    store.clearExpired();
    document.addEventListener('keydown', escapeListener, false);

    return () => {
      offClipboardText();
      offToggleTheme();
      document.removeEventListener('keydown', escapeListener, false);
      if (intervalId) clearInterval(intervalId);
    }
  }, [])

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

  //TODO: Move up out of component
  const handleSearch = (e: any): void => {
    const { value } = e.target;
    setSearchTerm(value);
  }

  const paginateData = (array: Item[], pageSize = 13): Item[] => (
    array.slice(0, pageNumber * pageSize)
  )

  const checkForExpiredHistoryInterval = (): void => {
    setIntervalId(setInterval(() => {
      store.clearExpired();
    }, DAY_IN_MILLISECONDS))
  }

  return(
      <main>
        <h2>Copy Pasta</h2>

        <section className="controls">
          <DebounceInput
            minLength={1}
            debounceTimeout={500}
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
          {paginateData(store.results(searchTerm)).map((v, i) => {
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

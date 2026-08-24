import { observer } from 'mobx-react';
import React, { FC, useEffect, useState } from 'react';
import { DebounceInput } from 'react-debounce-input';
import Row from '../components/Row';
import { DAY_IN_MILLISECONDS } from "../constants";
import { DataStore } from '../store/dataStore';
import '../styles/landing.scss';
import { InputData, StoreData } from '../types';

interface IProps {
  dataStore: DataStore;
}

export const Landing: FC<IProps>= observer(({ dataStore }) => {
  const  [intervalId, setIntervalId] = useState<NodeJS.Timeout>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [pageNumber, setPageNumber] = useState<number>(1);

  useEffect(() => {
    handleSearch({ target: { value: '' }});
    // Clipboard polling lives in the main process now; new text arrives here.
    const offClipboardText = window.copyPasta.onClipboardText(storeCopy);
    const offToggleTheme = window.copyPasta.onToggleTheme(() => {
      dataStore.toggleTheme();
      renderLightTheme();
    });
    checkForExpiredHistoryInterval();
    dataStore.clearExpiredData();
    document.addEventListener('keydown', escapeListener, false);
    window.setTimeout(() => renderLightTheme(), .1);

    return () => {
      offClipboardText();
      offToggleTheme();
      document.removeEventListener('keydown', escapeListener, false);
      if (intervalId) clearInterval(intervalId);
    }
  }, [])

  useEffect(() => {
    const regEx = new RegExp(searchTerm.toLowerCase());
    const searchResults = dataStore.data.concat(dataStore.pinnedData)
      .filter((item) => regEx.test(item.searchIndex));

    dataStore.populateSearchResults(searchResults);
  }, [searchTerm]);

  const escapeListener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') window.copyPasta.hideWindow();
  }

  const renderLightTheme = (): void => {
    const { classList } = document.body;
    const { lightTheme } = dataStore;

    if (lightTheme && !classList.contains('light-theme')) classList.add('light-theme');
    else classList.remove('light-theme');
  }
  
  const storeCopy = (text: string): void => {
    const copyContent: InputData = { text };

    dataStore.addData(copyContent)
  };

  const addToClipboard = (data: StoreData): void => {
    // The old code deleted the item first and let the clipboard listener
    // re-add it. Main's watcher now suppresses the app's own write
    // (`noteWrite`), so deleting here would just lose the item -- the entry
    // simply stays where it is.
    void window.copyPasta.writeClipboard(data.text);
    window.copyPasta.hideAndPaste();
  }

  const removeFromHistory = (id: number): void => {
    dataStore.removeItem(id);
  }

  const handlePin = (item: StoreData): void => {
    if (dataStore.pinnedData.includes(item)) {
      dataStore.unpinData(item.id);
    } else {
      dataStore.pinData(item.id);
    }
  }

  //TODO: Move up out of component
  const handleSearch = (e: any): void => {
    const { value } = e.target;
    setSearchTerm(value);
  }

  const paginateData = (array: StoreData[], pageSize = 13): StoreData[] => (
    array.slice(0, pageNumber * pageSize)
  )

  const checkForExpiredHistoryInterval = (): void => {
    setIntervalId(setInterval(() => {
      dataStore.clearExpiredData();
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
          <button className="btn" onClick={dataStore.clearData}>Clear All</button>
        </section>
        <section className="row-wrap">
          <div className="flex-around" style={{ height: 40 }}>
            <span className="table-head">Content</span>
            <span className="table-head">Date</span>
          </div>
          {searchTerm && 
            paginateData(
              dataStore.searchResults.slice().reverse()).map((v, i) => {
                return (
                  <Row
                    value={v}
                    key={v.id}
                    handleClick={addToClipboard}
                    handleDelete={removeFromHistory}
                    handlePin={handlePin}
                    isEven={i % 2 === 0}
                    pinned={dataStore.pinnedData.includes(v)}
                  />
                );
              }
              )
          }
          
          {!searchTerm && 
            paginateData(
              dataStore.pinnedData.concat(
                dataStore.unpinnedData)
              ).map((v, i) => {
                return (
                  <Row
                    value={v}
                    key={v.id}
                    handleClick={addToClipboard}
                    handleDelete={removeFromHistory}
                    handlePin={handlePin}
                    isEven={i % 2 === 0}
                    pinned={dataStore.pinnedData.includes(v)}
                  />
                  )
              }
          )}
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




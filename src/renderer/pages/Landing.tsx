import { clipboard, ipcRenderer, remote } from 'electron';
import clipboardListener from 'electron-clipboard-extended';
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
    listenForChange();
    themeListener();
    checkForExpiredHistoryInterval();
    dataStore.clearExpiredData();
    document.addEventListener('keydown', escapeListener, false);
    clipboardListener.startWatching();
    window.setTimeout(() => renderLightTheme(), .1);

    return () => {
      clipboardListener.stopWatching();
      document.removeEventListener('keydown', escapeListener, false);
      if (intervalId) clearInterval(intervalId);
    }
  }, [])

  useEffect(() => {
    const regEx = new RegExp(searchTerm.toLowerCase());
    const searchResults = dataStore.data
      .filter((item) => regEx.test(item.searchIndex));

    dataStore.populateSearchResults(searchResults);
  }, [searchTerm]);

  const escapeListener = (event: KeyboardEvent): void => {
    if (event.keyCode === 27) remote.getCurrentWindow().hide();
  }

  const themeListener = (): void => {
    ipcRenderer.on('toggleTheme', () => {
      dataStore.toggleTheme();
      renderLightTheme();
    });
  }

  const renderLightTheme = (): void => {
    const { classList } = document.body;
    const { lightTheme } = dataStore;

    if (lightTheme && !classList.contains('light-theme')) classList.add('light-theme');
    else classList.remove('light-theme');
  }
  
  const listenForChange = (): void => {
    // @ts-ignore
    clipboardListener.on('text-changed', () => {
      storeCopy();
    });
    // @ts-ignore
    clipboardListener.on('image-changed', () => {
      const currentImage = clipboardListener.readImage();
      // #TODO: Handle image changes
    });
  }
  
  const storeCopy = (): void => {
    const text = clipboard.readText();
    const copyContent: InputData = { text };

    dataStore.addData(copyContent)
  };

  const addToClipboard = (data: StoreData): void => {
    const mostRecent = dataStore.data[dataStore.data.length - 1];
    if (mostRecent.id !== data.id) removeFromHistory(data.id);
    
    clipboardListener.writeText(data.text);
    ipcRenderer.send('hide');
  }

  const removeFromHistory = (id: number): void => {
    dataStore.removeItem(id);
  }

  handlePin = (item: StoreData): void => {
    if (this.props.dataStore.pinnedData.includes(item)) {
      this.props.dataStore.unpinData(item.id);
    } else {
      this.props.dataStore.pinData(item.id);
    }
  }

  handleSearch = (e: any): void => {
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
          { this.paginateData(this.props.dataStore.pinnedData.concat(this.props.dataStore.searchResults.filter(v => !this.props.dataStore.pinnedData.includes(v)).reverse()))
            .map((v, i) => 
              <Row
                value={v}
                key={v.id}
                handleClick={this.addToClipboard}
                handleDelete={this.removeFromHistory}
                handlePin={this.handlePin}
                isEven={i % 2 === 0}
                pinned={this.props.dataStore.pinnedData.includes(v)}
              />
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




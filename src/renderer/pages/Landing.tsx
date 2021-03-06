import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { DebounceInput } from 'react-debounce-input';
import { clipboard, remote, ipcRenderer } from 'electron';
import clipboardListener from 'electron-clipboard-extended';
import Row from '../components/Row';
import '../styles/landing.scss';
import { InputData, StoreData } from '../types';
import { DataStore } from '../store/dataStore';
const dayInMilliseconds = 86400000;
const hourInMilliseconds = 3600000; // for dev purposes

interface IState {
  success: boolean;
  searchTerm: string;
  pageNumber: number;
}

interface IProps {
  dataStore: DataStore;
}

class Landing extends Component<IProps, IState> {
  private intervalId?: NodeJS.Timeout
  constructor(props: any) {
      super(props);
      this.state = {
        success: false,
        searchTerm: '',
        pageNumber: 1,
      }
      this.intervalId = undefined;
  }

  componentDidMount(): void {
    this.handleSearch({ target: { value: '' }});
    this.listenForChange();
    this.themeListener();
    this.checkForExpiredHistoryInterval();
    this.props.dataStore.clearExpiredData();
    document.addEventListener('keydown', this.escapeListener, false);
    clipboardListener.startWatching();
    window.setTimeout(() => this.renderLightTheme(), .1);
  }

  componentWillUnmount(): void {
    clipboardListener.stopWatching();
    document.removeEventListener('keydown', this.escapeListener, false);
    if (this.intervalId) clearInterval(this.intervalId);
  }

  escapeListener = (event: KeyboardEvent): void => {
    if (event.keyCode === 27) remote.getCurrentWindow().hide();
  }

  themeListener = (): void => {
    ipcRenderer.on('toggleTheme', () => {
      this.props.dataStore.toggleTheme();
      this.renderLightTheme();
    });
  }

  renderLightTheme = (): void => {
    const { classList } = document.body;
    const { lightTheme } = this.props.dataStore;

    if (lightTheme && !classList.contains('light-theme')) classList.add('light-theme');
    else classList.remove('light-theme');
  }
  
  listenForChange = (): void => {
    // @ts-ignore
    clipboardListener.on('text-changed', () => {
      this.storeCopy();
    });
    // @ts-ignore
    clipboardListener.on('image-changed', () => {
      const currentImage = clipboardListener.readImage();
      // #TODO: Handle image changes
    });
  }
  
  storeCopy = (): void => {
    const text = clipboard.readText();
    const copyContent: InputData = { text };

    this.props.dataStore.addData(copyContent)
  };

  addToClipboard = (data: StoreData): void => {
    const { dataStore } = this.props;
    const mostRecent = dataStore.data[dataStore.data.length - 1];
    if (mostRecent.id !== data.id) this.removeFromHistory(data.id);
    
    clipboardListener.writeText(data.text);
    ipcRenderer.send('hide');
  }

  removeFromHistory = (id: number): void => {
    this.props.dataStore.removeItem(id);
  }

  handleSearch = (e: any): void => {
    const { value } = e.target;
    this.setState({
      searchTerm: value,
    }, () => {
      const { searchTerm } = this.state;
      const regEx = new RegExp(searchTerm.toLowerCase());
      const searchResults = this.props.dataStore.data
        .filter((item) => regEx.test(item.searchIndex));

      this.props.dataStore.populateSearchResults(searchResults);
    });
  }

  paginateData = (array: StoreData[], pageSize = 13): StoreData[] => (
    array.slice(0, this.state.pageNumber * pageSize)
  )

  checkForExpiredHistoryInterval = (): void => {
    this.intervalId = setInterval(() => {
      this.props.dataStore.clearExpiredData();
    }, dayInMilliseconds)
  }

  render(): React.ReactElement {
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
            onChange={this.handleSearch}
            value={this.state.searchTerm}
          />
          <button className="btn" onClick={this.props.dataStore.clearData}>Clear All</button>
        </section>
        <section className="row-wrap">
          <div className="flex-around" style={{ height: 40 }}>
            <span className="table-head">Content</span>
            <span className="table-head">Date</span>
          </div>
          { this.paginateData(this.props.dataStore.searchResults.slice().reverse()).map((v, i) => 
            <Row
              value={v}
              key={v.id}
              handleClick={this.addToClipboard}
              handleDelete={this.removeFromHistory}
              isEven={i % 2 === 0}
            />
          )}
          <button
            className="btn load-more"
            onClick={(): void => {
              this.setState((prevState) => ({
                pageNumber: prevState.pageNumber + 1,
              }));
            }}
          >Show More
          </button>
        </section>
      </main>
    )
  }
}

export default observer(Landing); 




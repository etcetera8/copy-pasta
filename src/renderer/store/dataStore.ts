import { observable, configure, action } from 'mobx';
import { create, persist } from 'mobx-persist';
import dateFormat from 'dateformat';
import { InputData, StoreData } from '../types';
const weekMiliseconds = 604800000;

configure({ enforceActions: "observed" });
const hydrate = create({});

export interface DataStore {
  data: StoreData[];
  searchResults: StoreData[];
  pinnedData: StoreData[];
  lightTheme: boolean;
  addData: (data: InputData) => void;
  populateSearchResults: (searchResults: StoreData[]) => void;
  clearData: () => void;
  removeItem: (id: number) => void;
  pinData: (id: number) => void;
  unpinData: (id: number) => void;
  clearExpiredData: () => void;
  toggleTheme: () => void;
}

const DataStore: DataStore = observable({
  data: [],
  searchResults: [],
  pinnedData: [],
  lightTheme: false,
  addData: action((data: InputData): void => {
    DataStore.data.push({
      ...data,
      id: Date.now(),
      date: dateFormat(new Date(), 'h:MM:ss TT - m/dd'),
      searchIndex: data.text.slice(0, 255).toLowerCase(),
    });
    DataStore.searchResults = DataStore.data;
  }),
  populateSearchResults: action((results: StoreData[]) => {
    DataStore.searchResults = results;
  }),
  clearData: action(() => {
    DataStore.data = [];
    DataStore.searchResults = [];
  }),
  removeItem: action((id: number) => {
    DataStore.data = DataStore.data.filter((v: StoreData) => v.id !== id);
    DataStore.searchResults = DataStore.data;
  }),
  pinData: action((id: number) => {
    const itemToPin = DataStore.data.find((v: StoreData) => v.id === id);
    DataStore.pinnedData.push(itemToPin);
  }),
  unpinData: action((id: number) => {
    DataStore.pinnedData = DataStore.pinnedData.filter(v => v.id !== id);
  }),
  clearExpiredData: action(() => {
    const now = Date.now();
    const nonExpiredDates = DataStore.data.filter((data: StoreData) => {
      const compareDates = (now - data.id) < weekMiliseconds;
      if (compareDates) return data;
    });
    DataStore.data = nonExpiredDates;
    DataStore.searchResults = DataStore.data;
  }),
  toggleTheme: action(() => {
    DataStore.lightTheme = !DataStore.lightTheme
  })
});

const DataStoreSchema = {
  lightTheme: true,
  data: {
    type: 'list',
    schema: {
      id: true,
      text: true,
      date: true,
      searchIndex: true,
    }
  },
  searchResults: {
    type: 'list',
    schema: {
      id: true,
      text: true,
      date: true,
      searchIndex: true,
    }
  },
  pinnedData: {
    type: 'list',
    schema: {
      id: true,
      text: true,
      date: true,
      searchIndex: true,
    }
  }
}

export default persist(DataStoreSchema)(DataStore);
hydrate('data', DataStore).then(() => console.log('dataStore has been hydrated'))
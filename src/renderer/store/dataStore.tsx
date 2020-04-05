import { observable, configure, action } from 'mobx';
import { create, persist } from 'mobx-persist';
import dateFormat from 'dateformat';
const weekMiliseconds = 604800000;

configure({ enforceActions: "observed" });
const hydrate = create({});

const DataStore: any = observable({
  data: [],
  searchResults: [],
  addData: action((data: any) => {
    DataStore.data.push({
      ...data,
      id: Date.now(),
      date: dateFormat(new Date(), 'h:MM:ss TT - m/dd'),
      searchIndex: data.text.slice(0, 255).toLowerCase(),
    });
    DataStore.searchResults = DataStore.data;
  }),
  populateSearchResults: action((results: any) => {
    DataStore.searchResults = results
  }),
  clearData: action(() => {
    DataStore.data = [];
    DataStore.searchResults = [];
  }),
  removeItem: action((id: number) => {
    DataStore.data = DataStore.data.filter((v: any) => v.id !== id);
    DataStore.searchResults = DataStore.data;
  }),
  clearExpiredData: action(() => {
    const now = Date.now();
    const nonExpiredDates = DataStore.data.filter((data: any) => {
      const compareDates = (now - data.id) < weekMiliseconds;
      if (compareDates) return data;
    });
    DataStore.data = nonExpiredDates;
    DataStore.searchResults = DataStore.data;
  }),
  lightTheme: false,
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
}

export default persist(DataStoreSchema)(DataStore);
hydrate('data', DataStore).then(() => console.log('dataStore has been hydrated'))
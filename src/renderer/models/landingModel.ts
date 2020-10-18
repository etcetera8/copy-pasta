import { clipboard, remote, ipcRenderer } from 'electron';

const PAGE_SIZE = 13;

export class LandingModel {

  searchTerm = '';
  pageNumber = 1;

  paginateData = (array: any, pageSize = PAGE_SIZE): any[] =>
   array.slice(0, this.pageNumber * pageSize);
}


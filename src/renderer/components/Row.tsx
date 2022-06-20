import React from 'react';
import unpinIcon from '../assets/pin-filled.svg';
import pinIcon from '../assets/pin.svg';
import '../styles/row.scss';
import { StoreData } from '../types';

interface RowProps {
  value: any;
  handleClick: (data: StoreData) => void;
  handleDelete: (id: number) => void;
  handlePin: (data: StoreData) => void;
  isEven: boolean;
  pinned: boolean;
}
const Row = ({ value, handleClick, handleDelete, handlePin, isEven, pinned}: RowProps) => (
  <div
    id={value.id}
    className={`row ${!isEven ? 'even' : ''}`}
    data-content={value.text}
  >
    <span
      className="data"
      onClick={(): void => handleClick(value)}
    >
      {value.text}
    </span>
    <span className="date">{value.date}</span>
    
    {!pinned && 
      <button className='pin-btn' onClick={(): void => handlePin(value)}>
        unpinned
      </button>
    }
    {pinned && 
      <button className='pin-btn' onClick={(): void => handlePin(value)}>
        pinned
      </button>
    }

    <button className="delete-btn" onClick={(): void => handleDelete(value.id)}>&#10005;</button>
  </div>
);

export default Row;
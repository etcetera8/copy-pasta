import React from 'react';
import '../styles/row.scss';
import pinIcon from '../assets/pin.svg';
import unpinIcon from '../assets/pin-filled.svg';
interface RowProps {
  value: any;
  handleClick: any;
  handleDelete: any;
  handlePin: any;
  isEven: boolean;
  isPinned: boolean;
}

const Row = (props: RowProps): any => {
  const { 
    value,
    handleClick,
    handleDelete,
    handlePin,
    isEven,
    isPinned
  } = props;
    return (
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
          
          <button className='pin-btn' onClick={(): void => handlePin(value)}>
              <img src={isPinned ? unpinIcon : pinIcon} alt="pin icon" />
          </button>

          <button className="delete-btn" onClick={(): void => handleDelete(value.id)}>&#10005;</button>
        </div>
    );
}

export default Row;
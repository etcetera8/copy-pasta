import React from 'react';
import '../styles/row.scss';

interface RowProps {
  value: any;
  handleClick: any;
  handleDelete: any;
  isEven: boolean;
}

export class Row extends React.Component<RowProps> {
  render(): React.ReactElement {
  const { 
    value,
    handleClick,
    handleDelete,
    isEven
  } = this.props;
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
          <button className="delete-btn" onClick={(): void => handleDelete(value.id)}>&#10005;</button>
        </div>
    );
  }
}
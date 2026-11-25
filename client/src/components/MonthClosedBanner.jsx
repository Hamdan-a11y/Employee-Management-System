import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import api from '../services/api';

/**
 * Displays a "Month is closed" notice when the given YYYY-MM period is locked,
 * and notifies parent components via onStatusChange(isClosed).
 */
const MonthClosedBanner = ({ month, onStatusChange }) => {
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    let active = true;
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    api
      .get(`/periods/${targetMonth}/status`)
      .then((res) => {
        if (!active) return;
        const closed = Boolean(res.data?.isClosed || res.data?.status === 'closed');
        setIsClosed(closed);
        if (typeof onStatusChange === 'function') {
          onStatusChange(closed);
        }
      })
      .catch(() => {
        if (!active) return;
        setIsClosed(false);
        if (typeof onStatusChange === 'function') {
          onStatusChange(false);
        }
      });

    return () => {
      active = false;
    };
  }, [month, onStatusChange]);

  if (!isClosed) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        marginBottom: '16px',
        borderRadius: '10px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        fontSize: '0.875rem',
        fontWeight: 500,
      }}
    >
      <Lock size={16} />
      <span>
        <strong>Month is closed</strong> ({month || new Date().toISOString().slice(0, 7)}): attendance and period-affecting edits are locked.
      </span>
    </div>
  );
};

export default MonthClosedBanner;

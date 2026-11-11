import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Check, 
  Sparkles, 
  RotateCcw,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import './DateRangePicker.css';

/**
 * Helper to parse 'YYYY-MM-DD' into a local Date without timezone shifting
 */
function parseISODate(str) {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

/**
 * Format local Date to 'YYYY-MM-DD'
 */
function toISODateString(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format Date to readable string: 'Nov 4, 2026'
 */
function formatDisplayDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isBeforeDay(d1, d2) {
  if (!d1 || !d2) return false;
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return t1 < t2;
}

function isAfterDay(d1, d2) {
  if (!d1 || !d2) return false;
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return t1 > t2;
}

/**
 * Compute days in a 42-cell calendar grid for a given year & month (0-indexed)
 */
function getCalendarMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days = [];

  // Trailing days from previous month
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      isCurrentMonth: false,
    });
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: new Date(year, month, d),
      isCurrentMonth: true,
    });
  }

  // Leading days of next month to complete 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      date: new Date(year, month + 1, d),
      isCurrentMonth: false,
    });
  }

  return days;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'last90', label: 'Last 90 Days' },
  { id: 'thisYear', label: 'This Year' },
  { id: 'lastYear', label: 'Last Year' },
];

export default function DateRangePicker({
  startDate = '',
  endDate = '',
  onChange,
  label = 'Joined Date:'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parsed initial dates
  const parsedStart = useMemo(() => parseISODate(startDate), [startDate]);
  const parsedEnd = useMemo(() => parseISODate(endDate), [endDate]);

  // Current calendar view month (defaults to start date or today)
  const [viewDate, setViewDate] = useState(() => {
    if (parsedStart) return new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Range selection states
  const [tentativeStart, setTentativeStart] = useState(parsedStart);
  const [tentativeEnd, setTentativeEnd] = useState(parsedEnd);
  const [hoverDate, setHoverDate] = useState(null);

  // Sync internal state when external props change
  useEffect(() => {
    setTentativeStart(parsedStart);
    setTentativeEnd(parsedEnd);
    if (parsedStart) {
      setViewDate(new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1));
    }
  }, [parsedStart, parsedEnd]);

  // Close on escape & click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        // Reset tentative to current props
        setTentativeStart(parsedStart);
        setTentativeEnd(parsedEnd);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setTentativeStart(parsedStart);
        setTentativeEnd(parsedEnd);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, parsedStart, parsedEnd]);

  // Months to display in dual view
  const leftYear = viewDate.getFullYear();
  const leftMonth = viewDate.getMonth();
  const rightDate = new Date(leftYear, leftMonth + 1, 1);
  const rightYear = rightDate.getFullYear();
  const rightMonth = rightDate.getMonth();

  const leftMonthDays = useMemo(() => getCalendarMonthDays(leftYear, leftMonth), [leftYear, leftMonth]);
  const rightMonthDays = useMemo(() => getCalendarMonthDays(rightYear, rightMonth), [rightYear, rightMonth]);

  // Month navigation
  const handlePrevMonth = () => {
    setViewDate(new Date(leftYear, leftMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(leftYear, leftMonth + 1, 1));
  };

  const handlePrevYear = () => {
    setViewDate(new Date(leftYear - 1, leftMonth, 1));
  };

  const handleNextYear = () => {
    setViewDate(new Date(leftYear + 1, leftMonth, 1));
  };

  // Date click handler
  const handleDayClick = (dayDate) => {
    if (!tentativeStart || (tentativeStart && tentativeEnd)) {
      // Starting new selection
      setTentativeStart(dayDate);
      setTentativeEnd(null);
    } else if (tentativeStart && !tentativeEnd) {
      // Completing selection
      if (isBeforeDay(dayDate, tentativeStart)) {
        setTentativeStart(dayDate);
        setTentativeEnd(tentativeStart);
      } else {
        setTentativeEnd(dayDate);
      }
    }
  };

  // Apply selected range
  const handleApply = () => {
    if (onChange) {
      onChange({
        startDate: toISODateString(tentativeStart),
        endDate: toISODateString(tentativeEnd || tentativeStart),
      });
    }
    setIsOpen(false);
  };

  // Clear range
  const handleClear = (e) => {
    if (e) e.stopPropagation();
    setTentativeStart(null);
    setTentativeEnd(null);
    if (onChange) {
      onChange({ startDate: '', endDate: '' });
    }
    setIsOpen(false);
  };

  // Preset click handler
  const handlePreset = (presetId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = null;
    let end = null;

    if (presetId === 'all') {
      start = null;
      end = null;
    } else if (presetId === 'today') {
      start = new Date(today);
      end = new Date(today);
    } else if (presetId === 'last7') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      end = new Date(today);
    } else if (presetId === 'last30') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      end = new Date(today);
    } else if (presetId === 'last90') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89);
      end = new Date(today);
    } else if (presetId === 'thisYear') {
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today);
    } else if (presetId === 'lastYear') {
      start = new Date(today.getFullYear() - 1, 0, 1);
      end = new Date(today.getFullYear() - 1, 11, 31);
    }

    setTentativeStart(start);
    setTentativeEnd(end);

    if (start) {
      setViewDate(new Date(start.getFullYear(), start.getMonth(), 1));
    }

    if (onChange) {
      onChange({
        startDate: toISODateString(start),
        endDate: toISODateString(end),
      });
    }

    setIsOpen(false);
  };

  // Check if a day is part of active or hovered range
  const getDayStatus = (d) => {
    const today = new Date();
    const isToday = isSameDay(d, today);

    const activeEnd = tentativeEnd || (tentativeStart && hoverDate && isAfterDay(hoverDate, tentativeStart) ? hoverDate : null);
    const activeStart = tentativeStart && hoverDate && isBeforeDay(hoverDate, tentativeStart) ? hoverDate : tentativeStart;

    const isStart = tentativeStart && isSameDay(d, tentativeStart);
    const isEnd = tentativeEnd && isSameDay(d, tentativeEnd);
    const isInRange = activeStart && activeEnd && isAfterDay(d, activeStart) && isBeforeDay(d, activeEnd);
    const isHoveredEnd = !tentativeEnd && tentativeStart && hoverDate && isSameDay(d, hoverDate) && !isSameDay(d, tentativeStart);

    return {
      isToday,
      isStart,
      isEnd,
      isInRange,
      isHoveredEnd,
      isSelectedSingle: isStart && (!tentativeEnd || isSameDay(tentativeStart, tentativeEnd)),
    };
  };

  // Human readable trigger label
  const triggerLabel = useMemo(() => {
    if (parsedStart && parsedEnd) {
      if (isSameDay(parsedStart, parsedEnd)) {
        return formatDisplayDate(parsedStart);
      }
      return `${formatDisplayDate(parsedStart)} — ${formatDisplayDate(parsedEnd)}`;
    }
    if (parsedStart) {
      return `From ${formatDisplayDate(parsedStart)}`;
    }
    if (parsedEnd) {
      return `Until ${formatDisplayDate(parsedEnd)}`;
    }
    return 'Select date range...';
  }, [parsedStart, parsedEnd]);

  // Days count badge
  const daysDifference = useMemo(() => {
    if (parsedStart && parsedEnd) {
      const diffTime = Math.abs(parsedEnd.getTime() - parsedStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
    }
    return null;
  }, [parsedStart, parsedEnd]);

  const hasValue = Boolean(startDate || endDate);

  // Month header text: 'November 2026'
  const leftMonthTitle = new Date(leftYear, leftMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const rightMonthTitle = new Date(rightYear, rightMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="premium-datepicker-root" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={`premium-datepicker-trigger ${isOpen ? 'is-open' : ''} ${hasValue ? 'has-value' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Pick date range"
        aria-expanded={isOpen}
      >
        <div className="premium-trigger-leading">
          <div className="premium-calendar-icon-chip">
            <CalendarIcon size={14} className="premium-cal-icon" />
          </div>
          <span className="premium-trigger-label">{label}</span>
          <span className={`premium-trigger-value ${hasValue ? 'active' : 'placeholder'}`}>
            {triggerLabel}
          </span>
          {daysDifference && (
            <span className="premium-trigger-badge">{daysDifference}</span>
          )}
        </div>

        <div className="premium-trigger-trailing">
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              className="premium-trigger-clear-btn"
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClear(e); }}
              title="Clear date filter"
              aria-label="Clear date filter"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`premium-trigger-chevron ${isOpen ? 'rotated' : ''}`} />
        </div>
      </button>

      {/* Floating Popover Calendar Card */}
      {isOpen && (
        <div className="premium-datepicker-popover" role="dialog" aria-modal="true">
          {/* Inner Double-Bezel Card */}
          <div className="premium-popover-card">
            
            {/* Quick Presets Sidebar */}
            <div className="premium-popover-presets">
              <div className="premium-presets-header">
                <Sparkles size={12} className="premium-presets-icon" />
                <span>Quick Filters</span>
              </div>
              <div className="premium-presets-list">
                {PRESETS.map((p) => {
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="premium-preset-item"
                      onClick={() => handlePreset(p.id)}
                    >
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Calendars Area */}
            <div className="premium-popover-calendars-area">
              
              {/* Calendars Container (Dual Month on Desktop, Single on Mobile) */}
              <div className="premium-calendars-grid">
                
                {/* Left Month Calendar */}
                <div className="premium-month-pane">
                  {/* Month Header */}
                  <div className="premium-month-nav">
                    <button
                      type="button"
                      onClick={handlePrevYear}
                      className="premium-nav-btn"
                      title="Previous year"
                      aria-label="Previous year"
                    >
                      <span className="premium-year-arrow">«</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="premium-nav-btn"
                      title="Previous month"
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={15} />
                    </button>

                    <div className="premium-month-title">
                      {leftMonthTitle}
                    </div>

                    <div className="premium-nav-spacer" />
                  </div>

                  {/* Weekday Row */}
                  <div className="premium-weekdays-row">
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="premium-weekday-label">{w}</span>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="premium-days-grid" onMouseLeave={() => setHoverDate(null)}>
                    {leftMonthDays.map(({ date, isCurrentMonth }, idx) => {
                      const status = getDayStatus(date);
                      return (
                        <div
                          key={`left-${idx}`}
                          className={`premium-day-wrapper ${status.isInRange ? 'in-range' : ''} ${status.isStart ? 'range-start' : ''} ${status.isEnd || status.isHoveredEnd ? 'range-end' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleDayClick(date)}
                            onMouseEnter={() => tentativeStart && !tentativeEnd && setHoverDate(date)}
                            className={`premium-day-btn 
                              ${!isCurrentMonth ? 'outside-month' : ''} 
                              ${status.isToday ? 'is-today' : ''} 
                              ${status.isStart ? 'selected-start' : ''} 
                              ${status.isEnd ? 'selected-end' : ''} 
                              ${status.isSelectedSingle ? 'selected-single' : ''}
                              ${status.isHoveredEnd ? 'hovered-end' : ''}
                            `}
                          >
                            <span className="premium-day-num">{date.getDate()}</span>
                            {status.isToday && !status.isStart && !status.isEnd && (
                              <span className="premium-today-dot" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Month Calendar (Next Month) */}
                <div className="premium-month-pane hide-on-mobile">
                  {/* Month Header */}
                  <div className="premium-month-nav right-pane-nav">
                    <div className="premium-nav-spacer" />

                    <div className="premium-month-title">
                      {rightMonthTitle}
                    </div>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="premium-nav-btn"
                      title="Next month"
                      aria-label="Next month"
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextYear}
                      className="premium-nav-btn"
                      title="Next year"
                      aria-label="Next year"
                    >
                      <span className="premium-year-arrow">»</span>
                    </button>
                  </div>

                  {/* Weekday Row */}
                  <div className="premium-weekdays-row">
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="premium-weekday-label">{w}</span>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="premium-days-grid" onMouseLeave={() => setHoverDate(null)}>
                    {rightMonthDays.map(({ date, isCurrentMonth }, idx) => {
                      const status = getDayStatus(date);
                      return (
                        <div
                          key={`right-${idx}`}
                          className={`premium-day-wrapper ${status.isInRange ? 'in-range' : ''} ${status.isStart ? 'range-start' : ''} ${status.isEnd || status.isHoveredEnd ? 'range-end' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleDayClick(date)}
                            onMouseEnter={() => tentativeStart && !tentativeEnd && setHoverDate(date)}
                            className={`premium-day-btn 
                              ${!isCurrentMonth ? 'outside-month' : ''} 
                              ${status.isToday ? 'is-today' : ''} 
                              ${status.isStart ? 'selected-start' : ''} 
                              ${status.isEnd ? 'selected-end' : ''} 
                              ${status.isSelectedSingle ? 'selected-single' : ''}
                              ${status.isHoveredEnd ? 'hovered-end' : ''}
                            `}
                          >
                            <span className="premium-day-num">{date.getDate()}</span>
                            {status.isToday && !status.isStart && !status.isEnd && (
                              <span className="premium-today-dot" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Bottom Action Bar */}
              <div className="premium-popover-footer">
                <div className="premium-footer-summary">
                  {tentativeStart && tentativeEnd ? (
                    <div className="premium-summary-active">
                      <span className="summary-date-pill">{formatDisplayDate(tentativeStart)}</span>
                      <ArrowRight size={12} className="summary-arrow" />
                      <span className="summary-date-pill">{formatDisplayDate(tentativeEnd)}</span>
                    </div>
                  ) : tentativeStart ? (
                    <div className="premium-summary-prompt">
                      <span>Click an end date to complete range</span>
                    </div>
                  ) : (
                    <div className="premium-summary-empty">
                      <span>Select a start date to begin</span>
                    </div>
                  )}
                </div>

                <div className="premium-footer-actions">
                  {(tentativeStart || tentativeEnd) && (
                    <button
                      type="button"
                      className="premium-footer-btn clear"
                      onClick={handleClear}
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="premium-footer-btn cancel"
                    onClick={() => {
                      setIsOpen(false);
                      setTentativeStart(parsedStart);
                      setTentativeEnd(parsedEnd);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="premium-footer-btn apply"
                    onClick={handleApply}
                    disabled={!tentativeStart}
                  >
                    <Check size={13} />
                    <span>Apply Filter</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}


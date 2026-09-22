import React from 'react';
import { ComponentIcon } from './ComponentIcons';
import { CheckCircle2, Lock } from 'lucide-react';

/**
 * ComponentCard - Premium Electronic Component Module Card
 * Supports pointer dragging, tap-to-select, keyboard focus, and connected status.
 */
export function ComponentCard({
  component,
  isUsed,
  isSelected,
  isDragging,
  onPointerDown,
  onClick
}) {
  const handleKeyDown = (e) => {
    if (isUsed) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(component.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={isUsed ? -1 : 0}
      aria-label={`${component.name} - ${component.rating}${
        isUsed ? ' (Already connected)' : ''
      }`}
      aria-pressed={isSelected}
      aria-disabled={isUsed}
      className={`component-card glass-card ${isUsed ? 'used' : ''} ${
        isSelected ? 'selected' : ''
      } ${isDragging ? 'dragging' : ''}`}
      onPointerDown={(e) => !isUsed && onPointerDown?.(e, component.id)}
      onClick={() => !isUsed && onClick?.(component.id)}
      onKeyDown={handleKeyDown}
      style={{ touchAction: 'none' }}
    >
      {/* Selection / Used Indicator Badges */}
      {isUsed && (
        <div className="card-badge used-badge" title="Connected in circuit">
          <CheckCircle2 size={12} className="text-emerald-400" />
          <span className="font-mono">CONNECTED</span>
        </div>
      )}

      {isSelected && !isUsed && (
        <div className="card-badge selected-badge">
          <span className="pulse-dot"></span>
          <span className="font-mono">SELECTED</span>
        </div>
      )}

      {/* Component Icon Graphic */}
      <div className="icon-wrapper">
        <ComponentIcon type={component.id} size={44} />
      </div>

      {/* Component Details */}
      <div className="card-info">
        <div className="card-header-row">
          <span className="card-title font-tech">{component.name}</span>
          <span className="card-code font-mono">{component.code}</span>
        </div>
        <span className="card-rating font-mono">{component.rating}</span>
      </div>

      {/* Drag Grip Visual Indicator */}
      {!isUsed && (
        <div className="drag-grip" aria-hidden="true">
          <span className="grip-dot"></span>
          <span className="grip-dot"></span>
          <span className="grip-dot"></span>
        </div>
      )}
    </div>
  );
}

export default ComponentCard;

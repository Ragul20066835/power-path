import React from 'react';
import { ComponentIcon } from './ComponentIcons';
import { COMPONENTS_MAP } from '../data/gameData.js';
import { Check, AlertCircle, Zap, ShieldCheck, Cpu } from 'lucide-react';

/**
 * CircuitSlot - Futuristic PCB Electronic Connection Socket
 * Equipped with solder terminals, silkscreen labels, status glows, and snap feedback.
 */
export function CircuitSlot({
  slot,
  placedComponentId,
  isHovered,
  isSelectedTarget,
  isShaking,
  isJustSnapped,
  onClick
}) {
  const isOccupied = Boolean(placedComponentId);
  const placedComponent = isOccupied ? COMPONENTS_MAP[placedComponentId] : null;
  const slotName = slot.label || slot.name || slot.id;
  const slotOrder = slot.slotOrder || slot.order || 1;

  const handleKeyDown = (e) => {
    if (isOccupied) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(slot.id);
    }
  };

  return (
    <div
      data-slot-id={slot.id}
      id={`slot-${slot.id.toLowerCase()}`}
      role="region"
      tabIndex={isOccupied ? -1 : 0}
      aria-label={`Circuit Socket: ${slotName}. ${
        isOccupied ? `Occupied by ${placedComponent?.name}` : `Empty. Accepts ${slot.hint}`
      }`}
      className={`circuit-slot glass-socket ${isOccupied ? 'occupied' : 'empty'} ${
        isHovered ? 'hovered' : ''
      } ${isSelectedTarget ? 'target-active' : ''} ${isShaking ? 'shake-error' : ''} ${
        isJustSnapped ? 'snap-success' : ''
      }`}
      onClick={() => onClick?.(slot.id)}
      onKeyDown={handleKeyDown}
    >
      {/* Solder Terminals / Gold Contact Pads */}
      <div className="terminal left-terminal">
        <span className="terminal-pad gold-pad"></span>
        <span className="terminal-label font-mono">{slot.pinLabelLeft || 'IN'}</span>
      </div>

      <div className="terminal right-terminal">
        <span className="terminal-label font-mono">{slot.pinLabelRight || 'OUT'}</span>
        <span className="terminal-pad gold-pad"></span>
      </div>

      {/* Internal Socket Housing Surface */}
      <div className="slot-housing">
        {isOccupied && placedComponent ? (
          <div className="snapped-content animate-pop-in">
            <div className="snapped-icon-wrapper">
              <ComponentIcon type={placedComponent.id} size={44} />
            </div>
            <div className="snapped-meta">
              <span className="snapped-name font-tech">{placedComponent.name}</span>
              <span className="snapped-status font-mono">
                <Check size={11} className="text-emerald-400" /> ONLINE &bull; {placedComponent.rating}
              </span>
            </div>
            {/* Ambient Energized Glow Layer */}
            <div className="energized-halo" aria-hidden="true"></div>
          </div>
        ) : (
          <div className="empty-content">
            <div className="socket-silkscreen-symbol">
              <span className="slot-order font-mono">SOCKET #{String(slotOrder).padStart(2, '0')}</span>
              <span className="slot-name font-tech">{slotName}</span>
            </div>

            <div className="slot-hint-badge">
              <Zap size={11} className="text-cyan-400 flex-shrink-0" />
              <span className="text-ellipsis">{slot.hint}</span>
            </div>

            {isSelectedTarget && (
              <div className="tap-to-place-prompt animate-pulse font-mono">
                <span>TAP TO INSERT</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error / Wrong Drop Warning Banner */}
      {isShaking && (
        <div className="slot-error-overlay animate-shake">
          <AlertCircle size={18} className="text-rose-300 animate-pulse" />
          <span className="font-tech">REJECTED (+5s)</span>
        </div>
      )}
    </div>
  );
}

export default CircuitSlot;

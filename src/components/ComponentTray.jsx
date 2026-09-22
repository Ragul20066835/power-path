import React, { useState } from 'react';
import { GLOBAL_COMPONENTS } from '../data/gameData.js';
import { ComponentCard } from './ComponentCard';
import { ComponentIcon } from './ComponentIcons';
import { Box, Hand, Sparkles } from 'lucide-react';

/**
 * ComponentTray - Futuristic Floating Electronic Component Repository
 * Houses real circuit components & decoys with drag-and-drop & tap-to-select support.
 */
export function ComponentTray({
  placedComponents = {},
  selectedComponentId,
  dragState,
  onPointerDown,
  onComponentClick
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'essential' | 'decoys'

  const usedComponentIds = Object.values(placedComponents).filter(Boolean);

  const filteredComponents = GLOBAL_COMPONENTS.filter((comp) => {
    if (activeFilter === 'essential') return !comp.isDecoy;
    if (activeFilter === 'decoys') return comp.isDecoy;
    return true;
  });

  const totalCount = GLOBAL_COMPONENTS.length;
  const essentialCount = GLOBAL_COMPONENTS.filter((c) => !c.isDecoy).length;
  const decoyCount = GLOBAL_COMPONENTS.filter((c) => c.isDecoy).length;
  const availableCount = totalCount - usedComponentIds.length;

  return (
    <div className="component-tray-container glass-panel">
      {/* Tray Header & Filter Controls */}
      <div className="tray-header">
        <div className="tray-title-group">
          <div className="tray-icon-glow">
            <Box size={18} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="tray-title font-tech">COMPONENT TRAY</h3>
            <span className="tray-subtitle">Electronic Parts &amp; Decoys</span>
          </div>
          <span className="tray-count-badge font-mono">
            {availableCount}/{totalCount} READY
          </span>
        </div>

        {/* Filter Tab Pills */}
        <div className="tray-filters" role="tablist">
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            ALL ({totalCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'essential' ? 'active' : ''}`}
            onClick={() => setActiveFilter('essential')}
          >
            ACTIVE ({essentialCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'decoys' ? 'active' : ''}`}
            onClick={() => setActiveFilter('decoys')}
          >
            DECOYS ({decoyCount})
          </button>
        </div>
      </div>

      {/* Interaction Help Hint */}
      <div className="tray-tip-banner">
        <Hand size={14} className="text-cyan-400 flex-shrink-0" />
        <span>Drag a component to a circuit socket, or tap a component then tap a socket.</span>
      </div>

      {/* Components Grid */}
      <div className="components-grid">
        {filteredComponents.map((component) => {
          const isUsed = usedComponentIds.includes(component.id);
          const isSelected = selectedComponentId === component.id;
          const isDragging = dragState?.componentId === component.id;

          return (
            <ComponentCard
              key={component.id}
              component={component}
              isUsed={isUsed}
              isSelected={isSelected}
              isDragging={isDragging}
              onPointerDown={onPointerDown}
              onClick={onComponentClick}
            />
          );
        })}
      </div>

      {/* Drag Avatar Follower (Pointer Float Preview) */}
      {dragState && (
        <div
          className="drag-floating-avatar"
          style={{
            transform: `translate3d(${dragState.currentX - 44}px, ${
              dragState.currentY - 44
            }px, 0)`
          }}
          aria-hidden="true"
        >
          <ComponentIcon type={dragState.componentId} size={54} />
        </div>
      )}
    </div>
  );
}

export default ComponentTray;

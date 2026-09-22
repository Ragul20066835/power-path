import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Universal Pointer Events Drag & Drop + Tap-to-Select Hook
 * Compatible with Desktop Mouse, Tablet Stylus/Finger, Mobile Touch, and Keyboard.
 */
export function usePointerDragDrop({
  isGameRunning,
  placedComponents = {},
  onAttemptPlacement,
  onPlayClickSound
}) {
  const [dragState, setDragState] = useState(null); // { componentId, startX, startY, currentX, currentY, activeSlotHover }
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const isDraggingRef = useRef(false);

  // Clear selection if component gets placed or game stops
  useEffect(() => {
    if (!isGameRunning) {
      setSelectedComponentId(null);
      setDragState(null);
      isDraggingRef.current = false;
    }
  }, [isGameRunning]);

  useEffect(() => {
    if (selectedComponentId && Object.values(placedComponents).includes(selectedComponentId)) {
      setSelectedComponentId(null);
    }
  }, [placedComponents, selectedComponentId]);

  // Find slot under coordinates (x, y)
  const getSlotUnderPoint = useCallback((x, y) => {
    // Hide drag preview briefly if needed or rely on pointer-events: none on avatar
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slotEl = el.closest('[data-slot-id]');
    return slotEl ? slotEl.getAttribute('data-slot-id') : null;
  }, []);

  // Handle Drag Start
  const handlePointerDown = useCallback((e, componentId) => {
    if (!isGameRunning) return;
    if (Object.values(placedComponents).includes(componentId)) return;
    if (e.button && e.button !== 0) return; // Left-click only

    // Prevent default touch scrolling during drag gesture
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;

    isDraggingRef.current = true;
    onPlayClickSound?.();

    setDragState({
      componentId,
      pointerId: e.pointerId,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      activeSlotHover: null
    });
  }, [isGameRunning, placedComponents, onPlayClickSound]);

  // Handle Drag Move & Drop via global window listeners
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const x = e.clientX;
      const y = e.clientY;
      const hoveredSlot = getSlotUnderPoint(x, y);

      setDragState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentX: x,
          currentY: y,
          activeSlotHover: hoveredSlot
        };
      });
    };

    const handlePointerUp = (e) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const x = e.clientX;
      const y = e.clientY;
      const targetSlotId = getSlotUnderPoint(x, y);
      const droppedComponentId = dragState.componentId;

      setDragState(null);

      if (targetSlotId && droppedComponentId) {
        onAttemptPlacement(droppedComponentId, targetSlotId);
      }
    };

    const handlePointerCancel = () => {
      isDraggingRef.current = false;
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragState, getSlotUnderPoint, onAttemptPlacement]);

  // Tap-to-select fallback handler
  const handleComponentClick = useCallback((componentId) => {
    if (!isGameRunning) return;
    if (Object.values(placedComponents).includes(componentId)) return;

    onPlayClickSound?.();
    setSelectedComponentId(prev => (prev === componentId ? null : componentId));
  }, [isGameRunning, placedComponents, onPlayClickSound]);

  const handleSlotClick = useCallback((slotId) => {
    if (!isGameRunning) return;
    if (placedComponents[slotId]) return;

    if (selectedComponentId) {
      onAttemptPlacement(selectedComponentId, slotId);
      setSelectedComponentId(null);
    }
  }, [isGameRunning, placedComponents, selectedComponentId, onAttemptPlacement]);

  const clearSelection = useCallback(() => {
    setSelectedComponentId(null);
  }, []);

  return {
    dragState,
    selectedComponentId,
    handlePointerDown,
    handleComponentClick,
    handleSlotClick,
    clearSelection,
    isComponentUsed: (id) => Object.values(placedComponents).includes(id)
  };
}

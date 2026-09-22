import React from 'react';
import { CircuitSlot } from './CircuitSlot';
import { Cpu, Zap, Activity, Radio, Sparkles } from 'lucide-react';

/**
 * CircuitBoard - Main Dynamic Electronics PCB Glass Panel
 * Renders PCB substrate, mounting standoffs, dynamic circuit trace loop, and challenge sockets.
 */
export function CircuitBoard({
  challenge,
  placedComponents = {},
  activeHoveredSlot,
  selectedComponentId,
  shakingSlotId,
  justSnappedSlotId,
  isCircuitComplete,
  onSlotClick
}) {
  const slots = challenge?.slots || [];
  const totalSlots = slots.length;
  const placedCount = Object.values(placedComponents).filter(Boolean).length;
  const isAllConnected = totalSlots > 0 && placedCount === totalSlots;

  return (
    <div
      className={`circuit-board-container glass-panel ${
        isAllConnected ? 'fully-energized' : ''
      }`}
    >
      {/* PCB Header Silkscreen Bar */}
      <div className="pcb-header-bar">
        <div className="pcb-title-group">
          <div className="pcb-icon-glow">
            <Cpu size={16} className="text-cyan-400" />
          </div>
          <div className="pcb-title-text">
            <span className="pcb-board-id font-mono">
              {challenge?.id || 'PCB-STAGE'} &bull; {challenge?.name || 'CIRCUIT ASSEMBLY'}
            </span>
          </div>
        </div>

        <div className="pcb-status-group">
          <span
            className={`pcb-status-dot ${
              isAllConnected ? 'live-energized' : 'open-loop'
            }`}
          ></span>
          <span className="pcb-status-text font-mono">
            {isAllConnected
              ? `ENERGIZED (${totalSlots}/${totalSlots})`
              : `OPEN LOOP (${placedCount}/${totalSlots})`}
          </span>
        </div>
      </div>

      {/* PCB Board Surface Layer */}
      <div className="pcb-surface">
        {/* Corner Metallic Standoff Screws */}
        <div className="standoff-screw top-left" aria-hidden="true"></div>
        <div className="standoff-screw top-right" aria-hidden="true"></div>
        <div className="standoff-screw bottom-left" aria-hidden="true"></div>
        <div className="standoff-screw bottom-right" aria-hidden="true"></div>

        {/* Silkscreen & Circuit Traces Vector Pattern */}
        <svg
          className="pcb-traces-svg"
          preserveAspectRatio="none"
          viewBox="0 0 1000 600"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="traceGradNeon" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#00ffcc" />
            </linearGradient>

            <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.3)" />
              <stop offset="100%" stopColor="rgba(168, 85, 247, 0.3)" />
            </linearGradient>

            <pattern id="pcbDotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="rgba(148, 163, 184, 0.12)" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="1000" height="600" fill="url(#pcbDotGrid)" />

          {/* Decorative Copper Circuit Lines */}
          <path
            d="M 60 120 L 140 120 L 180 80 L 820 80 L 860 120 L 940 120"
            fill="none"
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
          <path
            d="M 60 480 L 140 480 L 180 520 L 820 520 L 860 480 L 940 480"
            fill="none"
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth="2"
            strokeDasharray="4 6"
          />

          {/* Solder Test Points */}
          <circle cx="120" cy="120" r="6" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <text
            x="120"
            y="105"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            TP-PWR
          </text>

          <circle cx="880" cy="120" r="6" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <text
            x="880"
            y="105"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            TP-VOUT
          </text>

          <circle cx="120" cy="480" r="6" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <text
            x="120"
            y="505"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            TP-GND
          </text>

          <circle cx="880" cy="480" r="6" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <text
            x="880"
            y="505"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            TP-RETURN
          </text>
        </svg>

        {/* Dynamic PCB Socket Cards Grid */}
        <div
          className="pcb-slots-grid"
          style={{
            gridTemplateColumns:
              totalSlots <= 3
                ? 'repeat(auto-fit, minmax(220px, 1fr))'
                : totalSlots <= 6
                ? 'repeat(auto-fit, minmax(200px, 1fr))'
                : 'repeat(auto-fit, minmax(180px, 1fr))'
          }}
        >
          {slots.map((slot) => (
            <CircuitSlot
              key={slot.id}
              slot={slot}
              placedComponentId={placedComponents[slot.id]}
              isHovered={activeHoveredSlot === slot.id}
              isSelectedTarget={Boolean(selectedComponentId && !placedComponents[slot.id])}
              isShaking={shakingSlotId === slot.id}
              isJustSnapped={justSnappedSlotId === slot.id}
              onClick={onSlotClick}
            />
          ))}
        </div>

        {/* Circuit Energized Pulse Banner */}
        {isAllConnected && (
          <div className="circuit-power-pulse-banner animate-fade-in">
            <Zap size={16} className="text-amber-300 animate-bounce" />
            <span className="font-tech">
              CIRCUIT ENERGIZED &bull; 9V CURRENT FLOWING &bull; TELEMETRY VERIFIED
            </span>
            <Activity size={16} className="text-emerald-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

export default CircuitBoard;

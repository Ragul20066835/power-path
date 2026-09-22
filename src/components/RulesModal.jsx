import React from 'react';
import { X, Zap, AlertTriangle, ShieldCheck, HelpCircle, Layers, CheckCircle2 } from 'lucide-react';

/**
 * RulesModal - Futuristic Schematic Reference & Competition Rules Dialog
 */
export function RulesModal({ isOpen, event, currentQuestion, onClose }) {
  if (!isOpen) return null;

  const questions = event?.questions || [];
  const activeQ = currentQuestion || questions[0] || null;
  const slots = activeQ?.slots || [];
  const penaltySeconds = activeQ?.penaltySeconds || 5;

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div
        className="rules-modal-card glass-panel animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
      >
        {/* Header */}
        <div className="rules-header">
          <div className="rules-title-group">
            <div className="rules-icon-wrap cyan-halo">
              <HelpCircle size={20} className="text-cyan-400" />
            </div>
            <div>
              <h2 id="rules-title" className="rules-title font-tech">
                CIRCUIT RULES &amp; SCHEMATIC GUIDE
              </h2>
              <span className="rules-subtitle">Championship Tournament Specifications</span>
            </div>
          </div>
          <button
            type="button"
            className="rules-close-btn"
            onClick={onClose}
            aria-label="Close rules dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rules-body">
          {/* Section 1: Objective */}
          <div className="rules-section glass-card">
            <h4 className="rules-section-title font-tech">
              <Zap size={15} className="text-cyan-400" /> EVENT MISSION: {event?.name || 'POWERPATH Championship'}
            </h4>
            <p className="rules-text">
              {event?.description ||
                'Build complete functional circuits across all designated question stages in the fastest possible time with zero wiring mistakes.'}
            </p>
          </div>

          {/* Section 2: Questions Breakdown */}
          {questions.length > 1 && (
            <div className="rules-section glass-card">
              <h4 className="rules-section-title font-tech">
                <Layers size={15} className="text-purple-300" /> EVENT STAGES ({questions.length} QUESTIONS)
              </h4>
              <div className="stage-rules-list font-mono">
                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className={`stage-rules-item ${activeQ?.id === q.id ? 'active-rule-stage' : ''}`}
                  >
                    <span className="font-semibold">
                      {idx + 1}. {q.name}
                    </span>
                    <span className="text-slate-400">{q.slots?.length || 0} sockets</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Current Socket Mappings */}
          {activeQ && (
            <div className="rules-section glass-card">
              <h4 className="rules-section-title font-tech">
                <ShieldCheck size={15} className="text-emerald-400" /> ACTIVE STAGE SOCKETS: {activeQ.name}
              </h4>
              <div className="rules-slots-table">
                <div className="slots-table-header font-mono">
                  <span>SOCKET</span>
                  <span>FUNCTION / HINT</span>
                  <span>ACCEPTED PART</span>
                </div>
                {slots.map((slot, idx) => (
                  <div key={slot.id} className="slots-table-row">
                    <span className="slot-pill font-mono">#{slot.slotOrder || idx + 1} {slot.label || slot.name}</span>
                    <span className="slot-role">{slot.hint}</span>
                    <span className="slot-correct font-mono">{slot.acceptedComponentId.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Decoys & Penalties */}
          <div className="rules-section glass-card">
            <h4 className="rules-section-title font-tech">
              <AlertTriangle size={15} className="text-rose-400" /> BEWARE OF DECOY COMPONENTS &amp; PENALTIES
            </h4>
            <ul className="rules-list">
              <li>
                <strong>Decoys in Tray:</strong> Voltmeter (Parallel meter), Capacitor (Blocks DC), and Inductor (AC choke).
              </li>
              <li>
                <strong>Wrong Placement Penalty:</strong> Dropping an incorrect component adds <strong>+{penaltySeconds} seconds</strong> penalty per mistake.
              </li>
              <li>
                <strong>Drop Outside:</strong> Releasing a component outside any valid socket incurs <strong>0 penalty</strong>.
              </li>
              <li>
                <strong>Interaction:</strong> Drag and drop with mouse/touch, or tap a component then tap a socket.
              </li>
            </ul>
          </div>
        </div>

        <div className="rules-footer">
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>
            <span>UNDERSTOOD &bull; RESUME MATCH</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RulesModal;

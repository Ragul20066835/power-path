import React, { useState } from 'react';
import {
  Save,
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Cpu,
  Zap,
  Layers
} from 'lucide-react';
import { GLOBAL_COMPONENTS } from '../../data/gameData.js';

/**
 * ChallengeEditor - Dynamic Circuit Challenge & Slot Socket Builder
 */
export function ChallengeEditor({ challenge, onSave, onCancel }) {
  const isEditing = Boolean(challenge && challenge.id);

  const [id, setId] = useState(challenge?.id || `C${Date.now().toString(36).toUpperCase().slice(-4)}`);
  const [name, setName] = useState(challenge?.name || '');
  const [description, setDescription] = useState(challenge?.description || '');
  const [difficulty, setDifficulty] = useState(challenge?.difficulty || 'Easy');
  const [penaltySeconds, setPenaltySeconds] = useState(challenge?.penaltySeconds || 5);
  const [status, setStatus] = useState(challenge?.status || 'INACTIVE');

  // Dynamic slots list
  const [slots, setSlots] = useState(
    challenge?.slots?.length
      ? challenge.slots.map((s, idx) => ({ ...s, slotOrder: idx + 1 }))
      : [
          {
            id: 'S1',
            label: 'SOURCE',
            category: 'Power Supply',
            hint: '9V DC Voltage Source',
            acceptedComponentId: 'battery',
            pinLabelLeft: 'PWR+',
            pinLabelRight: 'GND-',
            slotOrder: 1
          },
          {
            id: 'S2',
            label: 'SWITCH',
            category: 'Control',
            hint: 'SPST Power Switch',
            acceptedComponentId: 'switch',
            pinLabelLeft: 'IN',
            pinLabelRight: 'OUT',
            slotOrder: 2
          },
          {
            id: 'S3',
            label: 'LIMITER',
            category: 'Protection',
            hint: 'Current Limiting Resistor',
            acceptedComponentId: 'resistor',
            pinLabelLeft: 'IN',
            pinLabelRight: 'OUT',
            slotOrder: 3
          }
        ]
  );

  const [error, setError] = useState('');

  // Add new slot
  const handleAddSlot = () => {
    const nextOrder = slots.length + 1;
    const newSlot = {
      id: `S${nextOrder}`,
      label: `SOCKET_${nextOrder}`,
      category: 'General',
      hint: 'Circuit Component',
      acceptedComponentId: 'led',
      pinLabelLeft: 'IN',
      pinLabelRight: 'OUT',
      slotOrder: nextOrder
    };
    setSlots([...slots, newSlot]);
  };

  // Remove slot
  const handleRemoveSlot = (index) => {
    if (slots.length <= 2) {
      setError('A challenge must contain at least 2 circuit sockets.');
      return;
    }
    const updated = slots.filter((_, idx) => idx !== index).map((s, idx) => ({
      ...s,
      slotOrder: idx + 1
    }));
    setSlots(updated);
  };

  // Move slot up
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const updated = [...slots];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setSlots(updated.map((s, idx) => ({ ...s, slotOrder: idx + 1 })));
  };

  // Move slot down
  const handleMoveDown = (index) => {
    if (index === slots.length - 1) return;
    const updated = [...slots];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setSlots(updated.map((s, idx) => ({ ...s, slotOrder: idx + 1 })));
  };

  // Update specific slot field
  const handleSlotChange = (index, field, value) => {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  };

  // Handle Form Submit
  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const cleanId = id.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanId) {
      setError('Challenge ID is required.');
      return;
    }
    if (!cleanName) {
      setError('Challenge Title is required.');
      return;
    }
    if (slots.length < 2) {
      setError('At least 2 circuit sockets are required.');
      return;
    }

    // Check duplicate slot IDs
    const slotIdSet = new Set();
    for (const slot of slots) {
      const sId = (slot.id || '').trim();
      if (!sId) {
        setError('All slots must have a valid Slot ID.');
        return;
      }
      if (slotIdSet.has(sId)) {
        setError(`Duplicate Slot ID "${sId}" detected. Each slot ID must be unique.`);
        return;
      }
      slotIdSet.add(sId);
    }

    const payload = {
      id: cleanId,
      name: cleanName,
      description: description.trim(),
      difficulty,
      penaltySeconds: Number(penaltySeconds) || 5,
      status,
      slots: slots.map((s, idx) => ({
        ...s,
        id: s.id.trim(),
        label: s.label.trim().toUpperCase(),
        slotOrder: idx + 1
      }))
    };

    onSave(payload);
  };

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="editor-header-bar">
        <div>
          <h2 className="view-title">
            {isEditing ? `EDIT CHALLENGE // ${challenge.id}` : 'CREATE NEW CIRCUIT CHALLENGE'}
          </h2>
          <p className="view-subtitle">
            Configure challenge metadata, topology, penalties, and socket-component acceptance rules.
          </p>
        </div>

        <div className="editor-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            <X size={16} />
            <span>Cancel</span>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit}>
            <Save size={16} />
            <span>Save Challenge</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error-alert animate-shake mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="challenge-editor-form">
        {/* Basic Metadata Box */}
        <div className="admin-form-section">
          <h3 className="section-title">
            <Zap size={16} className="text-cyan-400" />
            <span>1. CHALLENGE SPECIFICATIONS</span>
          </h3>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label" htmlFor="challenge-id">
                CHALLENGE ID <span className="required-star">*</span>
              </label>
              <input
                id="challenge-id"
                type="text"
                className="form-input font-mono"
                placeholder="e.g. C005"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                disabled={isEditing}
              />
            </div>

            <div className="form-group span-2">
              <label className="form-label" htmlFor="challenge-name">
                CHALLENGE TITLE <span className="required-star">*</span>
              </label>
              <input
                id="challenge-name"
                type="text"
                className="form-input"
                placeholder="e.g. Sensor Conditioning Loop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group mt-3">
            <label className="form-label" htmlFor="challenge-desc">
              DESCRIPTION / OBJECTIVE
            </label>
            <textarea
              id="challenge-desc"
              className="form-textarea"
              rows={2}
              placeholder="Describe the electrical purpose of this circuit challenge..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-grid-3 mt-3">
            <div className="form-group">
              <label className="form-label" htmlFor="challenge-diff">
                DIFFICULTY
              </label>
              <select
                id="challenge-diff"
                className="form-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="challenge-penalty">
                PENALTY PER ERROR (SECONDS)
              </label>
              <input
                id="challenge-penalty"
                type="number"
                min={1}
                max={60}
                className="form-input font-mono"
                value={penaltySeconds}
                onChange={(e) => setPenaltySeconds(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="challenge-status">
                STATUS
              </label>
              <select
                id="challenge-status"
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="INACTIVE">INACTIVE (Draft)</option>
                <option value="ACTIVE">ACTIVE (Assign to Players)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Circuit Sockets Designer */}
        <div className="admin-form-section mt-4">
          <div className="section-header-row">
            <h3 className="section-title">
              <Cpu size={16} className="text-amber-400" />
              <span>2. CIRCUIT SOCKETS CONFIGURATION ({slots.length} Sockets)</span>
            </h3>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAddSlot}
            >
              <Plus size={16} />
              <span>Add Socket</span>
            </button>
          </div>

          <div className="slots-designer-list">
            {slots.map((slot, index) => (
              <div key={index} className="slot-designer-row">
                <div className="slot-order-badge">
                  <span>#{index + 1}</span>
                </div>

                <div className="slot-fields-grid">
                  <div className="form-group">
                    <label className="form-label">SOCKET ID</label>
                    <input
                      type="text"
                      className="form-input font-mono form-input-sm"
                      value={slot.id}
                      onChange={(e) => handleSlotChange(index, 'id', e.target.value.toUpperCase())}
                      placeholder="e.g. S1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">LABEL</label>
                    <input
                      type="text"
                      className="form-input font-tech form-input-sm"
                      value={slot.label}
                      onChange={(e) => handleSlotChange(index, 'label', e.target.value.toUpperCase())}
                      placeholder="e.g. SOURCE"
                    />
                  </div>

                  <div className="form-group span-2">
                    <label className="form-label">ACCEPTED COMPONENT</label>
                    <select
                      className="form-select form-input-sm"
                      value={slot.acceptedComponentId}
                      onChange={(e) => handleSlotChange(index, 'acceptedComponentId', e.target.value)}
                    >
                      {GLOBAL_COMPONENTS.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          {comp.name} ({comp.rating}) {comp.isDecoy ? '— [DECOY]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group span-2">
                    <label className="form-label">HINT / DESCRIPTION</label>
                    <input
                      type="text"
                      className="form-input form-input-sm"
                      value={slot.hint}
                      onChange={(e) => handleSlotChange(index, 'hint', e.target.value)}
                      placeholder="e.g. 9V DC Voltage Source"
                    />
                  </div>
                </div>

                {/* Slot Order Actions */}
                <div className="slot-row-actions">
                  <button
                    type="button"
                    className="table-icon-btn"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move Socket Up"
                  >
                    <ArrowUp size={14} />
                  </button>

                  <button
                    type="button"
                    className="table-icon-btn"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === slots.length - 1}
                    title="Move Socket Down"
                  >
                    <ArrowDown size={14} />
                  </button>

                  <button
                    type="button"
                    className="table-icon-btn text-rose-400 hover:text-rose-300"
                    onClick={() => handleRemoveSlot(index)}
                    title="Remove Socket"
                    disabled={slots.length <= 2}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="editor-footer-bar">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={18} />
            <span>Save Challenge</span>
          </button>
        </div>
      </form>
    </div>
  );
}

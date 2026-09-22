import React, { useState } from 'react';
import { Save, X, Zap, AlertCircle } from 'lucide-react';

/**
 * EventEditor - Create / Edit Tournament Event Details
 */
export function EventEditor({ event, onSave, onCancel }) {
  const isEditing = Boolean(event && event.id);

  const [id, setId] = useState(event?.id || `E${Date.now().toString(36).toUpperCase().slice(-4)}`);
  const [name, setName] = useState(event?.name || '');
  const [description, setDescription] = useState(event?.description || '');
  const [status, setStatus] = useState(event?.status || 'INACTIVE');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanId = id.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanId) {
      setError('Event ID is required.');
      return;
    }
    if (!cleanName) {
      setError('Event Name is required.');
      return;
    }

    onSave({
      id: cleanId,
      name: cleanName,
      description: description.trim(),
      status,
      questions: event?.questions || [
        {
          id: 'Q001',
          name: 'Circuit Stage 1',
          description: 'Basic circuit loop',
          difficulty: 'Easy',
          penaltySeconds: 5,
          questionOrder: 1,
          slots: [
            {
              id: 'S1',
              label: 'SOURCE',
              hint: '9V DC Voltage Source',
              acceptedComponentId: 'battery',
              pinLabelLeft: 'PWR+',
              pinLabelRight: 'GND-',
              slotOrder: 1
            },
            {
              id: 'S2',
              label: 'LIMITER',
              hint: 'Current Limiter 330Ω',
              acceptedComponentId: 'resistor',
              pinLabelLeft: 'IN',
              pinLabelRight: 'OUT',
              slotOrder: 2
            }
          ]
        }
      ]
    });
  };

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="editor-header-bar">
        <div>
          <h2 className="view-title">
            {isEditing ? `EDIT EVENT // ${event.id}` : 'CREATE NEW TOURNAMENT EVENT'}
          </h2>
          <p className="view-subtitle">Define event metadata and initial status.</p>
        </div>

        <div className="editor-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            <X size={16} />
            <span>Cancel</span>
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit}>
            <Save size={16} />
            <span>Save Event</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error-alert animate-shake mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form-container">
        <div className="admin-form-section">
          <h3 className="section-title">
            <Zap size={16} className="text-cyan-400" />
            <span>EVENT SPECIFICATIONS</span>
          </h3>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label" htmlFor="event-id">
                EVENT ID <span className="required-star">*</span>
              </label>
              <input
                id="event-id"
                type="text"
                className="form-input font-mono"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                disabled={isEditing}
              />
            </div>

            <div className="form-group span-2">
              <label className="form-label" htmlFor="event-name">
                EVENT NAME <span className="required-star">*</span>
              </label>
              <input
                id="event-name"
                type="text"
                className="form-input"
                placeholder="e.g. POWERPATH — Round 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group mt-3">
            <label className="form-label" htmlFor="event-desc">
              EVENT DESCRIPTION
            </label>
            <textarea
              id="event-desc"
              className="form-textarea"
              rows={2}
              placeholder="Describe this tournament round or stage..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group mt-3">
            <label className="form-label" htmlFor="event-status">
              INITIAL STATUS
            </label>
            <select
              id="event-status"
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="INACTIVE">INACTIVE</option>
              <option value="ACTIVE">ACTIVE (Assign to Players)</option>
            </select>
          </div>
        </div>

        <div className="editor-footer-bar mt-4">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={18} />
            <span>Save Event</span>
          </button>
        </div>
      </form>
    </div>
  );
}

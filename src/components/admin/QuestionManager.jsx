import React, { useState, useRef } from 'react';
import {
  Layers,
  PlusCircle,
  Edit2,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Cpu,
  Save,
  X,
  Plus,
  AlertCircle,
  Zap,
  UploadCloud,
  Download,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { GLOBAL_COMPONENTS } from '../../data/gameData.js';
import {
  downloadQuestionsCsvTemplate,
  parseUploadFile,
  validateQuestionUploadRows
} from '../../engine/excelParser.js';

/**
 * QuestionManager - Manage Questions & Dynamic Sockets inside an Event
 */
export function QuestionManager({
  events,
  selectedEventId,
  onSelectEvent,
  onSaveQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
  onReorderQuestions,
  onImportQuestions
}) {
  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;
  const questions = currentEvent?.questions || [];

  const [editingQuestion, setEditingQuestion] = useState(null); // null or question object
  const [modalError, setModalError] = useState('');

  // Question CSV Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Open Create Question Modal
  const handleOpenCreateQuestion = () => {
    const nextOrder = questions.length + 1;
    setEditingQuestion({
      id: `Q${String(nextOrder).padStart(3, '0')}`,
      name: `Circuit Stage ${nextOrder}`,
      description: 'Connect circuit components in series sequence.',
      difficulty: 'Easy',
      penaltySeconds: 5,
      questionOrder: nextOrder,
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
          label: 'SWITCH',
          hint: 'SPST Toggle Switch',
          acceptedComponentId: 'switch',
          pinLabelLeft: 'IN',
          pinLabelRight: 'OUT',
          slotOrder: 2
        },
        {
          id: 'S3',
          label: 'LIMITER',
          hint: 'Current Limiting Resistor 330Ω',
          acceptedComponentId: 'resistor',
          pinLabelLeft: 'IN',
          pinLabelRight: 'OUT',
          slotOrder: 3
        }
      ]
    });
    setModalError('');
  };

  const handleOpenEditQuestion = (q) => {
    setEditingQuestion(JSON.parse(JSON.stringify(q)));
    setModalError('');
  };

  // Reordering questions in event
  const handleMoveQuestion = (index, direction) => {
    if (!currentEvent) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const reordered = [...questions];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const normalized = reordered.map((q, idx) => ({ ...q, questionOrder: idx + 1 }));
    onReorderQuestions(currentEvent.id, normalized);
  };

  // Dynamic Slot editing inside question modal
  const handleAddSlot = () => {
    if (!editingQuestion) return;
    const nextOrder = editingQuestion.slots.length + 1;
    const newSlot = {
      id: `S${nextOrder}`,
      label: `SOCKET_${nextOrder}`,
      hint: 'Circuit Component',
      acceptedComponentId: 'led',
      pinLabelLeft: 'IN',
      pinLabelRight: 'OUT',
      slotOrder: nextOrder
    };
    setEditingQuestion({
      ...editingQuestion,
      slots: [...editingQuestion.slots, newSlot]
    });
  };

  const handleRemoveSlot = (index) => {
    if (!editingQuestion) return;
    if (editingQuestion.slots.length <= 2) {
      setModalError('A circuit question must have at least 2 sockets.');
      return;
    }
    const updatedSlots = editingQuestion.slots
      .filter((_, idx) => idx !== index)
      .map((s, idx) => ({ ...s, slotOrder: idx + 1 }));
    setEditingQuestion({ ...editingQuestion, slots: updatedSlots });
  };

  const handleSlotChange = (index, field, value) => {
    if (!editingQuestion) return;
    const updatedSlots = [...editingQuestion.slots];
    updatedSlots[index] = { ...updatedSlots[index], [field]: value };
    setEditingQuestion({ ...editingQuestion, slots: updatedSlots });
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    if (!editingQuestion || !currentEvent) return;

    const cleanId = (editingQuestion.id || '').trim().toUpperCase();
    const cleanName = (editingQuestion.name || '').trim();

    if (!cleanId) {
      setModalError('Question ID is required.');
      return;
    }
    if (!cleanName) {
      setModalError('Question Name is required.');
      return;
    }
    if (editingQuestion.slots.length < 2) {
      setModalError('A circuit question must have at least 2 sockets.');
      return;
    }

    // Check duplicate slot IDs
    const slotIdSet = new Set();
    for (const slot of editingQuestion.slots) {
      const sId = (slot.id || '').trim().toUpperCase();
      if (!sId) {
        setModalError('All sockets must have a valid Slot ID.');
        return;
      }
      if (slotIdSet.has(sId)) {
        setModalError(`Duplicate Slot ID "${sId}" detected in this question.`);
        return;
      }
      slotIdSet.add(sId);
    }

    onSaveQuestion(currentEvent.id, {
      ...editingQuestion,
      id: cleanId,
      name: cleanName,
      slots: editingQuestion.slots.map((s, idx) => ({
        ...s,
        id: s.id.trim().toUpperCase(),
        label: s.label.trim().toUpperCase(),
        slotOrder: idx + 1
      }))
    });

    setEditingQuestion(null);
  };

  // --------------------------------------------------------------------------
  // QUESTION CSV UPLOAD HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenUploadModal = () => {
    setUploadFile(null);
    setUploadResult(null);
    setIsProcessingUpload(false);
    setIsUploadModalOpen(true);
  };

  const handleProcessQuestionFile = async (file) => {
    if (!file) return;
    setUploadFile(file);
    setIsProcessingUpload(true);
    setUploadResult(null);

    try {
      const rawRows = await parseUploadFile(file);
      const result = validateQuestionUploadRows(rawRows);
      setUploadResult(result);
    } catch (err) {
      setUploadResult({
        isValid: false,
        errors: [{ row: 0, message: err.message }],
        questions: [],
        totalRows: 0
      });
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleConfirmQuestionImport = () => {
    if (!uploadResult || !uploadResult.isValid || !currentEvent) return;
    if (onImportQuestions) {
      onImportQuestions(currentEvent.id, uploadResult.questions);
    }
    setIsUploadModalOpen(false);
  };

  const totalSocketsInCurrentEvent = questions.reduce((sum, q) => sum + (q.slots?.length || 0), 0);

  return (
    <div className="admin-page-view animate-fade-in">
      {/* View Header with Event Switcher & Action Buttons */}
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">QUESTION MANAGEMENT</h2>
          <p className="view-subtitle">
            Configure circuit questions and socket topologies within the selected event.
          </p>
        </div>

        <div className="view-header-actions">
          {events.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-tech text-slate-400 font-bold uppercase">Event:</label>
              <select
                className="admin-filter-select font-bold text-cyan-400"
                value={currentEvent?.id || ''}
                onChange={(e) => onSelectEvent(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.id} — {ev.name} ({ev.questions?.length || 0} Questions &bull; {ev.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleOpenUploadModal}
            disabled={!currentEvent}
            title="Upload CSV questions into the selected event"
          >
            <UploadCloud size={16} />
            <span>Upload Questions CSV</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenCreateQuestion}
            disabled={!currentEvent}
          >
            <PlusCircle size={16} />
            <span>+ Add Question</span>
          </button>
        </div>
      </div>

      {/* Event Header Banner */}
      {currentEvent ? (
        <div className="admin-filter-bar mb-3 flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          <div>
            <span className="text-xs text-slate-400 font-mono">SELECTED EVENT:</span>{' '}
            <strong className="text-white font-mono">{currentEvent.id}</strong> &bull;{' '}
            <span className="text-cyan-400 font-bold">{currentEvent.name}</span>
          </div>
          <div className="flex gap-3 text-xs font-mono">
            <span className="text-slate-300">
              <strong>{questions.length}</strong> Question Stages
            </span>
            <span className="text-slate-300">
              <strong>{totalSocketsInCurrentEvent}</strong> Total Sockets
            </span>
            <span className={`badge ${currentEvent.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}`}>
              {currentEvent.status}
            </span>
          </div>
        </div>
      ) : (
        <div className="upload-error-card mb-4">
          <div className="flex-center-gap">
            <AlertCircle size={18} className="text-amber-400" />
            <span>No events found in database. Please create or bulk import an Event first.</span>
          </div>
        </div>
      )}

      {/* Questions Data Table */}
      <div className="admin-table-card">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th className="w-16">STAGE</th>
              <th>QUESTION ID</th>
              <th>QUESTION NAME &amp; DETAILS</th>
              <th>DIFFICULTY</th>
              <th>SOCKETS</th>
              <th>PENALTY</th>
              <th className="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {questions.length > 0 ? (
              questions.map((q, idx) => (
                <tr key={q.id}>
                  <td className="font-mono font-bold text-cyan-400">#{idx + 1}</td>
                  <td className="font-mono font-bold">{q.id}</td>
                  <td>
                    <div className="challenge-title-meta">
                      <strong className="challenge-table-name">{q.name}</strong>
                      <span className="challenge-table-desc text-ellipsis" title={q.description}>
                        {q.description}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-diff-${(q.difficulty || 'Easy').toLowerCase()}`}>
                      {q.difficulty || 'Easy'}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono">{q.slots?.length || 0} Sockets</span>
                  </td>
                  <td>
                    <span className="font-mono text-amber-400">+{q.penaltySeconds || 5}s</span>
                  </td>
                  <td>
                    <div className="table-actions-row">
                      {/* Move Question Up */}
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => handleMoveQuestion(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Question Up"
                      >
                        <ArrowUp size={14} />
                      </button>

                      {/* Move Question Down */}
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => handleMoveQuestion(idx, 'down')}
                        disabled={idx === questions.length - 1}
                        title="Move Question Down"
                      >
                        <ArrowDown size={14} />
                      </button>

                      {/* Edit Question */}
                      <button
                        type="button"
                        className="table-icon-btn text-cyan-400"
                        onClick={() => handleOpenEditQuestion(q)}
                        title="Edit Question & Sockets"
                      >
                        <Edit2 size={15} />
                      </button>

                      {/* Duplicate Question */}
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => onDuplicateQuestion(currentEvent.id, q.id)}
                        title="Duplicate Question"
                      >
                        <Copy size={15} />
                      </button>

                      {/* Delete Question */}
                      <button
                        type="button"
                        className="table-icon-btn text-rose-400 hover:text-rose-300"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete question "${q.name}" (${q.id}) from event "${currentEvent.name}"?\n\nThis will remove this question and its ${q.slots?.length || 0} sockets. The parent Event will remain.`
                            )
                          ) {
                            onDeleteQuestion(currentEvent.id, q.id);
                          }
                        }}
                        title="Delete Question"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="table-empty-row">
                  {currentEvent
                    ? `No questions configured in event "${currentEvent.name}". Click "+ Add Question" or "Upload Questions CSV" to populate.`
                    : 'No event selected.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* QUESTION CSV UPLOAD MODAL */}
      {isUploadModalOpen && currentEvent && (
        <div className="modal-backdrop animate-fade-in" onClick={() => setIsUploadModalOpen(false)}>
          <div
            className="preview-modal-card animate-scale-up"
            style={{ maxWidth: '780px' }}
            role="dialog"
            aria-labelledby="upload-q-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <div className="preview-title-group">
                <UploadCloud size={24} className="text-cyan-400" />
                <div>
                  <h3 id="upload-q-title" className="preview-title">
                    UPLOAD QUESTIONS &bull; {currentEvent.id}
                  </h3>
                  <p className="preview-subtitle">
                    Adding questions into: <strong className="text-white">{currentEvent.name}</strong> (Will NOT create a new event).
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rules-close-btn"
                onClick={() => setIsUploadModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Template Download Bar */}
            <div className="flex justify-between items-center bg-slate-900/80 p-3 rounded border border-slate-800 mb-3">
              <span className="text-xs text-slate-300">
                CSV Columns: <code className="text-cyan-400 font-mono text-xxs">question_id, question_name, description, difficulty, penalty_seconds, socket_id, socket_label, correct_component, component_description</code>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={downloadQuestionsCsvTemplate}
              >
                <Download size={14} />
                <span>Download Template CSV</span>
              </button>
            </div>

            {/* Dropzone */}
            <div
              className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleProcessQuestionFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                className="hidden-file-input"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessQuestionFile(e.target.files[0]);
                  }
                }}
              />

              <div className="upload-icon-circle">
                <UploadCloud size={30} className="text-cyan-400" />
              </div>

              <h4 className="upload-prompt-title">
                {isProcessingUpload ? 'Validating Question CSV...' : 'Click or Drag & Drop Question CSV here'}
              </h4>
              <p className="upload-prompt-sub">
                Each unique question_id groups multiple socket rows into one Question stage
              </p>

              {uploadFile && (
                <div className="selected-file-chip">
                  <FileText size={14} />
                  <span>{uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>

            {/* Error List */}
            {uploadResult && !uploadResult.isValid && (
              <div className="upload-error-card animate-shake mt-3">
                <div className="error-card-header">
                  <div className="flex-center-gap">
                    <AlertCircle size={18} className="text-rose-400" />
                    <h4 className="error-card-title">VALIDATION FAILED &bull; 0 QUESTIONS IMPORTED</h4>
                  </div>
                  <span className="badge badge-error">{uploadResult.errors.length} Errors</span>
                </div>
                <div className="error-list mt-2">
                  {uploadResult.errors.map((err, idx) => (
                    <div key={idx} className="error-row-item">
                      <span className="error-row-badge font-mono">
                        {err.row > 0 ? `Row ${err.row}` : 'Schema Error'}
                      </span>
                      <span className="error-row-msg">{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {uploadResult && uploadResult.isValid && (
              <div className="mt-3">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 size={14} /> {uploadResult.detectedQuestionsCount} Question(s) Validated Successfully
                  </span>
                  <span className="text-slate-400 font-mono">{uploadResult.totalRows} data rows parsed</span>
                </div>

                <div className="preview-challenges-list" style={{ maxHeight: '220px' }}>
                  {uploadResult.questions.map((q, idx) => (
                    <div key={q.id} className="bg-slate-900/80 p-2.5 rounded border border-slate-800 mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <strong className="text-white text-xs">
                          {idx + 1}. {q.name} <span className="font-mono text-cyan-400">[{q.id}]</span>
                        </strong>
                        <div className="flex gap-1.5">
                          <span className="badge badge-diff-easy text-xxs">{q.difficulty}</span>
                          <span className="badge badge-inactive text-xxs">+{q.penaltySeconds}s</span>
                        </div>
                      </div>
                      <div className="preview-slots-grid">
                        {q.slots.map((s) => (
                          <div key={s.id} className="preview-slot-chip font-mono text-xxs">
                            <span>{s.id}: {s.label}</span>
                            <span className="text-emerald-400">&rarr; {s.acceptedComponentId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="preview-modal-footer mt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsUploadModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!uploadResult || !uploadResult.isValid}
                onClick={handleConfirmQuestionImport}
              >
                <CheckCircle2 size={16} />
                <span>CONFIRM &amp; IMPORT INTO {currentEvent.id}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Question Modal */}
      {editingQuestion && (
        <div className="modal-backdrop animate-fade-in" onClick={() => setEditingQuestion(null)}>
          <div
            className="rules-modal-card animate-scale-up"
            style={{ maxWidth: '780px' }}
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rules-header">
              <div className="rules-title-group">
                <Cpu size={20} className="text-cyan-400" />
                <h3 className="rules-title">
                  {editingQuestion.id ? `CONFIGURE QUESTION // ${editingQuestion.id}` : 'NEW QUESTION'}
                </h3>
              </div>
              <button
                type="button"
                className="rules-close-btn"
                onClick={() => setEditingQuestion(null)}
              >
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="form-error-alert animate-shake mb-3">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="admin-form-container">
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">QUESTION ID</label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    value={editingQuestion.id}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, id: e.target.value.toUpperCase() })
                    }
                  />
                </div>

                <div className="form-group span-2">
                  <label className="form-label">QUESTION NAME</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingQuestion.name}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-group mt-3">
                <label className="form-label">DESCRIPTION / INSTRUCTIONS</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={editingQuestion.description || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, description: e.target.value })
                  }
                />
              </div>

              <div className="form-grid-2 mt-3">
                <div className="form-group">
                  <label className="form-label">DIFFICULTY</label>
                  <select
                    className="form-select"
                    value={editingQuestion.difficulty || 'Easy'}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, difficulty: e.target.value })
                    }
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">PENALTY PER ERROR (SECONDS)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="form-input font-mono"
                    value={editingQuestion.penaltySeconds || 5}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        penaltySeconds: Number(e.target.value) || 5
                      })
                    }
                  />
                </div>
              </div>

              {/* Dynamic Sockets Builder */}
              <div className="admin-form-section mt-4">
                <div className="section-header-row">
                  <span className="font-tech font-bold text-sm text-amber-400">
                    SOCKETS CONFIGURATION ({editingQuestion.slots.length} Sockets)
                  </span>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddSlot}
                  >
                    <Plus size={14} />
                    <span>Add Socket</span>
                  </button>
                </div>

                <div className="slots-designer-list mt-3">
                  {editingQuestion.slots.map((slot, sIdx) => (
                    <div key={sIdx} className="slot-designer-row">
                      <span className="slot-order-badge">#{sIdx + 1}</span>

                      <div className="slot-fields-grid">
                        <input
                          type="text"
                          className="form-input font-mono form-input-sm"
                          placeholder="ID (S1)"
                          value={slot.id}
                          onChange={(e) => handleSlotChange(sIdx, 'id', e.target.value.toUpperCase())}
                        />

                        <input
                          type="text"
                          className="form-input font-tech form-input-sm"
                          placeholder="Label (SOURCE)"
                          value={slot.label}
                          onChange={(e) => handleSlotChange(sIdx, 'label', e.target.value.toUpperCase())}
                        />

                        <select
                          className="form-select form-input-sm"
                          value={slot.acceptedComponentId}
                          onChange={(e) => handleSlotChange(sIdx, 'acceptedComponentId', e.target.value)}
                        >
                          {GLOBAL_COMPONENTS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.isDecoy ? '(DECOY)' : ''}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          className="form-input form-input-sm"
                          placeholder="Hint"
                          value={slot.hint || ''}
                          onChange={(e) => handleSlotChange(sIdx, 'hint', e.target.value)}
                        />
                      </div>

                      <button
                        type="button"
                        className="table-icon-btn text-rose-400 hover:text-rose-300"
                        onClick={() => handleRemoveSlot(sIdx)}
                        disabled={editingQuestion.slots.length <= 2}
                        title="Remove Socket"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="editor-footer-bar mt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingQuestion(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Save size={16} />
                  <span>Save Question</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


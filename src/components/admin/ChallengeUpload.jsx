import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  downloadCsvTemplate,
  downloadExcelTemplate,
  parseUploadFile,
  validateUploadRows
} from '../../engine/excelParser.js';

/**
 * ChallengeUpload - Bulk Challenge Import & Transactional Schema Validator
 */
export function ChallengeUpload({ onImportSuccess, onCancel }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef(null);

  // Handle Drag Over / Leave
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Process File
  const handleProcessFile = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setIsProcessing(true);
    setValidationResult(null);

    try {
      const rawRows = await parseUploadFile(file);
      const result = validateUploadRows(rawRows);
      setValidationResult(result);

      if (result.isValid) {
        setShowPreviewModal(true);
      }
    } catch (err) {
      setValidationResult({
        isValid: false,
        errors: [{ row: 0, message: err.message }],
        challenges: [],
        totalRows: 0
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleConfirmImport = () => {
    if (!validationResult || !validationResult.isValid) return;
    onImportSuccess(validationResult.challenges);
    setShowPreviewModal(false);
  };

  return (
    <div className="admin-page-view animate-fade-in">
      <div className="admin-view-header">
        <div>
          <h2 className="view-title">BULK CHALLENGE UPLOAD</h2>
          <p className="view-subtitle">
            Import circuit challenges in bulk via Excel (.xlsx) or CSV (.csv) with strict transactional schema validation.
          </p>
        </div>

        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={downloadCsvTemplate}
            title="Download formatted CSV template"
          >
            <Download size={14} />
            <span>Download CSV Template</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={downloadExcelTemplate}
            title="Download formatted Excel (.xlsx) template"
          >
            <FileSpreadsheet size={14} />
            <span>Download Excel Template</span>
          </button>
        </div>
      </div>

      {/* Upload Drag & Drop Box */}
      <div
        className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          className="hidden-file-input"
          onChange={handleFileChange}
        />

        <div className="upload-icon-circle">
          <UploadCloud size={36} className="text-cyan-400" />
        </div>

        <h3 className="upload-prompt-title">
          {isProcessing ? 'Validating File Telemetry...' : 'Drag & Drop Excel (.xlsx) or CSV (.csv) file'}
        </h3>
        <p className="upload-prompt-sub">
          or <span className="text-cyan-400 font-semibold underline">browse from your computer</span>
        </p>

        {selectedFile && (
          <div className="selected-file-chip">
            <FileText size={14} />
            <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}
      </div>

      {/* Error Report (Transactional Failure) */}
      {validationResult && !validationResult.isValid && (
        <div className="upload-error-card animate-shake">
          <div className="error-card-header">
            <div className="flex-center-gap">
              <AlertCircle size={20} className="text-rose-400" />
              <h4 className="error-card-title">UPLOAD FAILED &bull; TRANSACTION ABORTED</h4>
            </div>
            <span className="badge badge-error">{validationResult.errors.length} Errors Detected</span>
          </div>

          <p className="error-card-desc">
            Transactional integrity rule: Any validation error rejects the entire batch. No corrupted or incomplete data was imported. Please fix the following errors and upload again.
          </p>

          <div className="error-list">
            {validationResult.errors.map((err, idx) => (
              <div key={idx} className="error-row-item">
                <span className="error-row-badge font-mono">
                  {err.row > 0 ? `Row ${err.row}` : 'File Error'}
                </span>
                <span className="error-row-msg">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Preview Modal */}
      {showPreviewModal && validationResult && validationResult.isValid && (
        <div className="modal-backdrop animate-fade-in" onClick={() => setShowPreviewModal(false)}>
          <div
            className="preview-modal-card animate-scale-up"
            role="dialog"
            aria-labelledby="preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <div className="preview-title-group">
                <CheckCircle2 size={24} className="text-emerald-400" />
                <div>
                  <h3 id="preview-title" className="preview-title">UPLOAD VALIDATION PASSED</h3>
                  <p className="preview-subtitle">
                    {validationResult.detectedChallengesCount} Challenge(s) ready for import ({validationResult.totalRows} valid rows).
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rules-close-btn"
                onClick={() => setShowPreviewModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Validation Checklist */}
            <div className="validation-checks-bar">
              <div className="check-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Structure Valid</span>
              </div>
              <div className="check-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Components Verified</span>
              </div>
              <div className="check-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Unique Socket IDs</span>
              </div>
              <div className="check-item">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Required Fields Present</span>
              </div>
            </div>

            {/* Challenges Preview Cards */}
            <div className="preview-challenges-list">
              {validationResult.challenges.map((c) => (
                <div key={c.id} className="preview-challenge-card">
                  <div className="preview-challenge-header">
                    <div>
                      <strong className="preview-c-name">{c.name}</strong>
                      <span className="font-mono text-cyan-400 text-xs ml-2">[{c.id}]</span>
                    </div>
                    <span className="badge badge-diff-easy">{c.difficulty}</span>
                  </div>

                  <div className="preview-slots-grid">
                    {c.slots.map((slot) => (
                      <div key={slot.id} className="preview-slot-chip font-mono">
                        <span className="font-bold">{slot.id}: {slot.label}</span>
                        <span className="text-emerald-400">&rarr; {slot.acceptedComponentId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="preview-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPreviewModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmImport}
              >
                <CheckCircle2 size={18} />
                <span>CONFIRM &amp; IMPORT ({validationResult.detectedChallengesCount} CHALLENGES)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

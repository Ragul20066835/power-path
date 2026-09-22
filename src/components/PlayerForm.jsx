import React, { useState } from 'react';
import { User, Hash, AlertCircle, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

/**
 * PlayerForm - Participant Registration Card
 * Validates player name & register number before launching the official match session.
 */
export function PlayerForm({ onStartGame }) {
  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanName = name.trim();
    const cleanRegNo = regNo.trim().toUpperCase();

    if (!cleanName) {
      setErrorMessage('Please enter your full name');
      return;
    }

    if (!cleanRegNo) {
      setErrorMessage('Please enter your register / roll number');
      return;
    }

    if (cleanName.length < 2) {
      setErrorMessage('Name must be at least 2 characters long');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    onStartGame({
      name: cleanName,
      regNo: cleanRegNo
    });
  };

  const isFormValid = name.trim().length >= 2 && regNo.trim().length >= 1;

  return (
    <div className="player-form-card glass-panel">
      {/* Card Header */}
      <div className="form-card-header">
        <div className="form-card-badge">
          <ShieldCheck size={14} className="text-cyan-400" />
          <span>OFFICIAL PARTICIPANT ENTRY</span>
        </div>
        <h2 className="form-title">ENTER THE CHALLENGE</h2>
        <p className="form-subtitle">Enter your details to generate an official event session.</p>
      </div>

      {/* Validation Error Alert */}
      {errorMessage && (
        <div className="form-error-alert animate-shake" role="alert">
          <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} noValidate className="player-form-body">
        <div className="form-group">
          <label htmlFor="participant-name" className="form-label">
            <span>PARTICIPANT NAME</span>
            <span className="required-star">*</span>
          </label>
          <div className="input-wrapper">
            <User size={18} className="input-icon" />
            <input
              id="participant-name"
              type="text"
              className="form-input glass-input"
              placeholder="e.g. Alex Rivera"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              maxLength={40}
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="register-number" className="form-label">
            <span>REGISTER NUMBER / ROLL NO</span>
            <span className="required-star">*</span>
          </label>
          <div className="input-wrapper">
            <Hash size={18} className="input-icon" />
            <input
              id="register-number"
              type="text"
              className="form-input glass-input font-mono"
              placeholder="e.g. 24ECE042"
              value={regNo}
              onChange={(e) => {
                setRegNo(e.target.value.toUpperCase());
                if (errorMessage) setErrorMessage('');
              }}
              maxLength={25}
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary start-game-btn"
          disabled={isSubmitting || !isFormValid}
        >
          <span>START CHALLENGE</span>
          <ArrowRight size={18} className="btn-arrow-icon" />
        </button>

        <div className="form-footer-tip">
          <Sparkles size={13} className="text-cyan-400 flex-shrink-0" />
          <span>Your official event timer starts when you begin.</span>
        </div>
      </form>
    </div>
  );
}

export default PlayerForm;

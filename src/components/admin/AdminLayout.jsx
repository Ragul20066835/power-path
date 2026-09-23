import React, { useState } from 'react';
import {
  Layers,
  Zap,
  UploadCloud,
  Users,
  Radio,
  Trophy,
  Settings,
  LogOut,
  ArrowLeft,
  Shield,
  LayoutDashboard,
  ListOrdered,
  Menu,
  X
} from 'lucide-react';
import { DashboardOverview } from './DashboardOverview';
import { EventList } from './EventList';
import { EventEditor } from './EventEditor';
import { QuestionManager } from './QuestionManager';
import { EventUpload } from './EventUpload';
import { ParticipantsList } from './ParticipantsList';
import { LiveMonitor } from './LiveMonitor';
import { ResultsTable } from './ResultsTable';
import { SettingsPanel } from './SettingsPanel';

/**
 * AdminLayout - Main Admin Shell with Navigation Sidebar and Event -> Questions View Dispatcher
 */
export function AdminLayout({
  adminUser,
  events,
  activeEvent,
  participants,
  results,
  settings,
  onActivateEvent,
  onDeactivateEvent,
  onSaveEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onSaveQuestionInEvent,
  onDeleteQuestionFromEvent,
  onDuplicateQuestionInEvent,
  onReorderQuestionsInEvent,
  onImportQuestionsInEvent,
  onImportEvents,
  onSaveSettings,
  onLogout,
  onExitToPlayer,
  onRefresh
}) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'events' | 'event-editor' | 'questions' | 'upload' | 'participants' | 'live' | 'results' | 'settings'
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEventIdForQuestions, setSelectedEventIdForQuestions] = useState(activeEvent?.id || events[0]?.id || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Guard: if the selected event was deleted or doesn't exist, fallback to first available
  const effectiveEventIdForQuestions = events.some((e) => e.id === selectedEventIdForQuestions || e.customId === selectedEventIdForQuestions || e.custom_id === selectedEventIdForQuestions)
    ? selectedEventIdForQuestions
    : (activeEvent?.id || events[0]?.id || '');

  const handleOpenCreateEvent = () => {
    setEditingEvent({});
    setActiveTab('event-editor');
  };

  const handleOpenEditEvent = (event) => {
    setEditingEvent(event);
    setActiveTab('event-editor');
  };

  const handleSaveEventAndClose = (eventData) => {
    onSaveEvent(eventData);
    setEditingEvent(null);
    setActiveTab('events');
  };

  const handleCancelEventEditor = () => {
    setEditingEvent(null);
    setActiveTab('events');
  };

  const handleManageQuestionsForEvent = (event) => {
    setSelectedEventIdForQuestions(event.id);
    setActiveTab('questions');
  };

  const handleImportSuccess = (importedEvents, file) => {
    onImportEvents(importedEvents, file);
    setActiveTab('events');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'events', label: 'Events', icon: Layers, badge: events.length },
    { id: 'questions', label: 'Questions', icon: ListOrdered },
    { id: 'upload', label: 'Bulk Upload', icon: UploadCloud },
    { id: 'participants', label: 'Participants', icon: Users, badge: participants.length },
    { id: 'live', label: 'Live Games', icon: Radio, isLive: true },
    { id: 'results', label: 'Results & Ranks', icon: Trophy, badge: results.length },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="admin-shell-container">
      {/* Mobile Nav Toggle */}
      <div className="admin-mobile-header">
        <button
          type="button"
          className="admin-menu-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="font-tech font-bold text-white">ADMIN CONTROL PANEL</span>
        <button type="button" className="btn-icon-sm" onClick={onExitToPlayer}>
          <ArrowLeft size={16} />
        </button>
      </div>

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand-box">
          <div className="admin-brand-logo">
            <Shield size={20} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="admin-brand-title">POWERPATH</h1>
            <span className="admin-brand-badge font-mono">ADMIN CONTROL v3.0</span>
          </div>
        </div>

        {/* Quick Status */}
        <div className="sidebar-status-card">
          <div className="sidebar-status-row">
            <span className="sidebar-status-label">EVENT STATUS</span>
            <span className={`badge ${settings.eventStatus === 'OPEN' ? 'badge-active' : 'badge-inactive'}`}>
              {settings.eventStatus || 'OPEN'}
            </span>
          </div>
          <div className="sidebar-status-row mt-2">
            <span className="sidebar-status-label">ACTIVE EVENT</span>
            <span className="font-mono text-cyan-400 font-bold text-xs">
              {activeEvent?.id || 'None'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'events' && activeTab === 'event-editor');

            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
              >
                <Icon size={18} className={item.isLive ? 'text-rose-400 animate-pulse' : ''} />
                <span className="nav-label">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="nav-badge font-mono">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-btn exit-player-btn"
            onClick={onExitToPlayer}
          >
            <ArrowLeft size={16} />
            <span>Player Game View</span>
          </button>

          <button
            type="button"
            className="sidebar-footer-btn logout-btn"
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span>Logout Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main-viewport">
        <header className="admin-top-bar">
          <div className="admin-top-info">
            <span className="admin-top-event font-tech">
              ⚡ ELECTROPLAY EVENT ENGINE &bull; {settings.eventStatus === 'OPEN' ? '🟢 TOURNAMENT OPEN' : '🔴 PAUSED'}
            </span>
          </div>

          <div className="admin-top-user">
            <div className="user-profile-chip">
              <span className="user-avatar-circle">A</span>
              <span className="user-name-text">{adminUser?.username || 'Super Admin'}</span>
            </div>
          </div>
        </header>

        <div className="admin-view-content">
          {activeTab === 'dashboard' && (
            <DashboardOverview
              events={events}
              activeEvent={activeEvent}
              participants={participants}
              results={results}
              onNavigateTab={setActiveTab}
              onOpenCreateEvent={handleOpenCreateEvent}
            />
          )}

          {activeTab === 'events' && (
            <EventList
              events={events}
              onActivateEvent={onActivateEvent}
              onDeactivateEvent={onDeactivateEvent}
              onEditEvent={handleOpenEditEvent}
              onDuplicateEvent={onDuplicateEvent}
              onDeleteEvent={onDeleteEvent}
              onManageQuestions={handleManageQuestionsForEvent}
              onOpenCreateEvent={handleOpenCreateEvent}
              onOpenUploadTab={() => setActiveTab('upload')}
            />
          )}

          {activeTab === 'event-editor' && (
            <EventEditor
              event={editingEvent}
              onSave={handleSaveEventAndClose}
              onCancel={handleCancelEventEditor}
            />
          )}

          {activeTab === 'questions' && (
            <QuestionManager
              events={events}
              selectedEventId={effectiveEventIdForQuestions}
              onSelectEvent={setSelectedEventIdForQuestions}
              onSaveQuestion={onSaveQuestionInEvent}
              onDeleteQuestion={onDeleteQuestionFromEvent}
              onDuplicateQuestion={onDuplicateQuestionInEvent}
              onReorderQuestions={onReorderQuestionsInEvent}
              onImportQuestions={onImportQuestionsInEvent}
            />
          )}

          {activeTab === 'upload' && (
            <EventUpload
              onImportSuccess={handleImportSuccess}
              onCancel={() => setActiveTab('events')}
            />
          )}

          {activeTab === 'participants' && (
            <ParticipantsList
              participants={participants}
              events={events}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'live' && (
            <LiveMonitor
              activeEvent={activeEvent}
              participants={participants}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'results' && (
            <ResultsTable
              results={results}
              events={events}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              settings={settings}
              onSaveSettings={onSaveSettings}
            />
          )}
        </div>
      </main>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { FeaturesTab } from './components/FeaturesTab.js';
import { ReviewTab } from './components/ReviewTab.js';
import { NewWorktreeModal } from './components/NewWorktreeModal.js';
import { LinearSetupModal } from './components/LinearSetupModal.js';
import { useWorktrees } from './hooks/useWorktrees.js';
import { useLinear } from './hooks/useLinear.js';
import { api } from './api/client.js';
import type { Tab } from './types/index.js';
import './App.css';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('features');
  const [showModal, setShowModal] = useState(false);
  const [showLinearSetup, setShowLinearSetup] = useState(false);

  const {
    projects,
    selectedProject,
    setSelectedProject,
    worktrees,
    selectedWorktree,
    setSelectedWorktree,
    loading,
    addProject,
    createWorktree,
    deleteWorktree,
    refresh,
  } = useWorktrees();

  const { status: linearStatus, issue, comments, loadingIssue, issueError, effectiveTicketId, setupLinear } = useLinear(selectedWorktree);

  const handleUnlink = useCallback(async () => {
    if (!selectedProject || !selectedWorktree) return;
    await api.unlinkWorktree(selectedProject.id, selectedWorktree.id);
    await refresh();
    setSelectedWorktree((prev) => prev ? { ...prev, linearIssueId: undefined } : null);
  }, [selectedProject, selectedWorktree, refresh, setSelectedWorktree]);

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">claudetree</h1>
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'features' ? 'active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            Features
          </button>
          <button
            className={`tab ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            Review
          </button>
        </nav>
      </header>

      <div className="main-layout">
        <Sidebar
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          worktrees={worktrees}
          selectedWorktree={selectedWorktree}
          onSelectWorktree={setSelectedWorktree}
          onNewWorktree={() => setShowModal(true)}
          onDeleteWorktree={deleteWorktree}
          loading={loading}
          linearStatus={linearStatus}
          onLinearSetup={() => setShowLinearSetup(true)}
        />

        <main className="content">
          {activeTab === 'features' ? (
            <FeaturesTab
              selectedWorktree={selectedWorktree}
              issue={issue}
              comments={comments}
              loadingIssue={loadingIssue}
              issueError={issueError}
              effectiveTicketId={effectiveTicketId}
              onUnlink={handleUnlink}
            />
          ) : (
            <ReviewTab selectedWorktree={selectedWorktree} />
          )}
        </main>
      </div>

      {showModal && (
        <NewWorktreeModal
          onClose={() => setShowModal(false)}
          onCreate={createWorktree}
          onAddProject={addProject}
          hasProject={!!selectedProject}
          linearConnected={linearStatus.connected}
        />
      )}

      {showLinearSetup && (
        <LinearSetupModal
          onClose={() => setShowLinearSetup(false)}
          onSetup={setupLinear}
        />
      )}
    </div>
  );
}

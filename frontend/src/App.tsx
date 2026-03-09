import { useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { FeaturesTab } from './components/FeaturesTab.js';
import { ReviewTab } from './components/ReviewTab.js';
import { NewWorktreeModal } from './components/NewWorktreeModal.js';
import { useWorktrees } from './hooks/useWorktrees.js';
import type { Tab } from './types/index.js';
import './App.css';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('features');
  const [showModal, setShowModal] = useState(false);

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
  } = useWorktrees();

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
        />

        <main className="content">
          {activeTab === 'features' ? (
            <FeaturesTab selectedWorktree={selectedWorktree} />
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
        />
      )}
    </div>
  );
}

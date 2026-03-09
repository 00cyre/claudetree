import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { FeaturesTab } from '@/components/FeaturesTab';
import { ReviewTab } from '@/components/ReviewTab';
import { NewWorktreeModal } from '@/components/NewWorktreeModal';
import { LinearSetupModal } from '@/components/LinearSetupModal';
import { AnthropicSetupModal } from '@/components/AnthropicSetupModal';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useLinear } from '@/hooks/useLinear';
import { api } from '@/api/client';
import type { Tab, AIStatus } from '@/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('features');
  const [showModal, setShowModal] = useState(false);
  const [showLinearSetup, setShowLinearSetup] = useState(false);
  const [showAISetup, setShowAISetup] = useState(false);
  const [aiStatus, setAIStatus] = useState<AIStatus>({ configured: false, connected: false });

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

  const refreshAIStatus = useCallback(async () => {
    try {
      const s = await api.getAIStatus();
      setAIStatus(s);
    } catch { /* backend may not be running */ }
  }, []);

  useEffect(() => { refreshAIStatus(); }, [refreshAIStatus]);

  const handleAISetup = useCallback(async (apiKey: string) => {
    await api.setupAI(apiKey);
    await refreshAIStatus();
  }, [refreshAIStatus]);

  const handleUnlink = useCallback(async () => {
    if (!selectedProject || !selectedWorktree) return;
    await api.unlinkWorktree(selectedProject.id, selectedWorktree.id);
    await refresh();
    setSelectedWorktree((prev) => prev ? { ...prev, linearIssueId: undefined } : null);
  }, [selectedProject, selectedWorktree, refresh, setSelectedWorktree]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-6 px-4 h-12 border-b border-border bg-card shrink-0">
        <h1 className="text-base font-semibold text-primary">claudetree</h1>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="flex-1">
          <TabsList variant="line" className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex flex-1 overflow-hidden">
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
          aiStatus={aiStatus}
          onAISetup={() => setShowAISetup(true)}
        />

        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
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
            <ReviewTab selectedWorktree={selectedWorktree} aiConnected={aiStatus.connected} />
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

      {showAISetup && (
        <AnthropicSetupModal
          onClose={() => setShowAISetup(false)}
          onSetup={handleAISetup}
        />
      )}
    </div>
  );
}

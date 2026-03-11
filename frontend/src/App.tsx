import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from '@/components/Sidebar';
import { FeaturesTab } from '@/components/FeaturesTab';
import { ReviewTab } from '@/components/ReviewTab';
import { NewWorktreeModal } from '@/components/NewWorktreeModal';
import { LinearSetupModal } from '@/components/LinearSetupModal';
import { AnthropicSetupModal } from '@/components/AnthropicSetupModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ContextualToolbar } from '@/components/ContextualToolbar';
import { PipelineProgressTracker } from '@/components/PipelineProgressTracker';
import { PipelineConfirmDialog } from '@/components/PipelineConfirmDialog';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useWorktreeStatuses } from '@/hooks/useWorktreeStatuses';
import { useLinear } from '@/hooks/useLinear';
import { useFlags } from '@/hooks/useFlags';
import { api } from '@/api/client';
import type { Tab, AIStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { SidebarProvider, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TreePine } from 'lucide-react';

function AppHeader({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (t: Tab) => void }) {
  const { state } = useSidebar();
  const sidebarWidth = state === 'collapsed'
    ? 'var(--sidebar-width-icon)'
    : 'var(--sidebar-width)';
  return (
    <header
      className="fixed top-0 left-0 right-0 h-12 z-10 border-b border-border bg-card flex items-center gap-3 px-4 transition-[padding-left] duration-200 ease-linear"
      style={{ paddingLeft: `calc(${sidebarWidth} + 1rem)` }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <TreePine className="size-5 text-primary" />
        <span className="text-sm font-semibold text-primary">claudetree</span>
      </div>
      <ButtonGroup>
        <Button
          size="sm"
          variant={activeTab === 'features' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('features')}
        >
          Features
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'review' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('review')}
        >
          Review
        </Button>
      </ButtonGroup>
    </header>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('features');
  const [showModal, setShowModal] = useState(false);
  const [showLinearSetup, setShowLinearSetup] = useState(false);
  const [showAISetup, setShowAISetup] = useState(false);
  const [aiStatus, setAIStatus] = useState<AIStatus>({ configured: false, connected: false });
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [baseBranch, setBaseBranch] = useState('staging');
  const [branches, setBranches] = useState<string[]>([]);

  const handleTerminalExit = useCallback(() => {
    setReviewRefreshKey((k) => k + 1);
    setActiveTab('review');
  }, []);

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
    reorderWorktrees,
    setWorktreeFlags,
    refresh,
  } = useWorktrees();

  const { flags, createFlag } = useFlags();

  const { sessions: worktreeStatuses, pipelines: pipelineStatuses } = useWorktreeStatuses();

  const { status: linearStatus, issue, comments, loadingIssue, issueError, effectiveTicketId, setupLinear } = useLinear(selectedWorktree);

  useEffect(() => {
    if (!selectedProject) { setBranches([]); return; }
    api.getBranches(selectedProject.id)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [selectedProject]);

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

  const handleEnablePipeline = useCallback(async () => {
    if (!selectedWorktree) return;
    await api.enablePipeline(selectedWorktree.id);
  }, [selectedWorktree]);

  const handleDisablePipeline = useCallback(async () => {
    if (!selectedWorktree) return;
    await api.disablePipeline(selectedWorktree.id);
  }, [selectedWorktree]);

  const handleApprovePipeline = useCallback(async () => {
    if (!selectedWorktree) return;
    await api.approvePipeline(selectedWorktree.id);
  }, [selectedWorktree]);

  const handleRejectPipeline = useCallback(async () => {
    if (!selectedWorktree) return;
    await api.rejectPipeline(selectedWorktree.id);
  }, [selectedWorktree]);

  const currentPipelineStatus = selectedWorktree
    ? pipelineStatuses.get(selectedWorktree.id) ?? null
    : null;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          worktrees={worktrees}
          selectedWorktree={selectedWorktree}
          onSelectWorktree={setSelectedWorktree}
          onNewWorktree={() => setShowModal(true)}
          onDeleteWorktree={deleteWorktree}
          onReorderWorktrees={reorderWorktrees}
          onSetWorktreeFlags={setWorktreeFlags}
          onAddProject={() => setShowModal(true)}
          loading={loading}
          linearStatus={linearStatus}
          onLinearSetup={() => setShowLinearSetup(true)}
          aiStatus={aiStatus}
          onAISetup={() => setShowAISetup(true)}
          statuses={worktreeStatuses}
          pipelineStatuses={pipelineStatuses}
          baseBranch={baseBranch}
          onBaseBranchChange={setBaseBranch}
          branches={branches}
          flags={flags}
          onCreateFlag={createFlag}
        />

        <AppHeader activeTab={activeTab} setActiveTab={setActiveTab} />

        <SidebarInset className="flex flex-col h-screen overflow-hidden pt-12">
          <ContextualToolbar
            worktreeId={selectedWorktree?.id ?? null}
            pipelineStatus={currentPipelineStatus}
            onEnablePipeline={handleEnablePipeline}
            onDisablePipeline={handleDisablePipeline}
            onApprovePipeline={handleApprovePipeline}
            onRejectPipeline={handleRejectPipeline}
            tab={activeTab}
          />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col min-w-0">
            <ErrorBoundary>
              <div className={activeTab === 'features' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                <FeaturesTab
                  selectedWorktree={selectedWorktree}
                  issue={issue}
                  comments={comments}
                  loadingIssue={loadingIssue}
                  issueError={issueError}
                  effectiveTicketId={effectiveTicketId}
                  onUnlink={handleUnlink}
                  onTerminalExit={handleTerminalExit}
                />
              </div>
              <div className={activeTab === 'review' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
                <ReviewTab selectedWorktree={selectedWorktree} aiConnected={aiStatus.connected} issue={issue} refreshKey={reviewRefreshKey} branches={branches} baseBranch={baseBranch} />
              </div>
            </ErrorBoundary>
          </div>
        </SidebarInset>

        {showModal && (
          <NewWorktreeModal
            onClose={() => setShowModal(false)}
            onCreate={createWorktree}
            onAddProject={addProject}
            hasProject={!!selectedProject}
            linearConnected={linearStatus.connected}
            baseBranch={baseBranch}
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

        {currentPipelineStatus && currentPipelineStatus.phase !== 'idle' && (
          <PipelineProgressTracker status={currentPipelineStatus} />
        )}

        {currentPipelineStatus && (
          <PipelineConfirmDialog
            open={currentPipelineStatus.phase === 'confirming'}
            status={currentPipelineStatus}
            onApprove={handleApprovePipeline}
            onReject={handleRejectPipeline}
          />
        )}
      </SidebarProvider>
    </TooltipProvider>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from '@/components/Sidebar';
import { FeaturesTab } from '@/components/FeaturesTab';
import { NewWorktreeModal } from '@/components/NewWorktreeModal';
import { LinearSetupModal } from '@/components/LinearSetupModal';
import { AnthropicSetupModal } from '@/components/AnthropicSetupModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ContextualToolbar } from '@/components/ContextualToolbar';
import { PipelineProgressTracker } from '@/components/PipelineProgressTracker';
import { useWorktrees } from '@/hooks/useWorktrees';
import { useWorktreeStatuses } from '@/hooks/useWorktreeStatuses';
import { useLinear } from '@/hooks/useLinear';
import { useFlags } from '@/hooks/useFlags';
import { useDevStepper } from '@/hooks/useDevStepper';
import { api } from '@/api/client';
import type { AIStatus } from '@/types';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TreePine } from 'lucide-react';

function AppHeader() {
  return (
    <header
      className="fixed top-0 left-0 right-0 h-12 z-10 border-b border-border bg-card flex items-center justify-start gap-3 pl-[18px] pr-[18px] ml-0 mr-0 transition-[padding-left] duration-200 ease-linear"
    >
      <div className="flex items-center gap-2 shrink-0 align-middle">
        <TreePine className="size-5 text-primary" />
        <span className="text-sm font-semibold text-primary">claudetree</span>
      </div>
    </header>
  );
}

export function App() {
  const [showModal, setShowModal] = useState(false);
  const [showLinearSetup, setShowLinearSetup] = useState(false);
  const [showAISetup, setShowAISetup] = useState(false);
  const [aiStatus, setAIStatus] = useState<AIStatus>({ configured: false, connected: false });
  const [baseBranch, setBaseBranch] = useState('staging');
  const [branches, setBranches] = useState<string[]>([]);

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

  const { sessions: worktreeStatuses, pipelines: pipelineStatuses, prWatchers: prWatcherStatuses } = useWorktreeStatuses();

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

  const currentPipelineStatus = selectedWorktree
    ? pipelineStatuses.get(selectedWorktree.id) ?? null
    : null;

  const currentPRWatcherStatus = selectedWorktree
    ? prWatcherStatuses.get(selectedWorktree.id) ?? null
    : null;

  const { currentStep, goToStep, goNext, goPrev, overrides: stepOverrides } = useDevStepper(
    selectedWorktree?.id,
    currentPRWatcherStatus,
  );

  // When terminal exits, advance to review step
  const handleTerminalExit = useCallback(() => {
    goToStep('review');
  }, [goToStep]);

  const handleDismissPRNotification = useCallback(async (notificationId: string) => {
    if (!selectedWorktree) return;
    await api.dismissPRNotification(selectedWorktree.id, notificationId);
  }, [selectedWorktree]);

  const [archivingWorktree, setArchivingWorktree] = useState(false);
  const handleArchiveWorktree = useCallback(async () => {
    if (!selectedWorktree) return;
    setArchivingWorktree(true);
    try { await deleteWorktree(selectedWorktree.id); }
    finally { setArchivingWorktree(false); }
  }, [selectedWorktree, deleteWorktree]);

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
          prWatcherStatuses={prWatcherStatuses}
          baseBranch={baseBranch}
          onBaseBranchChange={setBaseBranch}
          branches={branches}
          flags={flags}
          onCreateFlag={createFlag}
          currentStep={currentStep}
          onStepChange={goToStep}
          stepOverrides={stepOverrides}
        />

        <AppHeader />

        <SidebarInset className="flex flex-col h-screen overflow-hidden pt-12">
          <ContextualToolbar
            worktreeId={selectedWorktree?.id ?? null}
            pipelineStatus={currentPipelineStatus}
            prWatcherStatus={currentPRWatcherStatus}
            onEnablePipeline={handleEnablePipeline}
            onDisablePipeline={handleDisablePipeline}
          />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col min-w-0">
            <ErrorBoundary>
              <div className="flex-1 flex flex-col min-h-0">
                <FeaturesTab
                  selectedWorktree={selectedWorktree}
                  issue={issue}
                  comments={comments}
                  loadingIssue={loadingIssue}
                  issueError={issueError}
                  effectiveTicketId={effectiveTicketId}
                  onUnlink={handleUnlink}
                  onTerminalExit={handleTerminalExit}
                  prWatcherStatus={currentPRWatcherStatus}
                  pipelineStatus={currentPipelineStatus}
                  onDismissPRNotification={handleDismissPRNotification}
                  onEnablePipeline={handleEnablePipeline}
                  onDisablePipeline={handleDisablePipeline}
                  onArchiveWorktree={handleArchiveWorktree}
                  archivingWorktree={archivingWorktree}
                  currentStep={currentStep}
                  aiConnected={aiStatus.connected}
                  branches={branches}
                  baseBranch={baseBranch}
                  sessionStatuses={worktreeStatuses}
                />
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

      </SidebarProvider>
    </TooltipProvider>
  );
}

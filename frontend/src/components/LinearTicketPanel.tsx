import { useMemo } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { ExternalLink, Calendar, User, FolderKanban, Milestone, UserPen, Clock, Paperclip } from 'lucide-react';
import type { LinearIssue, LinearComment } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  MediaImage,
  MediaVideo,
  MediaLink,
  isVideoUrl,
  getLoomEmbedUrl,
  buildAttachmentMap,
  preprocessVideoReferences,
} from '@/components/markdown/media-components';

interface LinearTicketPanelProps {
  issue: LinearIssue;
  comments: LinearComment[];
  onUnlink?: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#f85149',
  2: '#f0883e',
  3: '#d29922',
  4: '#8b949e',
};

const STATUS_COLORS: Record<string, string> = {
  'Done': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'In Progress': 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'In Review': 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  'Todo': 'bg-muted text-muted-foreground border-border',
  'Backlog': 'bg-muted text-muted-foreground border-border',
  'Cancelled': 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

const markdownComponents = {
  img: MediaImage,
  video: MediaVideo,
  a: MediaLink,
};

function MetaItem({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="size-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground truncate">{children}</span>
    </div>
  );
}

export function LinearTicketPanel({ issue, comments, onUnlink }: LinearTicketPanelProps) {
  const statusClass = STATUS_COLORS[issue.status] ?? 'bg-muted text-muted-foreground border-border';
  const attachmentMap = useMemo(() => buildAttachmentMap(issue.attachments), [issue.attachments]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <a
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issue.identifier}
            <ExternalLink className="size-2.5" />
          </a>
          <Badge variant="outline" className={cn('text-[10px] border', statusClass)}>
            {issue.status}
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: PRIORITY_COLORS[issue.priority] ?? '#8b949e', color: PRIORITY_COLORS[issue.priority] ?? '#8b949e' }}
          >
            {issue.priorityLabel}
          </Badge>
          {issue.team && (
            <Badge variant="secondary" className="text-[10px]">{issue.team}</Badge>
          )}
        </div>
        {onUnlink && (
          <Button size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive"
            onClick={onUnlink} title="Unlink issue">
            ×
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground leading-snug">{issue.title}</h3>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.labels.map((label) => (
                <Badge key={label} variant="outline" className="text-[10px] font-normal">{label}</Badge>
              ))}
            </div>
          )}

          {/* Meta grid */}
          <div className="space-y-1.5">
            {issue.assignee && (
              <MetaItem icon={User} label="Assignee">{issue.assignee}</MetaItem>
            )}
            {issue.createdBy && (
              <MetaItem icon={UserPen} label="Creator">{issue.createdBy}</MetaItem>
            )}
            {issue.project && (
              <MetaItem icon={FolderKanban} label="Project">{issue.project}</MetaItem>
            )}
            {issue.projectMilestone && (
              <MetaItem icon={Milestone} label="Milestone">{issue.projectMilestone}</MetaItem>
            )}
            {issue.dueDate && (
              <MetaItem icon={Calendar} label="Due">{new Date(issue.dueDate).toLocaleDateString()}</MetaItem>
            )}
            {issue.createdAt && (
              <MetaItem icon={Clock} label="Created">{timeAgo(issue.createdAt)}</MetaItem>
            )}
          </div>

          {/* Attachments */}
          {issue.attachments && issue.attachments.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Paperclip className="size-3" />
                Attachments
              </div>
              <div className="space-y-1">
                {issue.attachments.map((att) => {
                  const isVideo = isVideoUrl(att.url);
                  const loomEmbed = getLoomEmbedUrl(att.url);

                  if (loomEmbed) {
                    return (
                      <div key={att.id} className="rounded-lg overflow-hidden border border-border">
                        <iframe
                          src={loomEmbed}
                          className="w-full aspect-video"
                          allow="autoplay; fullscreen"
                          allowFullScreen
                        />
                        <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30">{att.title}</div>
                      </div>
                    );
                  }

                  if (isVideo) {
                    return (
                      <div key={att.id} className="rounded-lg overflow-hidden border border-border">
                        <video src={att.url} controls className="w-full" preload="metadata" />
                        <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30">{att.title}</div>
                      </div>
                    );
                  }

                  if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(att.url)) {
                    return (
                      <div key={att.id} className="rounded-lg overflow-hidden border border-border">
                        <img src={att.url} alt={att.title} className="w-full" loading="lazy" />
                        <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30">{att.title}</div>
                      </div>
                    );
                  }

                  return (
                    <a
                      key={att.id}
                      className="flex items-center gap-2 text-xs text-primary hover:underline py-0.5"
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Paperclip className="size-3 shrink-0" />
                      {att.title}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {issue.description && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Description</div>
              <div className="prose-sm text-sm leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_hr]:border-border [&_hr]:my-3 [&_table]:text-xs [&_table]:w-full [&_th]:text-left [&_th]:pb-1 [&_th]:border-b [&_th]:border-border [&_td]:py-1 [&_td]:border-b [&_td]:border-border/50">
                <Markdown rehypePlugins={[rehypeRaw]} components={markdownComponents}>{preprocessVideoReferences(issue.description, attachmentMap)}</Markdown>
              </div>
            </div>
          )}

          {/* Comments */}
          {comments.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Activity ({comments.length})
              </div>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
                      <span className="text-xs font-medium">{comment.author}</span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <div className="px-3 py-2 text-sm leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
                      <Markdown rehypePlugins={[rehypeRaw]} components={markdownComponents}>{preprocessVideoReferences(comment.body, attachmentMap)}</Markdown>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

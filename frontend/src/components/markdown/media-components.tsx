import { type ComponentPropsWithoutRef, type ReactNode, Children, isValidElement } from 'react';

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|ogg)(\?.*)?$/i;
const LOOM_REGEX = /https:\/\/(www\.)?loom\.com\/share\/([a-zA-Z0-9]+)/;

export function isVideoUrl(src: string): boolean {
  return VIDEO_EXTENSIONS.test(src);
}

export function getLoomEmbedUrl(src: string): string | null {
  const match = src.match(LOOM_REGEX);
  return match ? `https://www.loom.com/embed/${match[2]}` : null;
}

function getChildrenText(children: ReactNode): string {
  let text = '';
  Children.forEach(children, (child) => {
    if (typeof child === 'string') text += child;
    else if (typeof child === 'number') text += String(child);
    else if (isValidElement(child) && child.props?.children) {
      text += getChildrenText(child.props.children);
    }
  });
  return text;
}

/**
 * Map of plain video filenames → actual URLs.
 * Populated by `buildAttachmentMap` from attachment metadata.
 */
export type AttachmentMap = Map<string, string>;

export function buildAttachmentMap(
  attachments?: Array<{ title: string; url: string }>,
): AttachmentMap {
  const map = new Map<string, string>();
  if (!attachments) return map;
  for (const att of attachments) {
    if (isVideoUrl(att.url) || isVideoUrl(att.title)) {
      map.set(att.title, att.url);
      const base = att.title.replace(/\.\w+$/, '');
      map.set(base, att.url);
    }
  }
  return map;
}

function VideoPlayer({ src, title }: { src: string; title?: string }) {
  return (
    <video
      src={src}
      controls
      preload="metadata"
      className="my-2 w-full rounded-lg border border-border"
    >
      {title}
    </video>
  );
}

function LoomEmbed({ src }: { src: string }) {
  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border">
      <iframe
        src={src}
        className="w-full aspect-video"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  );
}

export function MediaImage({ src, alt, ...rest }: ComponentPropsWithoutRef<'img'>) {
  if (!src) return null;

  const loomEmbed = getLoomEmbedUrl(src);
  if (loomEmbed) return <LoomEmbed src={loomEmbed} />;

  if (isVideoUrl(src) || (alt && isVideoUrl(alt))) {
    return <VideoPlayer src={src} title={alt} />;
  }

  return (
    <img
      src={src}
      alt={alt || ''}
      loading="lazy"
      className="my-2 max-w-full rounded-lg border border-border"
      {...rest}
    />
  );
}

export function MediaVideo({ src, ...rest }: ComponentPropsWithoutRef<'video'>) {
  if (!src) return null;
  return <VideoPlayer src={src} />;
}

export function MediaLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  if (!href) return <a {...rest}>{children}</a>;

  const loomEmbed = getLoomEmbedUrl(href);
  if (loomEmbed) return <LoomEmbed src={loomEmbed} />;

  if (isVideoUrl(href)) return <VideoPlayer src={href} />;

  const text = getChildrenText(children);
  if (text && isVideoUrl(text)) return <VideoPlayer src={href} />;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * Pre-process markdown text to convert bare video filenames to playable embeds
 * when attachment URLs are available. Also converts bare URLs on their own line
 * to markdown image syntax so they get picked up by the img component.
 */
export function preprocessVideoReferences(
  markdown: string,
  attachments?: AttachmentMap,
): string {
  return markdown.replace(/^(.+\.(?:mp4|webm|mov|ogg))$/gim, (match, filename) => {
    const trimmed = filename.trim();
    if (trimmed.startsWith('![') || trimmed.startsWith('<')) return match;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return `![video](${trimmed})`;
    }

    if (attachments) {
      const url = attachments.get(trimmed) || attachments.get(trimmed.replace(/\.\w+$/, ''));
      if (url) return `![${trimmed}](${url})`;
    }

    return match;
  });
}

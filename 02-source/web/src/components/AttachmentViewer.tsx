import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { downloadFile, fetchBlob } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Attachment } from '../lib/types';
import { Button, EmptyState, LoadingBlock } from './ui';

export function AttachmentViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const [source, setSource] = useState<{ url: string; type: string; dispose: () => void } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let handle: { url: string; type: string; dispose: () => void } | null = null;
    fetchBlob(`/api/attachments/${attachment.id}/file`)
      .then((blob) => {
        if (disposed) {
          blob.dispose();
          return;
        }
        handle = blob;
        setSource(blob);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      handle?.dispose();
    };
  }, [attachment.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={attachment.fileName}>
      <button type="button" className="lightbox-scrim" onClick={onClose} aria-label="Close preview" />
      <div className="lightbox-panel">
        <header className="lightbox-head">
          <div>
            <div className="eyebrow">Supporting document</div>
            <strong>{attachment.fileName}</strong>
            <span>
              {attachment.kind} · {attachment.declaredAmountMinor !== null ? formatMoney(attachment.declaredAmountMinor) : 'No declared nominal'}
              {attachment.linkedInvoiceNumber ? ` · ${attachment.linkedInvoiceNumber}` : ''}
            </span>
          </div>
          <div className="lightbox-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={() => downloadFile(`/api/attachments/${attachment.id}/file`, attachment.fileName)}
            >
              Download
            </Button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="lightbox-body">
          {failed && <EmptyState title="Preview unavailable" message="The file could not be rendered. Download it instead." />}
          {!failed && !source && <LoadingBlock rows={4} />}
          {source && source.type.startsWith('image/') && <img src={source.url} alt={attachment.fileName} />}
          {source && source.type === 'application/pdf' && <iframe src={source.url} title={attachment.fileName} />}
          {source && !source.type.startsWith('image/') && source.type !== 'application/pdf' && (
            <EmptyState title="Preview not supported" message="Download the file to inspect it." />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

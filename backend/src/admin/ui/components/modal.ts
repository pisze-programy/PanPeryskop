import { tpl } from '../templates';

export function modal(o: { id: string; dialogCls?: string; status?: string; content: string }): string {
  return tpl('modal', {
    id: o.id,
    dialogCls: o.dialogCls ?? 'modal-dialog-centered modal-blur',
    status: o.status ?? '',
    content: o.content,
  });
}

// Standard full-media preview modal (shared by events/posts/reports).
export function mediaModal(): string {
  return modal({
    id: 'ppMediaModal',
    dialogCls: 'modal-dialog-centered modal-xl modal-blur',
    content: `<div class="modal-content bg-transparent border-0 shadow-none">
      <img id="ppMediaImg" alt="" class="img-fluid mx-auto rounded" onclick="ppMediaClose()" />
    </div>`,
  });
}

// Standard alert modal (shared by events/…).
export function alertModal(): string {
  return modal({
    id: 'ppAlertModal',
    dialogCls: 'modal-dialog-centered modal-sm modal-blur',
    content: `<div class="modal-header"><h3 class="modal-title" id="ppAlertTitle">Uwaga</h3></div>
      <div class="modal-body" id="ppAlertMsg"></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="ppAlertClose()">OK (ESC)</button></div>`,
  });
}

// Event-link preview modal (events page only).
export function linkModal(): string {
  return modal({
    id: 'ppLinkModal',
    dialogCls: 'modal-xl modal-blur',
    content: `<div class="modal-header">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.open(window.ppCurExternal||window.ppCurLink||'', '_blank', 'noopener')">Otwórz w nowej karcie</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="ppLinkClose()">Zamknij (ESC)</button>
      </div>
      <div class="modal-body p-0">
        <iframe id="ppLinkFrame" title="Podgląd" class="w-100 border-0 d-block" height="640" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
      </div>`,
  });
}

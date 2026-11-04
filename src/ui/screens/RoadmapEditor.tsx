// S14 — Roadmap editor `#/roadmaps/:id/edit` (phase 8, M19; DESIGN v8.0 S14, D8 … D10; FR-69, FR-70, FR-74; ADR-51,
// A-78, A-83, A-D84, A-D85). Lazy route (ADR-53). Every structural action saves at once through RoadmapService; the
// roadmap fields have their own `Save details`. The live query re-renders the structure after each write.
// M20: the Checkpoints section (list in date order, inline CheckpointEditor, D11 delete, 50 cap).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { addDays, toISODate } from '../../domain/dates';
import { ROADMAP_LIMITS, type RoadmapCheckpoint, type RoadmapItem, type RoadmapPhase } from '../../domain/roadmap';
import type { RoadmapView } from '../../domain/roadmap-progress';
import type { DomainError, Goal } from '../../domain/types';
import { Alert } from '../components/Alert';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { CheckpointEditor } from '../components/roadmap/CheckpointEditor';
import { ItemEditor } from '../components/roadmap/ItemEditor';
import { MoveButtons, moveButtonId } from '../components/roadmap/MoveButtons';
import { PhaseEditor } from '../components/roadmap/PhaseEditor';
import { RoadmapFields } from '../components/roadmap/RoadmapFields';
import { RoadmapNotFound } from '../components/roadmap/RoadmapNotFound';
import { formatScore } from '../components/roadmap/score';
import { useRoadmapErrors } from '../components/roadmap/useRoadmapErrors';
import { useRoadmapDetail, type RoadmapServiceState } from '../components/roadmap/useRoadmapService';
import { useDelayed } from '../hooks/useDelayed';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import '../styles/roadmaps.css';

type Service = NonNullable<RoadmapServiceState['service']>;

/** The one inline sub-form that may be open (DESIGN S14 "Quy tắc form" (2)). */
type OpenForm =
  | { kind: 'phase'; mode: 'add' }
  | { kind: 'phase'; mode: 'edit'; id: string }
  | { kind: 'item'; mode: 'add'; phaseId: string }
  | { kind: 'item'; mode: 'edit'; id: string }
  | { kind: 'cp'; mode: 'add' }
  | { kind: 'cp'; mode: 'edit'; id: string };

type Confirm = { kind: 'roadmap' } | { kind: 'phase'; phase: RoadmapPhase; count: number } | { kind: 'item'; item: RoadmapItem } | { kind: 'cp'; cp: RoadmapCheckpoint };

export function RoadmapEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const { tm } = useT('roadmap');
  const today = toISODate(useNow());
  const [attempt, setAttempt] = useState(0);
  const { service, error: loadError, view, viewError } = useRoadmapDetail(id, today, attempt);
  const showSkeleton = useDelayed(view === undefined && loadError === undefined && viewError === undefined);
  // The roadmap is being deleted from this screen: the live query drops it before the navigation renders (M5-D1 pattern).
  const [deleting, setDeleting] = useState(false);

  if (loadError !== undefined || viewError !== undefined) {
    return <ErrorState title={tm('errors.loadViewTitle')} body={tm('errors.loadViewBody')} actionLabel={tm('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  }
  if (view === undefined) return showSkeleton ? <Skeleton blocks={3} /> : null;
  if (view === null) return deleting ? null : <RoadmapNotFound />;
  return <EditorView key={id} view={view} today={today} service={service!} onDeleting={setDeleting} />;
}

function EditorView({ view, today, service, onDeleting }: { view: RoadmapView; today: string; service: Service; onDeleting: (v: boolean) => void }) {
  const { t } = useT('roadmap');
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  // "Link a goal" on the detail opens the editor with the picker focused (`?focus=goal`, DESIGN S13 "Giờ —").
  const focusGoal = useLocation().search.includes('focus=goal');
  const errorText = useRoadmapErrors();
  const { roadmap, phases, items, checkpoints, linkState } = view;
  useDocumentTitle(t('ed.titleEdit'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // "Link a goal" lands on the picker instead (RoadmapFields focuses it); otherwise the heading, like every route change.
    if (!focusGoal) headingRef.current?.focus({ preventScroll: true });
  }, [focusGoal]);

  // Goals the picker may offer (A-78); reloaded after `Save details` changes the link.
  const [goals, setGoals] = useState<Goal[] | undefined>(undefined);
  const [goalsVersion, setGoalsVersion] = useState(0);
  useEffect(() => {
    let active = true;
    service.linkableGoals(roadmap.id).then((g) => active && setGoals(g), () => active && setGoals([]));
    return () => {
      active = false;
    };
  }, [service, roadmap.id, roadmap.goalId, goalsVersion]);

  const [open, setOpen] = useState<OpenForm | null>(null);
  const dirty = useRef(false);
  const opener = useRef<string | null>(null);
  const [limitError, setLimitError] = useState<{ where: string; error: DomainError } | null>(null);
  const [actionError, setActionError] = useState<DomainError | 'write' | null>(null);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingFocus = useRef<string | null>(null);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  // After a move the row re-renders in its new place; put focus back on the very button that was pressed (DESIGN §8.4).
  useEffect(() => {
    if (pendingFocus.current) {
      document.getElementById(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  });

  const focusLater = (elementId: string | null) => {
    if (!elementId) return;
    requestAnimationFrame(() => document.getElementById(elementId)?.focus());
  };

  /** Open a sub-form; a dirty open form stays and gets focus instead (no typed text is lost). */
  const openForm = (next: OpenForm, openerId: string) => {
    if (open && dirty.current) {
      document.querySelector<HTMLElement>('.re-sub input, .re-sub textarea')?.focus();
      return;
    }
    setLimitError(null);
    dirty.current = false;
    opener.current = openerId;
    setOpen(next);
  };
  const closeForm = (focusId: string | null = opener.current) => {
    setOpen(null);
    dirty.current = false;
    focusLater(focusId);
  };

  const byPhase = new Map<string, RoadmapItem[]>();
  for (const i of items) byPhase.set(i.phaseId, [...(byPhase.get(i.phaseId) ?? []), i]);

  // ---- moves (ADR-51): `beforeId` = the sibling that follows the new slot, `null` = last ----
  async function movePhase(phase: RoadmapPhase, dir: -1 | 1) {
    const idx = phases.findIndex((p) => p.id === phase.id);
    const others = phases.filter((p) => p.id !== phase.id);
    const target = idx + dir;
    pendingFocus.current = moveButtonId(phase.id, dir);
    const r = await service.movePhase(phase.id, others[target]?.id ?? null);
    if (r.ok) setStatus(t('ed.movedStatus', { title: phase.title, pos: f.number(target + 1), total: f.number(phases.length) }));
    else setActionError(r.errors[0]!);
  }
  async function moveItem(item: RoadmapItem, dir: -1 | 1) {
    const siblings = byPhase.get(item.phaseId) ?? [];
    const idx = siblings.findIndex((i) => i.id === item.id);
    const others = siblings.filter((i) => i.id !== item.id);
    const target = idx + dir;
    pendingFocus.current = moveButtonId(item.id, dir);
    const r = await service.moveItem(item.id, item.phaseId, others[target]?.id ?? null);
    if (r.ok) setStatus(t('ed.movedStatus', { title: item.title, pos: f.number(target + 1), total: f.number(siblings.length) }));
    else setActionError(r.errors[0]!);
  }

  // ---- add buttons: the limit is checked before opening the form (DESIGN S14 "Quy tắc form" (5)) ----
  const addPhase = (openerId: string) => {
    if (phases.length >= ROADMAP_LIMITS.phase) {
      setLimitError({ where: 'phase', error: { code: 'ROADMAP_LIMIT_REACHED', message: 'phase limit', params: { kind: 'phase', max: ROADMAP_LIMITS.phase } } });
      return;
    }
    openForm({ kind: 'phase', mode: 'add' }, openerId);
  };
  const addItem = (phaseId: string, openerId: string) => {
    if (items.length >= ROADMAP_LIMITS.item) {
      setLimitError({ where: phaseId, error: { code: 'ROADMAP_LIMIT_REACHED', message: 'item limit', params: { kind: 'item', max: ROADMAP_LIMITS.item } } });
      return;
    }
    openForm({ kind: 'item', mode: 'add', phaseId }, openerId);
  };
  const addCheckpoint = (openerId: string) => {
    if (checkpoints.length >= ROADMAP_LIMITS.checkpoint) {
      setLimitError({ where: 'cp', error: { code: 'ROADMAP_LIMIT_REACHED', message: 'checkpoint limit', params: { kind: 'checkpoint', max: ROADMAP_LIMITS.checkpoint } } });
      return;
    }
    openForm({ kind: 'cp', mode: 'add' }, openerId);
  };

  // A-83: the 7 days right after the last item of the whole roadmap (today → +6 when there is none). Pure, from the view.
  const suggested = (() => {
    const last = items.at(-1);
    const start = last ? addDays(last.plannedEnd, 1) : today;
    return { plannedStart: start, plannedEnd: addDays(start, 6) };
  })();

  // ---- delete (D8 … D10) ----
  async function confirmDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'roadmap') {
        onDeleting(true);
        const r = await service.remove(roadmap.id);
        if (r.ok) {
          toast.show('roadmap:toast.deleted');
          setConfirm(null);
          void navigate('/roadmaps', { replace: true });
          return;
        }
        onDeleting(false);
        setActionError(r.errors[0]!);
      } else if (confirm.kind === 'phase') {
        const r = await service.removePhase(confirm.phase.id);
        if (r.ok) toast.show('roadmap:toast.phaseDeleted');
        else setActionError(r.errors[0]!);
        focusLater('add-phase');
      } else if (confirm.kind === 'item') {
        const r = await service.removeItem(confirm.item.id);
        if (r.ok) toast.show('roadmap:toast.itemDeleted');
        else setActionError(r.errors[0]!);
        focusLater(`add-item-${confirm.item.phaseId}`);
      } else {
        const r = await service.removeCheckpoint(confirm.cp.id);
        if (r.ok) toast.show('roadmap:toast.checkpointDeleted');
        else setActionError(r.errors[0]!);
        focusLater('add-cp');
      }
      setConfirm(null);
    } catch {
      setActionError('write');
      setConfirm(null);
      onDeleting(false);
    } finally {
      setBusy(false);
    }
  }
  const cancelConfirm = useCallback(() => {
    const c = confirm;
    setConfirm(null);
    if (c) focusLater(c.kind === 'roadmap' ? 'delete-roadmap' : c.kind === 'phase' ? `del-phase-${c.phase.id}` : c.kind === 'item' ? `del-item-${c.item.id}` : `del-cp-${c.cp.id}`);
  }, [confirm]);

  const dialog = (() => {
    if (!confirm) return { title: '', body: '', confirmLabel: '' };
    if (confirm.kind === 'roadmap') {
      const empty = phases.length + items.length + checkpoints.length === 0;
      return {
        title: t('ed.deleteRoadmapTitle', { title: roadmap.title }),
        body: empty
          ? t('ed.deleteRoadmapBodyEmpty')
          : t('ed.deleteRoadmapBody', { phases: t('count.phases', { count: phases.length }), items: t('count.items', { count: items.length }), checkpoints: t('count.checkpoints', { count: checkpoints.length }) }),
        confirmLabel: t('ed.deleteRoadmap'),
      };
    }
    if (confirm.kind === 'phase') {
      return {
        title: t('ed.deletePhaseTitle', { title: confirm.phase.title }),
        body: confirm.count === 0 ? t('ed.deletePhaseBodyEmpty') : t('ed.deletePhaseBody', { count: confirm.count }),
        confirmLabel: t('ed.deletePhase'),
      };
    }
    if (confirm.kind === 'cp') return { title: t('ed.deleteCpTitle', { title: confirm.cp.title }), body: t('ed.deleteCpBody'), confirmLabel: t('ed.deleteCpConfirm') };
    return { title: t('ed.deleteItemTitle', { title: confirm.item.title }), body: t('ed.deleteItemBody'), confirmLabel: t('ed.deleteItemConfirm') };
  })();

  const limitAlert = (where: string) => (limitError && limitError.where === where ? <Alert>{errorText(limitError.error)}</Alert> : null);

  return (
    <div className="re-col">
      <LinkButton variant="ghost" icon="left" className="back" to={`/roadmaps/${roadmap.id}`}>
        {t('detail.back')}
      </LinkButton>
      <header className="page-head">
        <div className="titles">
          <h1 ref={headingRef} tabIndex={-1}>
            {t('ed.titleEdit')}
          </h1>
        </div>
      </header>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="editor-status">
        {status}
      </div>
      {actionError ? <Alert>{errorText(actionError)}</Alert> : null}

      <RoadmapFields
        roadmap={roadmap}
        goals={goals}
        goalMissing={linkState === 'missing'}
        srLabel={t('ed.srForm')}
        submitLabel={t('ed.saveDetails')}
        focusGoal={focusGoal}
        onSubmit={(input) => service.update(roadmap.id, input)}
        onSaved={() => {
          toast.show('roadmap:toast.saved');
          setGoalsVersion((n) => n + 1);
        }}
      />

      <section className="re-sec" aria-labelledby="re-ph-h" data-testid="editor-phases">
        <h2 className="eyebrow" id="re-ph-h">
          {t('ed.phasesTitle')}
        </h2>
        {phases.length === 0 ? <p className="re-hint-empty">{t('ed.noPhases')}</p> : null}
        {phases.map((phase, pi) => {
          const list = byPhase.get(phase.id) ?? [];
          const titleId = `ph-t-${phase.id}`;
          return (
            <div key={phase.id} className="re-ph" role="group" aria-labelledby={titleId} data-testid="editor-phase" data-phase={phase.id}>
              <div className="re-ph-top">
                <div>
                  <h3 id={titleId}>{phase.title}</h3>
                  {phase.note ? <p className="re-ph-note">{phase.note}</p> : null}
                </div>
                <div className="re-tools">
                  <MoveButtons id={phase.id} title={phase.title} index={pi} count={phases.length} onMove={(dir) => void movePhase(phase, dir)} />
                  <Button variant="secondary" className="sm" id={`edit-phase-${phase.id}`} aria-label={t('ed.editPhaseAria', { title: phase.title })} onClick={() => openForm({ kind: 'phase', mode: 'edit', id: phase.id }, `edit-phase-${phase.id}`)}>
                    {t('ed.editPhase')}
                  </Button>
                  <Button variant="danger-ghost" className="sm" id={`del-phase-${phase.id}`} aria-label={t('ed.deletePhaseAria', { title: phase.title })} onClick={() => setConfirm({ kind: 'phase', phase, count: list.length })}>
                    {t('ed.deletePhase')}
                  </Button>
                </div>
              </div>
              {open?.kind === 'phase' && open.mode === 'edit' && open.id === phase.id ? (
                <PhaseEditor mode="edit" initial={phase} labelledBy={titleId} onDirty={onDirty} onSave={(input) => service.updatePhase(phase.id, input)} onSaved={() => closeForm()} onCancel={() => closeForm()} />
              ) : null}
              {list.length === 0 ? <p className="re-hint-empty re-add">{t('ed.noItemsInPhase')}</p> : null}
              {list.map((item, ii) => {
                const itemTitleId = `it-t-${item.id}`;
                return (
                  <div key={item.id} className="re-it" data-testid="editor-item" data-item={item.id}>
                    <div className="re-it-row">
                      <div className="re-it-t">
                        <b id={itemTitleId}>{item.title}</b>
                        <span className="num">{f.itemRange(item.plannedStart, item.plannedEnd)}</span>
                      </div>
                      <div className="re-tools">
                        <MoveButtons id={item.id} title={item.title} index={ii} count={list.length} onMove={(dir) => void moveItem(item, dir)} />
                        <Button variant="secondary" className="sm" id={`edit-item-${item.id}`} aria-label={t('ed.editItemAria', { title: item.title })} onClick={() => openForm({ kind: 'item', mode: 'edit', id: item.id }, `edit-item-${item.id}`)}>
                          {t('ed.editItem')}
                        </Button>
                        <Button variant="danger-ghost" className="sm" id={`del-item-${item.id}`} aria-label={t('ed.deleteItemAria', { title: item.title })} onClick={() => setConfirm({ kind: 'item', item })}>
                          {t('ed.deleteItem')}
                        </Button>
                      </div>
                    </div>
                    {open?.kind === 'item' && open.mode === 'edit' && open.id === item.id ? (
                      <ItemEditor
                        mode="edit"
                        initial={item}
                        phases={phases}
                        phaseId={item.phaseId}
                        labelledBy={itemTitleId}
                        onDirty={onDirty}
                        onSave={async (input, targetPhase) => {
                          const r = await service.updateItem(item.id, input, today);
                          if (!r.ok || targetPhase === item.phaseId) return r;
                          // Changing the phase moves the item to the end of the chosen phase (DESIGN S14, A-D84).
                          return service.moveItem(item.id, targetPhase, null);
                        }}
                        onSaved={() => closeForm()}
                        onCancel={() => closeForm()}
                      />
                    ) : null}
                  </div>
                );
              })}
              {limitAlert(phase.id)}
              {open?.kind === 'item' && open.mode === 'add' && open.phaseId === phase.id ? (
                <ItemEditor mode="add" initial={null} phases={phases} phaseId={phase.id} suggested={suggested} labelledBy={titleId} onDirty={onDirty} onSave={(input, targetPhase) => service.addItem(targetPhase, input, today)} onSaved={() => closeForm()} onCancel={() => closeForm()} />
              ) : null}
              <div className="re-add">
                <Button variant="secondary" className="sm" id={`add-item-${phase.id}`} icon="plus" onClick={() => addItem(phase.id, `add-item-${phase.id}`)}>
                  {t('ed.addItem')}
                </Button>
              </div>
            </div>
          );
        })}
        {limitAlert('phase')}
        {open?.kind === 'phase' && open.mode === 'add' ? <PhaseEditor mode="add" initial={null} labelledBy="re-ph-h" onDirty={onDirty} onSave={(input) => service.addPhase(roadmap.id, input)} onSaved={() => closeForm()} onCancel={() => closeForm()} /> : null}
        <div className="re-add">
          <Button variant="secondary" id="add-phase" icon="plus" onClick={() => addPhase('add-phase')}>
            {t('ed.addPhase')}
          </Button>
        </div>
      </section>

      <section className="re-sec" aria-labelledby="re-cp-h" data-testid="editor-checkpoints">
        <h2 className="eyebrow" id="re-cp-h">
          {t('cp.title')}
        </h2>
        {checkpoints.length === 0 ? <p className="re-hint-empty">{t('ed.noCheckpoints')}</p> : null}
        {checkpoints.map((cp) => {
          const cpTitleId = `cp-t-${cp.id}`;
          const vars = { date: f.dateShort(cp.date), max: formatScore(f.locale, cp.maxScore) };
          return (
            <div key={cp.id} className="re-it" data-testid="editor-checkpoint" data-cp={cp.id}>
              <div className="re-it-row">
                <div className="re-it-t">
                  <b id={cpTitleId}>{cp.title}</b>
                  <span className="num">{cp.threshold === null ? t('ed.cpRow', vars) : t('ed.cpRowThreshold', { ...vars, threshold: formatScore(f.locale, cp.threshold) })}</span>
                </div>
                <div className="re-tools">
                  <Button variant="secondary" className="sm" id={`edit-cp-${cp.id}`} aria-label={t('ed.editCpAria', { title: cp.title })} onClick={() => openForm({ kind: 'cp', mode: 'edit', id: cp.id }, `edit-cp-${cp.id}`)}>
                    {t('ed.editItem')}
                  </Button>
                  <Button variant="danger-ghost" className="sm" id={`del-cp-${cp.id}`} aria-label={t('ed.deleteCpAria', { title: cp.title })} onClick={() => setConfirm({ kind: 'cp', cp })}>
                    {t('ed.deleteItem')}
                  </Button>
                </div>
              </div>
              {open?.kind === 'cp' && open.mode === 'edit' && open.id === cp.id ? (
                <CheckpointEditor mode="edit" initial={cp} today={today} labelledBy={cpTitleId} onDirty={onDirty} onSave={(input) => service.updateCheckpoint(cp.id, input)} onSaved={() => closeForm()} onCancel={() => closeForm()} />
              ) : null}
            </div>
          );
        })}
        {limitAlert('cp')}
        {open?.kind === 'cp' && open.mode === 'add' ? <CheckpointEditor mode="add" initial={null} today={today} labelledBy="re-cp-h" onDirty={onDirty} onSave={(input) => service.addCheckpoint(roadmap.id, input)} onSaved={() => closeForm()} onCancel={() => closeForm()} /> : null}
        <div className="re-add">
          <Button variant="secondary" id="add-cp" icon="plus" onClick={() => addCheckpoint('add-cp')}>
            {t('ed.addCp')}
          </Button>
        </div>
      </section>

      <section className="re-danger" aria-labelledby="re-dz-h">
        <h2 className="eyebrow" id="re-dz-h">
          {t('ed.dangerTitle')}
        </h2>
        <Button variant="danger-ghost" id="delete-roadmap" onClick={() => setConfirm({ kind: 'roadmap' })}>
          {t('ed.deleteRoadmap')}
        </Button>
      </section>
      <div className="re-done">
        <LinkButton variant="primary" to={`/roadmaps/${roadmap.id}`} data-testid="editor-done">
          {t('ed.done')}
        </LinkButton>
      </div>

      <ConfirmDialog open={confirm !== null} title={dialog.title} body={dialog.body} confirmLabel={dialog.confirmLabel} busy={busy} onConfirm={() => void confirmDelete()} onCancel={cancelConfirm} />
    </div>
  );
}

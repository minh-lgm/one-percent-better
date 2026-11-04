// S12 — New roadmap `#/roadmaps/new` (phase 8, M19; DESIGN v8.0 S12; FR-69, FR-70, FR-74). Lazy route (ADR-53).
// Only the roadmap fields; after `Create roadmap` the editor opens to add phases and items (A-D85). M20: a banner on top
// offers the QPT template instead (D7).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Goal } from '../../domain/types';
import { toISODate } from '../../domain/dates';
import { Button, LinkButton } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { RoadmapFields } from '../components/roadmap/RoadmapFields';
import { useTemplateDialog } from '../components/roadmap/TemplateDialog';
import { useRoadmapService } from '../components/roadmap/useRoadmapService';
import { useNow } from '../hooks/useNow';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';
import '../styles/roadmaps.css';

export function RoadmapNew() {
  const { t, tm } = useT('roadmap');
  const toast = useToast();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const { service, error: loadError } = useRoadmapService(attempt);
  const template = useTemplateDialog(service, toISODate(useNow()));
  const [goals, setGoals] = useState<Goal[] | undefined>(undefined);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.linkableGoals(null).then((g) => active && setGoals(g), () => active && setGoals([]));
    return () => {
      active = false;
    };
  }, [service]);

  if (loadError !== undefined) {
    return <ErrorState title={tm('errors.loadViewTitle')} body={tm('errors.loadViewBody')} actionLabel={tm('common.retry')} onAction={() => setAttempt((n) => n + 1)} />;
  }
  const back = (
    <LinkButton variant="ghost" className="back" to="/roadmaps" icon="left">
      {t('detail.back')}
    </LinkButton>
  );
  return (
    <div className="re-col">
      <PageHeader title={t('new.title')} back={back} />
      <p className="re-banner" data-testid="new-template-banner">
        <span>{t('new.templateHint')}</span>
        <Button variant="secondary" className="sm" onClick={template.open} disabled={!service} data-testid="roadmap-create-template">
          {t('list.createTemplate')}
        </Button>
      </p>
      {service ? (
        <RoadmapFields
          roadmap={null}
          goals={goals}
          srLabel={t('new.srForm')}
          submitLabel={t('ed.create')}
          afterHint={t('new.afterCreate')}
          onSubmit={(input) => service.create(input)}
          onSaved={(roadmap) => {
            toast.show('roadmap:toast.created');
            void navigate(`/roadmaps/${roadmap.id}/edit`, { replace: true });
          }}
        />
      ) : null}
      {template.dialog}
    </div>
  );
}

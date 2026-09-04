import type { Host, RenewalPolicy } from '../types.js';
import { instantiateBlueprint, listBlueprints } from './blueprints.js';
import { emitNotification } from './notifications.js';
import { executePipeline } from './pipelines.js';

type PolicyExtras = RenewalPolicy & {
  autoEnrol?: boolean;
  hostTagSelector?: string[];
};

function tagsMatch(hostTags: string[], selector: string[]): boolean {
  const set = new Set(hostTags.map((t) => t.toLowerCase()));
  return selector.some((s) => set.has(s.toLowerCase()));
}

/**
 * When a host is created with tags that match an opt-in blueprint selector,
 * instantiate the blueprint and deploy. Approval is never skipped.
 */
export async function autoEnrolOnHostCreate(host: Host): Promise<void> {
  const hostname = (host.hostname || host.name || '').trim();
  if (!hostname) return;

  for (const blueprint of listBlueprints()) {
    const policy = blueprint.renewalPolicy as PolicyExtras;
    if (!policy.autoEnrol) continue;
    const selector = policy.hostTagSelector ?? [];
    if (!selector.length || !tagsMatch(host.tags ?? [], selector)) continue;

    try {
      const cert = await instantiateBlueprint(blueprint.id, {
        commonName: hostname,
        hostIds: [host.id],
        tags: host.tags,
      });
      if (blueprint.pipelineId) {
        await executePipeline({
          pipelineId: blueprint.pipelineId,
          certificateId: cert.id,
          hostId: host.id,
          params: { requiresApproval: blueprint.renewalPolicy.requiresApproval },
        });
      }
    } catch (err) {
      emitNotification('pipeline.step_failed', {
        hostId: host.id,
        blueprintId: blueprint.id,
        error: err instanceof Error ? err.message : String(err),
        after: 'auto-enrol',
      });
    }
  }
}

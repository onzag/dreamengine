import './text.js';
import './numeric.js';
import './model-sampler.js';
import './media.js';
import './unimplemented.js';

/**
 * Maps an AIHub expose `type` to the custom element tag that renders it.
 * Every expose type has an entry — unimplemented ones render nothing but still
 * exist so a component can be instantiated for them.
 *
 * @type {Record<string, string>}
 */
export const AIHUB_EXPOSE_TAGS = {
    AIHubExposeString: 'aihub-expose-string',
    AIHubExposeStringSelection: 'aihub-expose-string-selection',
    AIHubExposeInteger: 'aihub-expose-integer',
    AIHubExposeFloat: 'aihub-expose-float',
    AIHubExposeCfg: 'aihub-expose-cfg',
    AIHubExposeSteps: 'aihub-expose-steps',
    AIHubExposeBoolean: 'aihub-expose-boolean',
    AIHubExposeSeed: 'aihub-expose-seed',
    AIHubExposeSampler: 'aihub-expose-sampler',
    AIHubExposeScheduler: 'aihub-expose-scheduler',
    AIHubExposeExtendableScheduler: 'aihub-expose-extendable-scheduler',
    AIHubExposeImage: 'aihub-expose-image',
    AIHubExposeImageInfoOnly: 'aihub-expose-image-info-only',
    AIHubExposeImageBatch: 'aihub-expose-image-batch',
    AIHubExposeFrame: 'aihub-expose-frame',
    AIHubExposeModel: 'aihub-expose-model',
    AIHubExposeModelSimple: 'aihub-expose-model-simple',
    AIHubExposeVideo: 'aihub-expose-video',
    AIHubExposeAudio: 'aihub-expose-audio',
    AIHubExposeLatent: 'aihub-expose-latent',
    AIHubExposeProjectImage: 'aihub-expose-project-image',
    AIHubExposeProjectImageBatch: 'aihub-expose-project-image-batch',
    AIHubExposeProjectText: 'aihub-expose-project-text',
    AIHubExposeProjectVideo: 'aihub-expose-project-video',
    AIHubExposeProjectAudio: 'aihub-expose-project-audio',
    AIHubExposeProjectLatent: 'aihub-expose-project-latent',
    AIHubExposeProjectConfigInteger: 'aihub-expose-project-config-integer',
    AIHubExposeProjectConfigFloat: 'aihub-expose-project-config-float',
    AIHubExposeProjectConfigBoolean: 'aihub-expose-project-config-boolean',
    AIHubExposeProjectConfigString: 'aihub-expose-project-config-string',
};

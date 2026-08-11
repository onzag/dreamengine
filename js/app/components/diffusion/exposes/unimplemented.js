import { AIHubExposeBase } from './base.js';

/**
 * Base class for exposes that are not implemented in the UI. They still exist
 * as components (so the selector can instantiate one per expose) but render
 * nothing. {@link getValue} returns a best-guess value from the definition.
 */
class UnimplementedExposeBase extends AIHubExposeBase {
    render() {
        // Intentionally renders nothing — this expose has no UI.
        this.root.innerHTML = '';
    }
    getValue() {
        const d = this._expose?.data || {};
        if ('value' in d && d.value !== undefined) return d.value;
        if ('default' in d && d.default !== undefined) return d.default;
        if ('local_file' in d) return d.local_file || null;
        if ('local_files' in d) return d.local_files || null;
        return null;
    }
}

/** Unimplemented: project image. */
export class AIHubExposeProjectImageComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-image', AIHubExposeProjectImageComponent);

/** Unimplemented: project image batch. */
export class AIHubExposeProjectImageBatchComponent extends UnimplementedExposeBase {
    getValue() { return this._expose?.data?.local_files || []; }
}
customElements.define('aihub-expose-project-image-batch', AIHubExposeProjectImageBatchComponent);

/** Unimplemented: project text. */
export class AIHubExposeProjectTextComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-text', AIHubExposeProjectTextComponent);

/** Unimplemented: project video. */
export class AIHubExposeProjectVideoComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-video', AIHubExposeProjectVideoComponent);

/** Unimplemented: project audio. */
export class AIHubExposeProjectAudioComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-audio', AIHubExposeProjectAudioComponent);

/** Unimplemented: project latent. */
export class AIHubExposeProjectLatentComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-latent', AIHubExposeProjectLatentComponent);

/** Unimplemented: project config integer. */
export class AIHubExposeProjectConfigIntegerComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-config-integer', AIHubExposeProjectConfigIntegerComponent);

/** Unimplemented: project config float. */
export class AIHubExposeProjectConfigFloatComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-config-float', AIHubExposeProjectConfigFloatComponent);

/** Unimplemented: project config boolean. */
export class AIHubExposeProjectConfigBooleanComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-config-boolean', AIHubExposeProjectConfigBooleanComponent);

/** Unimplemented: project config string. */
export class AIHubExposeProjectConfigStringComponent extends UnimplementedExposeBase { }
customElements.define('aihub-expose-project-config-string', AIHubExposeProjectConfigStringComponent);

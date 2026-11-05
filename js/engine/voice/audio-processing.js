// Decode every source at the same rate before editing or joining samples.
export const AUDIO_SAMPLE_RATE = 44100;

/**
 * @typedef {{channels: Float32Array[], leadingSilence: number, trailingSilence: number}} AudioClip
 */

/** @param {Float32Array[]} channels */
function activity(channels) {
    const length = channels[0].length;
    const window = Math.round(AUDIO_SAMPLE_RATE * 0.005);
    const levels = [];
    let loudest = 0;
    for (let start = 0; start < length; start += window) {
        const end = Math.min(length, start + window);
        let energy = 0;
        for (const samples of channels) {
            for (let i = start; i < end; i++) energy += samples[i] * samples[i];
        }
        const rms = Math.sqrt(energy / ((end - start) * channels.length));
        levels.push(rms);
        loudest = Math.max(loudest, rms);
    }
    // A conservative, relative gate retains quiet breaths and whispered syllables.
    const threshold = Math.max(0.00001, Math.min(0.0005, loudest * 0.01));
    const first = levels.findIndex(level => level > threshold);
    let last = levels.length - 1;
    while (last >= first && levels[last] <= threshold) last--;
    let energy = 0;
    let count = 0;
    for (const level of levels) {
        // Exclude pauses from the level estimate so they don't cause a gain boost.
        if (level > Math.max(threshold, loudest * 0.1)) {
            energy += level * level;
            count++;
        }
    }
    return {
        start: first < 0 ? length : first * window,
        end: first < 0 ? 0 : Math.min(length, (last + 1) * window),
        rms: count ? Math.sqrt(energy / count) : 0,
    };
}

/** @param {Float32Array[]} channels @returns {AudioClip} */
export function audioClip(channels) {
    const bounds = activity(channels);
    return { channels, leadingSilence: bounds.start, trailingSilence: channels[0].length - bounds.end };
}

/** @param {Blob} blob @returns {Promise<AudioClip>} */
export async function decodeAudio(blob) {
    if (!blob.size) throw new Error('Cannot decode an empty audio asset.');
    const context = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE);
    let decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.numberOfChannels > 2) {
        const stereo = new OfflineAudioContext(2, decoded.length, AUDIO_SAMPLE_RATE);
        const source = stereo.createBufferSource();
        source.buffer = decoded;
        source.connect(stereo.destination);
        source.start();
        decoded = await stereo.startRendering();
    }
    return audioClip(Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i).slice()));
}

/**
 * Trim only outside the first/last audible windows, retaining a small safety
 * margin. Internal pauses and breaths remain intact. Level changes are bounded
 * to 6 dB, with peak headroom; asset volume is applied AFTER this adjustment.
 * @param {AudioClip} clip
 * @param {number} [volume]
 * @returns {AudioClip}
 */
export function prepareAudio(clip, volume = 1) {
    const bounds = activity(clip.channels);
    if (!bounds.rms) return audioClip(clip.channels.map(samples => samples.slice()));
    const margin = Math.round(AUDIO_SAMPLE_RATE * 0.015);
    const start = Math.max(0, bounds.start - margin);
    const end = Math.min(clip.channels[0].length, bounds.end + margin);
    const channels = clip.channels.map(samples => samples.slice(start, end));
    let peak = 0;
    for (const samples of channels) {
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    }
    const gain = Math.min(Math.max(0.5, Math.min(2, 0.1 / bounds.rms)), 0.89 / peak);
    const fade = Math.min(Math.round(AUDIO_SAMPLE_RATE * 0.005), Math.floor(channels[0].length / 2));
    for (const samples of channels) {
        for (let i = 0; i < samples.length; i++) {
            const envelope = fade > 1 ? Math.min(1, i / (fade - 1), (samples.length - 1 - i) / (fade - 1)) : 1;
            samples[i] *= gain * envelope;
        }
    }
    const prepared = audioClip(channels);
    // Keep the scheduled boundaries even for a muted asset: its duration and
    // pre/post gaps must not collapse just because volume is zero.
    if (volume !== 1) {
        for (const samples of channels) {
            for (let i = 0; i < samples.length; i++) samples[i] *= volume;
        }
    }
    return prepared;
}

/**
 * Numbers are requested silence durations in milliseconds. Existing boundary
 * silence counts toward a gap, so model padding doesn't double a manual pause.
 * Clips are never overlapped: this keeps consonants and sound onsets intact.
 * @param {Array<AudioClip | number>} parts
 * @returns {AudioClip}
 */
export function joinAudio(parts) {
    let length = 0;
    let pendingSilence = 0;
    let trailingSilence = 0;
    let channelCount = 1;
    /** @type {Array<{clip: AudioClip, offset: number}>} */
    const placements = [];
    for (const part of parts) {
        if (typeof part === 'number') {
            pendingSilence += Math.round(part * AUDIO_SAMPLE_RATE / 1000);
            continue;
        }
        const addedSilence = Math.max(0, pendingSilence - trailingSilence - part.leadingSilence);
        length += addedSilence;
        placements.push({ clip: part, offset: length });
        const frames = part.channels[0].length;
        length += frames;
        trailingSilence = part.trailingSilence === frames ? trailingSilence + addedSilence + frames : part.trailingSilence;
        pendingSilence = 0;
        channelCount = Math.max(channelCount, part.channels.length);
    }
    length += Math.max(0, pendingSilence - trailingSilence);
    // Even an empty sequence produces a decodable WAV.
    const channels = Array.from({ length: channelCount }, () => new Float32Array(Math.max(1, length)));
    for (const { clip, offset } of placements) {
        for (let channel = 0; channel < channelCount; channel++) {
            channels[channel].set(clip.channels[clip.channels.length === 1 ? 0 : channel], offset);
        }
    }
    let first = channels[0].length;
    let last = 0;
    for (const { clip, offset } of placements) {
        if (clip.leadingSilence < clip.channels[0].length) {
            first = Math.min(first, offset + clip.leadingSilence);
            last = Math.max(last, offset + clip.channels[0].length - clip.trailingSilence);
        }
    }
    return { channels, leadingSilence: first, trailingSilence: channels[0].length - last };
}

/** @param {Float32Array[]} channels @param {number} [sampleRate] @returns {Blob} */
export function encodeWav(channels, sampleRate = AUDIO_SAMPLE_RATE) {
    const frames = channels[0].length;
    const dataSize = frames * channels.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    /** @param {number} offset @param {string} text */
    const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels.length, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels.length * 2, true);
    view.setUint16(32, channels.length * 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataSize, true);
    for (let channel = 0; channel < channels.length; channel++) {
        for (let frame = 0; frame < frames; frame++) {
            const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
            view.setInt16(44 + (frame * channels.length + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        }
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

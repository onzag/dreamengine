import { BaseDiffusionAdapter } from "./base.js";

/**
 * @typedef {Object} AIHubLora
 * @property {string} id
 * @property {string} name
 * @property {string} file
 * @property {string} context
 * @property {string} description
 * @property {number|null} default_strength
 * @property {string|null} limit_to_family
 * @property {string|null} limit_to_model
 * @property {string|null} limit_to_group
 * @property {boolean} use_loader_model_only
 */

/**
 * @typedef {Object} AIHubModel
 * @property {string} id
 * @property {string} name
 * @property {string} file
 * @property {string} vae_file
 * @property {string} context
 * @property {string} description
 * @property {string|null} clip_file
 * @property {string|null} clip_type
 * @property {number|null} default_cfg
 * @property {string|null} default_sampler
 * @property {string|null} default_scheduler
 * @property {number|null} default_steps
 * @property {string} diffusion_model_weight_dtype
 * @property {string} family
 * @property {string} group
 * @property {boolean} is_diffusion_model
 */

/**
 * @typedef {Object} AIHubCondition
 * @property {string} condition
 * @property {string} error
 */

/**
 * Renders as a simple text field input
 * 
 * @typedef {Object} AIHubExposeString
 * @property {"AIHubExposeString"} type
 * @property {{
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   id: string,
 *   index: number, // represents the order of the expose to another exposes, used for sorting
 *   label: string, // the label of the expose to be displayed in the UI
 *   maxlen: number,
 *   maxlen_expose_id: string, // if set the maxlen is determined by the value of another expose
 *   maxlen_expose_offset: number, // if set with the expose id the maxlen value is offset by this amount
 *   minlen: number,
 *   minlen_expose_id: string, // if set the minlen is determined by the value of another expose
 *   minlen_expose_offset: number, // if set with the expose id the minlen value is offset by this amount
 *   multiline: boolean, // whether to use a textarea instead of an input
 *   tooltip: string, // a tooltip, aka title
 *   value: string, // default value to be used if no other set
 * }} data
 */

/**
 * Renders as a dropdown select of strings
 * 
 * @typedef {Object} AIHubExposeStringSelection
 * @property {"AIHubExposeStringSelection"} type
 * @property {{
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   id: string,
 *   index: number, // represents the order of the expose to another exposes, used for sorting
 *   label: string, // the label of the expose to be displayed in the UI
 *   options: string, // newline separated list of options
 *   options_label: string, // newline separated list of option labels, must be the same number of lines as options
 *   tooltip: string, // a tooltip, aka title
 *   value: string, // default value to be used if no other set
 * }} data
 */

/**
 * Renders as a number input with stepper buttons, min and max values
 * 
 * @typedef {Object} AIHubExposeInteger
 * @property {"AIHubExposeInteger"} type
 * @property {{
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   id: string,
 *   index: number, // represents the order of the expose to another exposes, used for sorting
 *   label: string,
 *   max: number,
 *   max_expose_id: string, // if set the max is determined by the value of another expose
 *   max_expose_offset: number, // if set with the expose id the max value is offset by this amount
 *   min: number,
 *   min_expose_id: string, // if set the min is determined by the value of another expose
 *   min_expose_offset: number, // if set with the expose id the min value is offset by this amount
 *   step: number,
 *   tooltip: string,
 *   value: number,
 * }} data
 */

/**
 * Renders as a number input with stepper buttons, min and max values, and optionally a slider
 * 
 * @typedef {Object} AIHubExposeFloat
 * @property {"AIHubExposeFloat"} type
 * @property {{
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   id: string,
 *   index: number, // represents the order of the expose to another exposes, used for sorting
 *   label: string,
 *   max: number,
 *   max_expose_id: string, // if set the max is determined by the value of another expose
 *   max_expose_offset: number, // if set with the expose id the max value is offset by this amount
 *   min: number,
 *   min_expose_id: string, // if set the min is determined by the value of another expose
 *   min_expose_offset: number, // if set with the expose id the min value is offset by this amount
 *   step: number,
 *   tooltip: string,
 *   value: number,
 *   slider: boolean,
 * }} data
 */

/**
 * Renders basically the same way as AIHubExposeFloat not allowing values less than 0 and with only 2 decimal places
 * the difference is that when a model is selected by a AIHubExposeModel the default cfg of this model is used as the value of this expose
 * but of course it can be changed
 * 
 * @typedef {Object} AIHubExposeCfg
 * @property {"AIHubExposeCfg"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: number,
 *   advanced: boolean,
 *   index: number,
 *   unaffected_by_model_cfg: boolean,
 * }} data
 */

/**
 * Renders basically the same as a AIHubExposeInteger but when a model is selected by a AIHubExposeModel the default steps of this model is used as the value of this expose
 * but of course it can be changed
 * 
 * @typedef {Object} AIHubExposeSteps
 * @property {"AIHubExposeSteps"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: number,
 *   advanced: boolean,
 *   index: number,
 *   unaffected_by_model_steps: boolean,
 * }} data
 */

/**
 * Renders as a checkbox input
 * 
 * @typedef {Object} AIHubExposeBoolean
 * @property {"AIHubExposeBoolean"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: boolean,
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   index: number,
 * }} data
 */

/**
 * Renders differently from anything, basically two inputs, first a select that allows to set if the seed is random or fixed, if random a random integer
 * will be passed on the request, if fixed a number input will be shown to set the seed value
 * 
 * @typedef {Object} AIHubExposeSeed
 * @property {"AIHubExposeSeed"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: number,
 *   advanced: boolean,
 *   index: number,
 * }} data
 */

/**
 * Renders basically the same as a dropdown select of strings using the samplers available in the info list as the potential options, when a model is selected by a AIHubExposeModel the default sampler of this model is used as the value of this expose
 * but of course it can be changed
 * 
 * @typedef {Object} AIHubExposeSampler
 * @property {"AIHubExposeSampler"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: string,
 *   advanced: boolean,
 *   index: number,
 *   unaffected_by_model_sampler: boolean,
 * }} data
 */

/**
 * Renders basically the same as a dropdown select of strings using the schedulers available in the info list as the potential options, when a model is selected by a AIHubExposeModel the default scheduler of this model is used as the value of this expose
 * but of course it can be changed
 * 
 * @typedef {Object} AIHubExposeScheduler
 * @property {"AIHubExposeScheduler"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: string,
 *   advanced: boolean,
 *   index: number,
 *   unaffected_by_model_scheduler: boolean,
 * }} data
 */

/**
 * It is basically the same as AIHubExposeScheduler but it allows to remove and add extra schedulers to the default list of schedulers, the extra schedulers are added to the list of schedulers and the blacklisted ones are removed from the list of schedulers
 * and of course others can be selected
 * 
 * @typedef {Object} AIHubExposeExtendableScheduler
 * @property {"AIHubExposeExtendableScheduler"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   value: string,
 *   advanced: boolean,
 *   index: number,
 *   unaffected_by_model_scheduler: boolean,
 *   blacklist: string, // newline separated list of schedulers to exclude
 *   blacklist_all: boolean,
 *   extras: string, // newline separated list of extra schedulers to add
 * }} data
 */

/**
 * The main part of the expose, allows to expose an image to the workflow, it should render depending on what was chosen, a miniature of sorts showing what will be passed to the workflow
 * because we are in dreamengine we are not fully implementing this completely as all layers are the same as the image size (unlike a fully fledged image editor)
 * therefore
 * 
 * current_layer (only the current layer is selected, transparency and all, without any other layer, the current layer is the one that is selected in the layers panel)
 * current_layer_at_image_intersection (will be equivalent as current_layer because all layers are the same size as the image)
 * merged_image (all layers merged together without the hidden ones, transparency and all)
 * merged_image_without_current_layer (all layers merged together without the hidden ones, transparency and all, without the current layer)
 * merged_image_current_layer_intersection (will be equivalent as merged_image because all layers are the same size as the image)
 * merged_image_current_layer_intersection_without_current_layer (will be equivalent as merged_image_without_current_layer because all layers are the same size as the image)
 * upload (allows to upload a custom image to be used, by default it will be the same as merged_image, but the user can upload a custom image to be used instead, it is also possible to take a snapshot of the current merged image as it is)
 * 
 * When keeping these values, they should be kept as temporary blobs
 * 
 * @typedef {Object} AIHubExposeImage
 * @property {"AIHubExposeImage"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   type: "current_layer" | "current_layer_at_image_intersection" | "merged_image" | "merged_image_without_current_layer" | "merged_image_current_layer_intersection" | "merged_image_current_layer_intersection_without_current_layer" | "upload",
 *   index: number,
 *   optional: boolean,
 *   pos_x: number, // hidden — X position of the layer in the canvas
 *   pos_y: number, // hidden — Y position of the layer in the canvas
 *   layer_id: string, // hidden — ID of the layer
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Will behave exactly the same as AIHubExposeImage in practice from an UI perspective
 * 
 * @typedef {Object} AIHubExposeImageInfoOnly
 * @property {"AIHubExposeImageInfoOnly"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   type: "current_layer" | "current_layer_at_image_intersection" | "merged_image" | "merged_image_without_current_layer" | "merged_image_current_layer_intersection" | "merged_image_current_layer_intersection_without_current_layer" | "upload",
 *   index: number,
 *   optional: boolean,
 *   pos_x: number, // hidden — X position of the layer in the canvas
 *   pos_y: number, // hidden — Y position of the layer in the canvas
 *   layer_id: string, // hidden — layer id
 *   value_width: number, // hidden — width of the image
 *   value_height: number, // hidden — height of the image
 * }} data
 */

/**
 * Represents a list of images to upload
 * 
 * all_frames (represents all frames of a video, but this will be unimplemented and treated as upload, as we are not working with videos in this project)
 * all_layers_at_image_size (represents all layers, separate)
 * upload (represents a list of images to upload, the user can select multiple images to upload, using the same idea as upload single images in AIHubExposeImage, the images can be sorted and changed the order)
 * 
 * @typedef {Object} AIHubExposeImageBatch
 * @property {"AIHubExposeImageBatch"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   type: "all_frames" | "all_layers_at_image_size" | "upload",
 *   minlen: number,
 *   maxlen: number,
 *   index: number,
 *   metadata_fields: string, // newline separated field definitions
 *   metadata_fields_label: string, // newline separated labels for metadata fields
 *   local_files: string, // hidden — JSON array of file paths
 *   metadata: string, // hidden — JSON array of metadata objects
 * }} data
 */

/**
 * Will be treated as AIHubExposeImage upload, as this is video related
 * 
 * @typedef {Object} AIHubExposeFrame
 * @property {"AIHubExposeFrame"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   frame_index_type: "relative_to_current" | "absolute",
 *   frame_index: number,
 *   index: number,
 *   optional: boolean,
 *   frame: number, // hidden — actual frame number in the video
 *   total_frames: number, // hidden — total number of frames in the video
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectImage
 * @property {"AIHubExposeProjectImage"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectImageBatch
 * @property {"AIHubExposeProjectImageBatch"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   indexes: string, // comma separated or range e.g. "0,1,2" or "0-4"
 *   local_files: string, // hidden — JSON array of file paths
 * }} data
 */

/**
 * Will show a dropdown of models to select from based on the list of models that is available in the info list
 * 
 * @typedef {Object} AIHubExposeModel
 * @property {"AIHubExposeModel"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   model: string, // the model filename, will be used to select the model in the request
 *   loras: string, // comma separated list of lora filenames
 *   loras_strengths: string, // comma separated list of lora strengths
 *   loras_use_loader_model_only: string, // comma separated list of "t"/"f"
 *   is_diffusion_model: boolean,
 *   diffusion_model_weight_dtype: "default" | "fp8_e4m3fn" | "fp8_e4m3fn_fast" | "fp8_e5m2",
 *   limit_to_family: string, // only models in this family will be shown, if empty all families will be shown
 *   limit_to_group: string, // only models in this group will be shown, if empty all groups will be shown
 *   advanced: boolean, // if set the expose is only shown in a extra "show advanced" section of the UI
 *   index: number, // represents the order of the expose to another exposes, used for sorting
 *   disable_loras_selection: boolean, // if set the loras selection will be disabled and the loras of the model will be used, if not set the user can select loras to use
 *   disable_model_selection: boolean, // if set the model selection will be disabled and the model of the expose will be used, if not set the user can select a model to use
 *   optional_vae: string, // hidden — the vae filename to use, if empty the default vae will be used
 *   optional_clip: string, // hidden — the clip filename to use, if empty the default clip will be used
 *   optional_clip_type: string, // hidden — the clip type to use, if empty the default clip type will be used
 *   optional_lora_prepend: string, // hidden — comma separated list of lora filenames to prepend to the loras of the model, if empty no loras will be prepended
 *   optional_lora_prepend_strengths: string, // hidden — comma separated list of lora strengths to prepend to the loras of the model, if empty no loras will be prepended
 *   optional_lora_prepend_use_loader_model_only: string, // hidden — comma separated list of "t"/"f" to prepend to the loras of the model, if empty no loras will be prepended
 * }} data
 */

/**
 * Works the exact same as AIHubExposeModel this one simply has less fields and data
 * 
 * @typedef {Object} AIHubExposeModelSimple
 * @property {"AIHubExposeModelSimple"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   limit_to_family: string,
 *   limit_to_group: string,
 *   advanced: boolean,
 *   index: number,
 *   disable_loras_selection: boolean,
 *   model: string, // hidden
 *   loras: string, // hidden — comma separated list of lora filenames
 *   loras_strengths: string, // hidden — comma separated list of lora strengths
 *   loras_use_loader_model_only: string, // hidden — comma separated list of "t"/"f"
 *   is_diffusion_model: boolean, // hidden
 *   diffusion_model_weight_dtype: "default" | "fp8_e4m3fn" | "fp8_e4m3fn_fast" | "fp8_e5m2", // hidden
 *   optional_vae: string, // hidden
 *   optional_clip: string, // hidden
 *   optional_clip_type: string, // hidden
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectText
 * @property {"AIHubExposeProjectText"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   batch_index: string,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Will be treated as a file upload
 * 
 * @typedef {Object} AIHubExposeVideo
 * @property {"AIHubExposeVideo"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   type: "current_segment" | "merged_video" | "upload",
 *   index: number,
 *   do_not_process: boolean,
 *   optional: boolean,
 *   segment_id: string, // hidden — segment id of the video layer
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectVideo
 * @property {"AIHubExposeProjectVideo"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   batch_index: string,
 *   do_not_process: boolean,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Will be treated as a file upload
 * 
 * @typedef {Object} AIHubExposeAudio
 * @property {"AIHubExposeAudio"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   type: "current_segment" | "merged_audio" | "upload",
 *   index: number,
 *   do_not_process: boolean,
 *   optional: boolean,
 *   segment_id: string, // hidden — segment id of the audio layer
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectAudio
 * @property {"AIHubExposeProjectAudio"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   batch_index: string,
 *   do_not_process: boolean,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Will be treated as a file upload
 * 
 * @typedef {Object} AIHubExposeLatent
 * @property {"AIHubExposeLatent"} type
 * @property {{
 *   id: string,
 *   label: string,
 *   tooltip: string,
 *   index: number,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectLatent
 * @property {"AIHubExposeProjectLatent"} type
 * @property {{
 *   id: string,
 *   file_name: string,
 *   batch_index: string,
 *   optional: boolean,
 *   local_file: string, // hidden — local file path
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectConfigInteger
 * @property {"AIHubExposeProjectConfigInteger"} type
 * @property {{
 *   id: string,
 *   field: string,
 *   default: number,
 *   value: number, // hidden — the value of the field
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectConfigFloat
 * @property {"AIHubExposeProjectConfigFloat"} type
 * @property {{
 *   id: string,
 *   field: string,
 *   default: number,
 *   value: number, // hidden — the value of the field
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectConfigBoolean
 * @property {"AIHubExposeProjectConfigBoolean"} type
 * @property {{
 *   id: string,
 *   field: string,
 *   default: boolean,
 *   value: boolean, // hidden — the value of the field
 * }} data
 */

/**
 * Unimplemented, will not render anything in UI
 * 
 * @typedef {Object} AIHubExposeProjectConfigString
 * @property {"AIHubExposeProjectConfigString"} type
 * @property {{
 *   id: string,
 *   field: string,
 *   default: string,
 *   value: string, // hidden — the value of the field
 * }} data
 */

/**
 * @typedef {AIHubExposeString | AIHubExposeStringSelection | AIHubExposeInteger | AIHubExposeFloat | AIHubExposeCfg | AIHubExposeSteps | AIHubExposeBoolean | AIHubExposeSeed | AIHubExposeSampler | AIHubExposeScheduler | AIHubExposeExtendableScheduler | AIHubExposeImage | AIHubExposeImageInfoOnly | AIHubExposeImageBatch | AIHubExposeFrame | AIHubExposeProjectImage | AIHubExposeProjectImageBatch | AIHubExposeModel | AIHubExposeModelSimple | AIHubExposeProjectText | AIHubExposeVideo | AIHubExposeProjectVideo | AIHubExposeAudio | AIHubExposeProjectAudio | AIHubExposeLatent | AIHubExposeProjectLatent | AIHubExposeProjectConfigInteger | AIHubExposeProjectConfigFloat | AIHubExposeProjectConfigBoolean | AIHubExposeProjectConfigString} AIHubExpose
 */

/**
 * @typedef {Object} AIHubWorkflow
 * @property {string} category
 * @property {AIHubCondition[]} conditions
 * @property {string} context
 * @property {string} description
 * @property {string} id
 * @property {string} label
 * @property {string} project_type
 * @property {boolean} project_type_init
 * @property {Record<string, AIHubExpose>} expose
 */

/**
 * @typedef {Object} AiHubInfoList
 * @property {string[]} schedulers
 * @property {string[]} samplers
 * @property {string} type
 * @property {AIHubLora[]} loras
 * @property {AIHubModel[]} models
 * @property {Record<string, AIHubWorkflow>} workflows
 */

export class DiffusionAdapterAIHub extends BaseDiffusionAdapter {
    /**
     * @param {{
     *    host?: string;
     *    apiKey?: string;
     * }} options
     */
    constructor(options) {
        super();
        this.options = options;

        this.onData = this.onData.bind(this);

        this.realHost = (this.options.host || 'ws://127.0.0.1:8111');
        if (!this.realHost.endsWith('/')) {
            this.realHost += '/';
        }

        this.httpHost = this.realHost.replace(/^ws/, 'http');

        /**
         * @type {Array<(data: AiHubInfoList) => void>}
         */
        this.infoListCallbacks = [];
    }

    /**
     * @param {*} data 
     */
    onInfoList(data) {
        // bug because base57 scheduler may lag in loading and not be included in the list of schedulers, so we add it manually if it's not there
        if (data.schedulers && Array.isArray(data.schedulers) && !data.schedulers.includes("beta57")) {
            data.schedulers.push("beta57");
        }
        console.log("DiffusionAdapterAIHub: Received INFO_LIST from server", data);
        this.infoList = data;
        this.infoListCallbacks.forEach(callback => callback(data));
    }

    /**
     * @param {(data: AiHubInfoList) => void} callback
     */
    addListenerOnInfoList(callback) {
        if (!this.infoList) {
            this.infoListCallbacks.push(callback);
        } else {
            callback(this.infoList);
        }
    }

    /**
     * @param {(data: AiHubInfoList) => void} callback
     */
    removeListenerOnInfoList(callback) {
        this.infoListCallbacks = this.infoListCallbacks.filter(cb => cb !== callback);
    }

    /**
     * 
     * @param {MessageEvent<any>} event 
     */
    onData(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "INFO_LIST") {
                this.onInfoList(data);
            }
        } catch (err) {
            console.error("Error parsing data from diffusion server:", err);
        }
    }

    async initialize() {
        console.log("DiffusionAdapterAIHub: Initializing connection to server at " + (this.options.host || 'ws://127.0.0.1:8111'));

        // set a websocket to the local server
        const queryParams = "?apiKey=" + encodeURIComponent(this.options.apiKey || "");
        this.socket = new WebSocket(this.realHost + "ws" + queryParams);
        this.socket.addEventListener("message", this.onData);

        /**
         * @returns {Promise<void>}
         */
        return new Promise((resolve, reject) => {
            // @ts-ignore bugged out ts definition
            this.resolveInitializePromise = () => {
                this.connected = true;
                console.log("DiffusionAdapterAIHub: Connection to local server established.");
                this.resolveInitializePromise = null;
                this.rejectInitializePromise = null;
                this.reason = null;
                this.triggerOnConnectionStatusChange(true);

                // @ts-ignore
                resolve();
            };
            this.rejectInitializePromise = reject;

            let lastClosureReason = "";

            // @ts-ignore
            this.socket.onopen = () => {
                if (this.resolveInitializePromise) {
                    this.resolveInitializePromise();
                }
            };

            // @ts-ignore
            this.socket.onerror = (event) => {
                if (this.rejectInitializePromise) {
                    const err = new Error("WebSocket error: failed to connect to " + (this.options.host || 'ws://127.0.0.1:8111'));
                    this.rejectInitializePromise(err);
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                    this.reason = err.message;
                    this.triggerOnConnectionStatusChange(false, err.message);
                    this.connected = false;
                    this.socket = null;
                }
            };

            // @ts-ignore
            this.socket.onclose = (event) => {
                // See https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1
                if (event.code == 1000)
                    lastClosureReason = "Normal closure, meaning that the purpose for which the connection was established has been fulfilled.";
                else if (event.code == 1001)
                    lastClosureReason = "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.";
                else if (event.code == 1002)
                    lastClosureReason = "An endpoint is terminating the connection due to a protocol error";
                else if (event.code == 1003)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).";
                else if (event.code == 1004)
                    lastClosureReason = "Reserved. The specific meaning might be defined in the future.";
                else if (event.code == 1005)
                    lastClosureReason = "No status code was actually present.";
                else if (event.code == 1006)
                    lastClosureReason = "The connection was closed abnormally";
                else if (event.code == 1007)
                    lastClosureReason = "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [https://www.rfc-editor.org/rfc/rfc3629] data within a text message).";
                else if (event.code == 1008)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.";
                else if (event.code == 1009)
                    lastClosureReason = "An endpoint is terminating the connection because it has received a message that is too big for it to process.";
                else if (event.code == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
                    lastClosureReason = "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: " + event.reason;
                else if (event.code == 1011)
                    lastClosureReason = "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.";
                else if (event.code == 1015)
                    lastClosureReason = "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).";
                else
                    lastClosureReason = "Unknown reason";

                console.log("DiffusionAdapterAIHub: WebSocket error during initialization", lastClosureReason);
                if (this.rejectInitializePromise) {
                    // @ts-ignore
                    this.rejectInitializePromise(new Error(lastClosureReason));
                    this.resolveInitializePromise = null;
                    this.rejectInitializePromise = null;
                    this.reason = lastClosureReason;
                    this.triggerOnConnectionStatusChange(false, lastClosureReason);
                    this.connected = false;
                    this.socket = null;
                }
            };
        });
    }

    async ensureInitialized() {
        if (this.connected) {
            return;
        }

        if (this.socket) {
            return new Promise((resolve, reject) => {
                // @ts-ignore
                this.onConnectionStatusChangePromises.push([resolve, (err) => reject(new Error(err))]);
            });
        }

        await this.initialize();
    }
}
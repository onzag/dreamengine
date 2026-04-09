class WorldImage extends HTMLElement {
    constructor() {
        super();
        /**
         * @type {ShadowRoot}
         */
        this.root = this.attachShadow({ mode: 'open' });

        this.currentObjectUrl = null;
        this.currentFileObject = null;
    }

    connectedCallback() {
        this.render();

        // @ts-expect-error
        this.root.querySelector('.world-image').addEventListener('error', () => {
            // @ts-expect-error
            this.root.querySelector('.world-image').src = './images/default-world.png';
        });

        if (this.hasAttribute('editable')) {
            const fileInput = this.root.querySelector('input[type="file"]');
            const editOverlay = this.root.querySelector('.edit-overlay');

            // @ts-expect-error
            editOverlay.addEventListener('click', () => {
                // @ts-expect-error
                fileInput.click();
            });

            // @ts-expect-error
            fileInput.addEventListener('change', async (event) => {
                // @ts-expect-error
                const file = event.target.files[0];
                if (file) {
                    const urlBlob = URL.createObjectURL(file);
                    if (this.currentObjectUrl) {
                        URL.revokeObjectURL(this.currentObjectUrl);
                    }
                    this.currentObjectUrl = urlBlob;
                    this.currentFileObject = file;
                    // @ts-expect-error
                    this.root.querySelector('.world-image').src = urlBlob;
                }
            });
        }
    }

    hasBeenModified() {
        return this.currentObjectUrl !== null;
    }

    // on dismount revoke any created object URLs to free memory
    disconnectedCallback() {
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
        }
    }

    async saveValueToUserData() {
        if (!this.hasBeenModified()) {
            return;
        }
        const imageUrl = this.getAttribute('image-url') || '';
        await window.API.uploadFileToDEPath(imageUrl, this.currentFileObject);
    }

    render() {
        const imageUrl = this.getAttribute('image-url') || '';
        const isEditable = this.hasAttribute('editable');
        this.root.innerHTML = `
            <style>
                .world-image {
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    object-fit: cover;
                    display: block;
                    box-sizing: border-box;
                    border: solid 1px black;
                }
                .world-image-container {
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    border-radius: 10%;
                    border: 1vh solid white;
                    box-shadow: 0 0 1vh rgba(0, 0, 0, 0.5);
                    box-sizing: border-box;
                    background-color: transparent;
                    cursor: "pointer";
                    position: relative;
                }
                .edit-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 10%;
                    opacity: 0;
                    background-color: rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(2px) saturate(150%);
                }
                .edit-overlay:hover {
                    opacity: 1;
                    transition: background-color 0.3s, opacity 0.3s;
                    cursor: pointer;
                }
                .edit-overlay-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 50%;
                    height: 50%;
                    text-align: center;
                    font-size: 3vw;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
            </style>
            <div class="world-image-container" part="world-image-container">
                <img
                    class="world-image"
                    part="world-image"
                    src="${window.DREAMENGINE_HOME + "/" + imageUrl}" />
                ${isEditable ? `<div class="edit-overlay"><svg class="edit-overlay-icon" width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#fff" d="M441 58.9L453.1 71c9.4 9.4 9.4 24.6 0 33.9L424 134.1 377.9 88 407 58.9c9.4-9.4 24.6-9.4 33.9 0zM209.8 256.2L344 121.9 390.1 168 255.8 302.2c-2.9 2.9-6.5 5-10.4 6.1l-58.5 16.7 16.7-58.5c1.1-3.9 3.2-7.5 6.1-10.4zM373.1 25L175.8 222.2c-8.7 8.7-15 19.4-18.3 31.1l-28.6 100c-2.4 8.4-.1 17.4 6.1 23.6s15.2 8.5 23.6 6.1l100-28.6c11.8-3.4 22.5-9.7 31.1-18.3L487 138.9c28.1-28.1 28.1-73.7 0-101.8L474.9 25C446.8-3.1 401.2-3.1 373.1 25zM88 64C39.4 64 0 103.4 0 152L0 424c0 48.6 39.4 88 88 88l272 0c48.6 0 88-39.4 88-88l0-112c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 112c0 22.1-17.9 40-40 40L88 464c-22.1 0-40-17.9-40-40l0-272c0-22.1 17.9-40 40-40l112 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L88 64z"/>
                    </svg></div>` : ''}
            </div>
            <input type="file" accept="image/*" style="display:none;" />
        `;
    }
}

customElements.define('app-world-image', WorldImage);
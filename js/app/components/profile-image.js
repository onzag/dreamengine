class ProfileImage extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const imageUrl = this.getAttribute('image-url') || '';
        this.shadowRoot.innerHTML = `
            <style>
                .profile-image {
                    width: 100px;
                    height: 100px;
                    border-radius: 10%;
                    object-fit: cover;
                    display: block;
                }
            </style>
            <div class="profile-image-container">
                <img class="profile-image" src="${imageUrl}" />
            </div>
        `;
    }
}

customElements.define('app-profile-image', ProfileImage);
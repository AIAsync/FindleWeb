document.addEventListener('DOMContentLoaded', () => {
    const searchPlusBtn = document.getElementById('search-plus-btn');
    const searchDropdown = document.getElementById('search-dropdown');
    if (searchPlusBtn && searchDropdown) {
        searchPlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchDropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!searchDropdown.contains(e.target) && !searchPlusBtn.contains(e.target)) {
                searchDropdown.classList.remove('show');
            }
        });
        const options = searchDropdown.querySelectorAll('.dropdown-option');
        const searchTagsContainer = document.getElementById('search-tags');
        const fileInput = document.getElementById('attach-file-input');

        // Function to create a tag
        const createTag = (text, id) => {
            const tag = document.createElement('div');
            tag.className = 'search-tag';
            tag.dataset.id = id;
            tag.innerHTML = `
                <span>${text}</span>
                <i class="fa-solid fa-xmark"></i>
             `;

            // Function to remove tag and reset state
            const removeTag = (e) => {
                e.stopPropagation();
                tag.remove();

                // Unselect the corresponding option in dropdown
                const option = document.getElementById(id);
                if (option) option.classList.remove('active');

                // Clear file input if it was the attach-file tag
                if (id === 'btn-attach-file' && fileInput) {
                    fileInput.value = '';
                }
            };

            // Remove tag on click of the tag itself or the X
            tag.addEventListener('click', removeTag);
            return tag;
        };

        // Handle file selection
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (fileInput.files && fileInput.files[0]) {
                    const fileName = fileInput.files[0].name;
                    const id = 'btn-attach-file';
                    const option = document.getElementById(id);

                    // Remove existing file tag if any
                    let existingTag = searchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                    if (existingTag) existingTag.remove();

                    const tag = createTag(`${window.t('file_prefix', 'File')}: ${fileName}`, id);
                    searchTagsContainer.appendChild(tag);

                    if (option) option.classList.add('active');
                }
            });
        }

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent closing dropdown immediately

                const id = option.id;

                // Special handling for Attach file
                if (id === 'btn-attach-file') {
                    // If already active, remove it (toggle off)
                    let existingTag = null;
                    if (searchTagsContainer) {
                        existingTag = searchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                    }

                    if (existingTag) {
                        existingTag.remove();
                        option.classList.remove('active');
                        if (fileInput) fileInput.value = '';
                    } else {
                        // Open file dialog
                        if (fileInput) fileInput.click();
                    }
                    return;
                }

                const text = option.querySelector('span').innerText;

                // Check if tag exists
                let existingTag = null;
                if (searchTagsContainer) {
                    existingTag = searchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                }

                if (existingTag) {
                    // Remove tag if already active
                    existingTag.remove();
                    option.classList.remove('active');
                } else if (searchTagsContainer) {
                    // Add new tag
                    const tag = createTag(text, id);
                    searchTagsContainer.appendChild(tag);
                    option.classList.add('active');
                }

                // Optional: Focus back to input? 
                // searchInput.focus();
                // Close dropdown after selection
                searchDropdown.classList.remove('show');
            });
        });
    }
    const searchInput = document.querySelector('.topbar-search-input');
    if (searchInput) {
        const autoResize = function () {
            this.style.height = 'auto';
            const newHeight = this.scrollHeight;
            this.style.height = newHeight + 'px';

            // max-height is approx 140px (5 lines)
            if (newHeight > 140) {
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        };

        searchInput.addEventListener('input', autoResize);
        searchInput.addEventListener('focus', autoResize);
        searchInput.addEventListener('blur', function () {
            this.style.height = '48px';
        });
    }
});

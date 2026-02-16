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
        options.forEach(option => {
            option.addEventListener('click', () => {
                const text = option.querySelector('span').innerText;
                console.log(`Selected option: ${text}`);
                searchDropdown.classList.remove('show');
            });
        });
    }
    const searchInput = document.querySelector('.topbar-search-input');
    if (searchInput) {
        const autoResize = function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        };

        searchInput.addEventListener('input', autoResize);
        searchInput.addEventListener('focus', autoResize);
        searchInput.addEventListener('blur', function () {
            this.style.height = '48px';
        });
    }
});

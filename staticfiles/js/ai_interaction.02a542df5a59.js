document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const conversationIdInput = document.getElementById('conversation-id');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const editBtn = document.getElementById('edit-btn');

    let currentEditingMessageId = null;

    if (historySearch) {
        historySearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = historyList.getElementsByTagName('li');

            Array.from(items).forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }


    // --- 2. Desktop Sidebar Toggle (Moved inside sidebar) ---
    const sidebarToggleBtn = document.querySelector('.menu-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
                updateSidebarIcons();
            }
        });
    }

    function updateSidebarIcons() {
        const sidebar = document.getElementById('sidebar');
        // Desktop Icon
        if (sidebarToggleBtn) {
            const toggleIcon = sidebarToggleBtn.querySelector('i');
            if (toggleIcon) {
                if (sidebar.classList.contains('collapsed')) {
                    toggleIcon.className = 'fa-solid fa-bars';
                } else {
                    toggleIcon.className = 'fa-solid fa-xmark';
                }
            }
        }
        // Mobile Icon
        if (mobileMenuBtn) {
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                if (sidebar.classList.contains('open')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-xmark');
                } else {
                    icon.classList.remove('fa-xmark');
                    icon.classList.add('fa-bars');
                }
                console.log('Mobile icon classes:', icon.className);
            }
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    scrollToBottom();

    // --- 3. Sidebar Search ---
    const searchWrapper = document.querySelector('.search-box'); // Use wrapper for click detection
    const searchInput = document.getElementById('history-search');

    if (searchWrapper) {
        searchWrapper.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            // If collapsed and clicked icon (or wrapper), expand
            // But don't toggle if clicking input itself (already expanded)
            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                setTimeout(() => searchInput.focus(), 100); // Focus after expansion
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = historyList.getElementsByTagName('li');
            Array.from(items).forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(term) || !term ? 'block' : 'none';
            });
        });
    }

    // --- 4. Profile Toggle ---
    const profileToggle = document.getElementById('profile-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
            const icon = profileToggle.querySelector('.toggle-icon');
            if (icon) {
                icon.style.transform = profileMenu.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });

        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.remove('show');
                const icon = profileToggle.querySelector('.toggle-icon');
                if (icon) icon.style.transform = 'rotate(0deg)';
            }
        });
    }

    // --- 5. Mobile Sidebar Toggle ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
        updateSidebarIcons();
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        updateSidebarIcons();
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // --- 6. Auto-resize textarea ---
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    const btnDiscount = document.getElementById('btn-discount');
    const btnAgentMode = document.getElementById('btn-agent-mode');
    const btnImageSearch = document.getElementById('btn-image-search');
    const btnFilter = document.getElementById('btn-filter');

    // --- Mobile Refinements Round 3 Helpers ---
    const mobilePlusBtn = document.getElementById('mobile-plus-btn');
    const mobileActionsPopover = document.getElementById('mobile-actions-popover');
    const activeTogglesMobile = document.getElementById('active-toggles-mobile');

    // Helper: Map data-action to original button element
    const getActionBtn = (action) => {
        if (action === 'agent-mode') return btnAgentMode;
        if (action === 'image-search') return btnImageSearch;
        if (action === 'discount') return btnDiscount;
        if (action === 'filter') return btnFilter;
        return null;
    };

    // Helper: Sync active states to mobile tags container
    function syncActiveTogglesMobile() {
        if (!activeTogglesMobile || window.innerWidth > 768) {
            if (activeTogglesMobile) activeTogglesMobile.innerHTML = '';
            return;
        }

        const config = [
            { id: 'discount', btn: btnDiscount, label: 'Chegirma', icon: 'fa-tag' },
            { id: 'agent-mode', btn: btnAgentMode, label: 'Agent Mode', icon: 'fa-robot' },
            { id: 'image-search', btn: btnImageSearch, label: 'Rasm Orqali', icon: 'fa-image' },
            { id: 'filter', btn: btnFilter, label: 'Filtrlash', icon: 'fa-filter' }
        ];

        let html = '';
        config.forEach(item => {
            if (item.btn && item.btn.classList.contains('active')) {
                html += `
                    <div class="active-tag" data-action="${item.id}">
                        <i class="fa-solid ${item.icon}"></i>
                        <span>${item.label}</span>
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                `;
            }
        });
        activeTogglesMobile.innerHTML = html;

        // Adjust padding of content area based on the actual height of search-interface
        const contentArea = document.querySelector('.content-area');
        const searchInterface = document.querySelector('.search-interface');
        if (contentArea && searchInterface && window.innerWidth <= 768) {
            // Short delay to ensure browser has rendered the tags
            setTimeout(() => {
                const height = searchInterface.offsetHeight;
                // Add some buffer (e.g., 40px) to ensure content is well above the input
                contentArea.style.paddingBottom = (height + 40) + 'px';
            }, 50);
        }
    }

    function toggleButtonState(btn) {
        if (!btn) return;

        // Check if clicking the remove icon directly
        // If so, we just want to deactivate. But since the icon is inside the button, 
        // the click event bubbles. We can handle it generically.

        const isActive = btn.classList.contains('active');

        if (isActive) {
            btn.classList.remove('active');
            const removeIcon = btn.querySelector('.remove-icon');
            if (removeIcon) removeIcon.remove();
        } else {
            btn.classList.add('active');
            // Add X icon
            const xIcon = document.createElement('i');
            xIcon.className = 'fa-solid fa-xmark remove-icon';
            xIcon.style.marginLeft = '8px';
            xIcon.style.fontSize = '0.8rem';
            btn.appendChild(xIcon);
        }
    }

    [btnDiscount, btnAgentMode, btnImageSearch].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                // If clicked on the X icon specifically, stop propagation if needed, 
                // but here clicking anywhere on the button toggles it, so it's fine.
                toggleButtonState(btn);
            });
        }
    });

    // --- Filter Button Logic ---
    const filterModalOverlay = document.getElementById('filter-modal-overlay');
    const filterCancel = document.getElementById('filter-cancel');
    const filterConfirm = document.getElementById('filter-confirm');

    if (btnFilter && filterModalOverlay) {
        btnFilter.addEventListener('click', (e) => {
            console.log('Filter button clicked. Active:', btnFilter.classList.contains('active'));
            // If already active (has X), deactivate
            if (btnFilter.classList.contains('active')) {
                toggleButtonState(btnFilter);
                // Clear fields visually if desired
                document.getElementById('filter-price-min').value = '';
                document.getElementById('filter-price-max').value = '';
                document.getElementById('filter-color').value = '';
                document.getElementById('filter-region').value = '';
                document.getElementById('filter-rating').value = '';
                document.getElementById('filter-sort').value = 'relevance';
            } else {
                // Open Modal
                filterModalOverlay.classList.add('active');
                console.log('Modal opened');
            }
        });

        if (filterCancel) {
            filterCancel.addEventListener('click', () => {
                filterModalOverlay.classList.remove('active');
            });
        }

        if (filterConfirm) {
            filterConfirm.addEventListener('click', () => {
                // Apply Filter -> Just toggle state for UI
                toggleButtonState(btnFilter);
                filterModalOverlay.classList.remove('active');

                // Use a short timeout to ensure the state change is captured
                setTimeout(() => {
                    syncActiveTogglesMobile();
                }, 100);
            });
        }

        // Close on outside click
        filterModalOverlay.addEventListener('click', (e) => {
            if (e.target === filterModalOverlay) {
                filterModalOverlay.classList.remove('active');
            }
        });
    }

    // --- 8. Input Draft Persistence ---
    const currentChatIdParam = new URLSearchParams(window.location.search).get('chat_id');
    const draftKey = currentChatIdParam ? `draft_${currentChatIdParam}` : 'draft_new';

    if (localStorage.getItem(draftKey)) {
        userInput.value = localStorage.getItem(draftKey);
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';

        // If there is text, assume it was a previous search and lock it?
        // Or just leave it editable? User requested "lock after search". 
        // If we reload, we might lose context of "did we just search?". 
        // For now, let's keep it simple: if there is content, user might want to edit it or see it. 
        // To strictly follow "lock is kept", we'd need to save state.
        // Let's rely on the user sending again to lock it, or if they prefer, we can default to locked if value exists.
        // Given the request "matn kiritlganda lock bo'lish kerak va o'sha inputda saqlanishi kerak", 
        // it implies the state should persist.
        if (userInput.value.trim().length > 0) {
            userInput.readOnly = true;
            sendBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            sendBtn.dataset.mode = 'edit';
        }
    }

    // Removed editBtn event listener

    userInput.addEventListener('input', function () {
        const id = conversationIdInput.value || (new URLSearchParams(window.location.search).get('chat_id')) || 'new';
        localStorage.setItem(`draft_${id}`, this.value);
    });

    function clearDraft() {
        const id = conversationIdInput.value || (new URLSearchParams(window.location.search).get('chat_id')) || 'new';
        localStorage.removeItem(`draft_${id}`);
    }

    // --- 9. Send Message Logic ---
    async function sendMessage() {
        const prompt = userInput.value.trim();
        if (!prompt) return;

        // Lock UI during process
        userInput.disabled = true;
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';

        // 1. If Editing, Delete Old Message First
        if (currentEditingMessageId) {
            try {
                await fetch(`/api/message/${currentEditingMessageId}/delete/`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                });
                // Remove from UI immediately (visual feedback)
                const oldMsg = document.getElementById(`message-content-${currentEditingMessageId}`)?.closest('.message');
                if (oldMsg) oldMsg.remove();

            } catch (err) {
                console.error("Error deleting message for edit:", err);
            }
            currentEditingMessageId = null; // Reset
        }

        // Clear input - DISABLED per user request
        // userInput.value = '';

        const welcome = document.querySelector('.welcome-screen');
        if (welcome) welcome.remove();

        const resultContainer = document.createElement('div');
        resultContainer.className = 'result-block';
        chatContainer.appendChild(resultContainer);

        const reasoningBlock = document.createElement('div');
        reasoningBlock.className = 'reasoning-block';
        reasoningBlock.innerHTML = `
            <div id="current-reasoning">
                <strong><i class="fa-solid fa-brain"></i> Thinking...</strong>
            </div>
        `;
        resultContainer.appendChild(reasoningBlock);

        const productsBlock = document.createElement('div');
        productsBlock.className = 'products-block';
        productsBlock.innerHTML = '<div class="products-grid" style="display:none;"></div>';
        resultContainer.appendChild(productsBlock);

        const responseBlock = document.createElement('div');
        responseBlock.className = 'response-text-block';
        responseBlock.style.display = 'none';
        resultContainer.insertBefore(responseBlock, productsBlock);

        try {
            const response = await fetch('/api/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    prompt: prompt,
                    conversation_id: conversationIdInput.value || null
                })
            });

            const data = await response.json();

            if (data.conversation_id) {
                // Clear drafts as message is now saved
                localStorage.removeItem('draft_new');
                localStorage.removeItem(`draft_${data.conversation_id}`);

                const oldId = conversationIdInput.value;
                if (!oldId || oldId === 'new') {
                    const newUrl = `${window.location.pathname}?chat_id=${data.conversation_id}`;
                    window.history.pushState({ path: newUrl }, '', newUrl);
                }

                conversationIdInput.value = data.conversation_id;
                // Don't full reload history yet, just append for smoothness
                // But updating sidebar list is good
                updateHistory(data.conversations, data.conversation_id);

                // If we want to fully sync (to get IDs for edit buttons), we might need to reload or handle it.
                // For now, let's just show the result. Next generic reload will fix IDs.
            }

            const reasoningContainer = reasoningBlock.querySelector('#current-reasoning');
            reasoningContainer.className = 'reasoning-container'; // Add styling class
            reasoningContainer.innerHTML = `
                <div class="reasoning-header" style="cursor: pointer; display: flex; align-items: center; gap: 10px;" onclick="this.nextElementSibling.classList.toggle('show')">
                    <strong><i class="fa-solid fa-brain"></i> Fikrlash jarayoni</strong>
                    <i class="fa-solid fa-chevron-down toggle-icon" style="transition: transform 0.3s;"></i>
                </div>
                <div class="reasoning-content" style="margin-top: 10px;"></div>
            `;

            const stepsContainer = reasoningContainer.querySelector('.reasoning-content');

            for (let i = 0; i < data.reasoning_steps.length; i++) {
                await new Promise(r => setTimeout(r, 800));
                const step = document.createElement('div');
                step.className = 'reasoning-step';
                step.textContent = data.reasoning_steps[i];
                step.style.opacity = '1'; /* Ensure visible when container opens */
                stepsContainer.appendChild(step);
                scrollToBottom();
            }

            if (data.response) {
                await new Promise(r => setTimeout(r, 500));
                responseBlock.style.display = 'block';
                responseBlock.innerHTML = `<p>${data.response}</p>`;
                responseBlock.style.animation = 'fadeIn 0.5s ease';
            }

            if (data.products && data.products.length > 0) {
                const productsGrid = productsBlock.querySelector('.products-grid');
                productsGrid.style.display = 'grid';
                data.products.forEach(product => {
                    productsGrid.innerHTML += createProductCard(product);
                });
                productsGrid.style.animation = 'fadeIn 0.5s ease';
            }

            scrollToBottom();

        } catch (error) {
            console.error('Error:', error);
            resultContainer.innerHTML = '<div style="color:red; padding:1rem;">Sorry, something went wrong.</div>';
        }

        userInput.disabled = false;

        // Lock Input and Change Button to Edit
        userInput.readOnly = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        sendBtn.dataset.mode = 'edit';

        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        // userInput.focus(); // Don't focus if locked
    }

    sendBtn.addEventListener('click', () => {
        const mode = sendBtn.dataset.mode;

        if (mode === 'edit') {
            // Unlock for editing
            userInput.readOnly = false;
            userInput.focus();

            // Restore full height
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';

            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.dataset.mode = 'send';

            // Optional: If we want to "cancel" edit, we could store the previous value. 
            // But here "Edit" implies we are ready to send a NEW query based on this one.
        } else {
            sendMessage();
        }
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- 10. History Update ---
    function updateHistory(conversations, activeId) {
        historyList.innerHTML = '';
        conversations.forEach(chat => {
            const li = document.createElement('li');
            if (chat.id == activeId) li.className = 'active';

            li.innerHTML = `
                <div class="history-item-content">
                    <a href="?chat_id=${chat.id}" class="history-link">
                        <i class="fa-regular fa-message"></i> 
                        <span class="chat-title" id="title-${chat.id}">${chat.title ? chat.title.substring(0, 18) : 'New Chat'}</span>
                    </a>
                    
                    <i class="fa-solid fa-ellipsis-vertical history-kebab-btn" data-id="${chat.id}"></i>
                    
                    <div class="history-dropdown" id="dropdown-${chat.id}">
                        <div class="dropdown-item rename-chat" data-id="${chat.id}">
                            <i class="fa-solid fa-pen"></i> Rename
                        </div>
                        <div class="dropdown-item delete delete-chat" data-id="${chat.id}">
                            <i class="fa-solid fa-trash"></i> Delete
                        </div>
                    </div>
                </div>
            `;
            historyList.appendChild(li);
        });
    }

    // --- 11. Event Delegation for History Actions (Kebab, Rename, Delete) ---
    document.addEventListener('click', (e) => {
        // Toggle Dropdown
        if (e.target.matches('.history-kebab-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.target;
            const dropdownId = `dropdown-${btn.dataset.id}`;
            const dropdown = document.getElementById(dropdownId);

            // Close others
            document.querySelectorAll('.history-dropdown').forEach(d => {
                if (d.id !== dropdownId) d.classList.remove('show');
            });
            document.querySelectorAll('.history-kebab-btn').forEach(b => {
                if (b !== btn) b.classList.remove('active');
            });

            if (dropdown) {
                dropdown.classList.toggle('show');
                btn.classList.toggle('active');
            }
            return;
        }

        // Rename
        if (e.target.closest('.rename-chat')) {
            e.preventDefault();
            e.stopPropagation();
            const item = e.target.closest('.rename-chat');
            const chatId = item.dataset.id;
            const dropdown = document.getElementById(`dropdown-${chatId}`);
            if (dropdown) dropdown.classList.remove('show');
            renameChat(chatId);
            return;
        }

        // Delete
        if (e.target.closest('.delete-chat')) {
            e.preventDefault();
            e.stopPropagation();
            const item = e.target.closest('.delete-chat');
            const chatId = item.dataset.id;
            const dropdown = document.getElementById(`dropdown-${chatId}`);
            if (dropdown) dropdown.classList.remove('show');
            deleteChat(chatId);
            return;
        }

        // Close Dropdowns on outside click
        if (!e.target.closest('.history-dropdown') && !e.target.matches('.history-kebab-btn')) {
            document.querySelectorAll('.history-dropdown').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.history-kebab-btn').forEach(b => b.classList.remove('active'));
        }
    });

    // --- 12. Custom Modals ---
    const modalOverlay = document.getElementById('modal-overlay');
    const renameModal = document.getElementById('rename-modal');
    const deleteModal = document.getElementById('delete-modal');

    const renameInput = document.getElementById('rename-input');
    const renameCancelBtn = document.getElementById('rename-cancel');
    const renameConfirmBtn = document.getElementById('rename-confirm');

    const deleteCancelBtn = document.getElementById('delete-cancel');
    const deleteConfirmBtn = document.getElementById('delete-confirm');

    let currentChatId = null;

    function openModal(modal) {
        modalOverlay.classList.add('active');
        modal.style.display = 'block';
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        setTimeout(() => {
            renameModal.style.display = 'none';
            deleteModal.style.display = 'none';
        }, 300);
        currentChatId = null;
    }

    if (renameCancelBtn) renameCancelBtn.addEventListener('click', closeModal);
    if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', closeModal);

    if (renameConfirmBtn) {
        renameConfirmBtn.addEventListener('click', async () => {
            const newTitle = renameInput.value.trim();
            if (newTitle && currentChatId) {
                try {
                    const response = await fetch(`/api/chat/${currentChatId}/rename/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        },
                        body: JSON.stringify({ title: newTitle })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const titleSpan = document.getElementById(`title-${currentChatId}`);
                        if (titleSpan) titleSpan.textContent = data.title.substring(0, 18);
                    }
                } catch (err) {
                    console.error(err);
                }
                closeModal();
            }
        });
    }

    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', async () => {
            if (currentChatId) {
                try {
                    const response = await fetch(`/api/chat/${currentChatId}/delete/`, {
                        method: 'DELETE',
                        headers: {
                            'X-CSRFToken': getCookie('csrftoken')
                        }
                    });
                    if (response.ok) {
                        const currentId = conversationIdInput.value;

                        // Remove from DOM
                        const deletedItem = historyList.querySelector(`li a[href*="chat_id=${currentChatId}"]`)?.closest('li');
                        if (deletedItem) {
                            deletedItem.remove();
                        }

                        if (currentId == currentChatId) {
                            // If we deleted the active chat, switch to new chat view
                            if (newChatBtn) newChatBtn.click();
                            else {
                                // Fallback if no btn found (shouldn't happen)
                                window.location.href = '/';
                            }
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
                closeModal();
            }
        });
    }

    function renameChat(chatId) {
        currentChatId = chatId;
        const currentTitleSpan = document.getElementById(`title-${chatId}`);
        renameInput.value = currentTitleSpan ? currentTitleSpan.textContent : '';
        openModal(renameModal);
        renameInput.focus();
    }

    // --- 13. Dynamic Chat Loading (SPA) ---
    async function loadConversation(id) {
        try {
            // Loading state
            chatContainer.innerHTML = '<div class="loading-state" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading chat...</div>';

            const response = await fetch(`/api/chat/${id}/`);
            if (!response.ok) throw new Error('Failed to load');

            const data = await response.json();

            // Update URL
            const newUrl = `${window.location.pathname}?chat_id=${id}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            // Update UI
            conversationIdInput.value = data.id;
            chatContainer.innerHTML = ''; // Clear loading

            if (data.messages && data.messages.length > 0) {
                // Show messages
                data.messages.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = `message ${msg.role}`;

                    let reasoningHtml = '';
                    if (msg.reasoning_steps && msg.reasoning_steps.length > 0) {
                        reasoningHtml = `
                        <div class="reasoning-container">
                            <div class="reasoning-header" onclick="this.nextElementSibling.classList.toggle('show')">
                                <strong><i class="fa-solid fa-brain"></i> Fikrlash jarayoni</strong>
                                <i class="fa-solid fa-chevron-down toggle-icon"></i>
                            </div>
                            <div class="reasoning-content">
                                ${msg.reasoning_steps.map(step => `<div class="reasoning-step">${step}</div>`).join('')}
                            </div>
                        </div>`;
                    }

                    let actionsHtml = '';
                    if (msg.role === 'user') {
                        actionsHtml = `
                        <div class="message-actions">
                            <button class="edit-msg-btn" title="Edit prompt" data-message-id="${msg.id}">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </div>`;
                    }

                    let productsHtml = '';
                    if (msg.recommended_products && msg.recommended_products.length > 0) {
                        productsHtml = `
                        <div class="products-block">
                            <div class="products-grid" style="display: grid;">
                                ${msg.recommended_products.map(p => createProductCard(p)).join('')}
                            </div>
                        </div>`;
                    }

                    div.innerHTML = `
                        <div class="message-avatar">
                            ${msg.role === 'user' ? '<i class="fa-regular fa-user"></i>' : ''}
                        </div>
                        <div class="message-content" id="message-content-${msg.id}">
                             ${msg.content}
                             ${reasoningHtml}
                             ${productsHtml}
                             ${actionsHtml}
                        </div>
                    `;
                    chatContainer.appendChild(div);
                });
            }

            // Handle Draft or Last Message
            const draft = localStorage.getItem(`draft_${id}`);

            // Find last user message to show as "current query"
            let lastUserMsg = '';
            if (data.messages && data.messages.length > 0) {
                const userMsgs = data.messages.filter(m => m.role === 'user');
                if (userMsgs.length > 0) {
                    lastUserMsg = userMsgs[userMsgs.length - 1].content;
                }
            }

            if (draft) {
                userInput.value = draft;
                // If draft exists, it's editable
                userInput.readOnly = false;
                sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                sendBtn.dataset.mode = 'send';
            } else if (lastUserMsg) {
                userInput.value = lastUserMsg;
                // Lock it as it is a simplified result view
                userInput.readOnly = true;
                sendBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                sendBtn.dataset.mode = 'edit';
            } else {
                userInput.value = '';
                userInput.readOnly = false;
                sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                sendBtn.dataset.mode = 'send';
            }

            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';

            userInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.display = 'block';

            // Active State
            document.querySelectorAll('.history-list li').forEach(li => li.classList.remove('active'));
            // Try to find li with this id and make active (needs data attribute on li or link parsing)
            setTimeout(() => {
                const link = document.querySelector(`a[href="?chat_id=${id}"]`);
                if (link) {
                    const li = link.closest('li');
                    if (li) li.classList.add('active');
                }
            }, 100);

            scrollToBottom();

        } catch (err) {
            console.error(err);
            chatContainer.innerHTML = '<div style="color:red; padding:20px;">Failed to load chat.</div>';
        }
    }

    // Intercept History Clicks
    historyList.addEventListener('click', (e) => {
        const link = e.target.closest('.history-link');
        if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const urlParams = new URLSearchParams(href.split('?')[1]);
            const id = urlParams.get('chat_id');
            if (id) {
                loadConversation(id);

                // Toggle sidebar on mobile if open
                if (window.innerWidth <= 768) {
                    closeSidebar();
                }
            }
        }
    });

    // Intercept New Chat
    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Reset UI for new chat
            conversationIdInput.value = '';
            chatContainer.innerHTML = `
                <div class="welcome-screen" style="text-align: center; margin-top: 10vh;">
                    <h1>How can I help you explore products today?</h1>
                    <p style="color: var(--text-muted); margin-top: 10px;">Ask about laptops, accessories, or any gadgets.</p>
                </div>
            `;
            const newUrl = '/new/';
            window.history.pushState({ path: newUrl }, '', newUrl);

            userInput.value = '';
            userInput.readOnly = false;
            userInput.style.height = 'auto'; // Reset height

            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.dataset.mode = 'send';

            userInput.focus();

            document.querySelectorAll('.history-list li').forEach(li => li.classList.remove('active'));
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    }

    // --- 14. Event Delegation for Edit Message ---
    chatContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-msg-btn');
        if (editBtn) {
            // Set current editing ID
            currentEditingMessageId = editBtn.dataset.messageId;

            const messageContentDiv = editBtn.closest('.message-content');
            // clone to avoid getting button text/html
            const clone = messageContentDiv.cloneNode(true);
            const actions = clone.querySelector('.message-actions');
            if (actions) actions.remove();

            // Get text content (excluding reasoning)
            const reasoning = clone.querySelector('.reasoning-container');
            if (reasoning) reasoning.remove();

            const text = clone.textContent.trim();
            userInput.value = text;
            userInput.focus();

            // Auto-resize
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
        }
    });

    // Handle Browser Back/Forward
    window.addEventListener('popstate', (event) => {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('chat_id');
        if (id) {
            loadConversation(id);
        } else {
            // New Chat state
            newChatBtn.click(); // Trigger click logic or duplicate it
        }
    });

    function deleteChat(chatId) {
        currentChatId = chatId;
        openModal(deleteModal);
    }

    function createProductCard(product) {
        return `
            <div class="product-card">
                <div class="product-img">
                    <i class="fa-solid fa-box-open" style="font-size: 3rem;"></i>
                </div>
                <div class="product-info">
                    <div class="product-title">${product.name}</div>
                    <div class="product-price">$${product.price}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">${product.description}</div>
                </div>
            </div>
        `;
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // --- 14. Mobile Refinements Round 3 Events ---

    if (mobilePlusBtn && mobileActionsPopover) {
        // Toggle Popover
        mobilePlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileActionsPopover.classList.toggle('show');
            mobilePlusBtn.classList.toggle('active', isOpen);
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileActionsPopover.contains(e.target) && !mobilePlusBtn.contains(e.target)) {
                mobileActionsPopover.classList.remove('show');
                mobilePlusBtn.classList.remove('active');
            }
        });

        // Handle Popover Item Click
        mobileActionsPopover.addEventListener('click', (e) => {
            const item = e.target.closest('.popover-item');
            if (item) {
                const action = item.dataset.action;
                const btn = getActionBtn(action);
                if (btn) btn.click(); // Trigger original logic

                mobileActionsPopover.classList.remove('show');
                mobilePlusBtn.classList.remove('active');

                syncActiveTogglesMobile();
            }
        });
    }

    // Handle Active Tag Click (Deactivate)
    if (activeTogglesMobile) {
        activeTogglesMobile.addEventListener('click', (e) => {
            const tag = e.target.closest('.active-tag');
            if (tag) {
                const action = tag.dataset.action;
                const btn = getActionBtn(action);
                if (btn) btn.click(); // This will de-toggle and trigger original logic
                syncActiveTogglesMobile();
            }
        });
    }

    // Listen for state changes on main buttons to keep mobile synced
    [btnDiscount, btnAgentMode, btnImageSearch, btnFilter].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                // Short delay to allow button classes to update
                setTimeout(syncActiveTogglesMobile, 50);
            });
        }
    });

    // --- Sidebar Toggle Enhancement ---
    function initMobileSidebar() {
        const mobBtn = document.getElementById('mobile-menu-btn');
        if (mobBtn) {
            // Remove existing to be clean if re-running
            mobBtn.replaceWith(mobBtn.cloneNode(true));
            const newMobBtn = document.getElementById('mobile-menu-btn');
            newMobBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSidebar();
            });
        }
    }

    initMobileSidebar();
    setTimeout(syncActiveTogglesMobile, 500); // Initial sync
});

document.addEventListener('DOMContentLoaded', () => {
    function t(key, defaultVal) {
        if (window.t) {
            return window.t(key, defaultVal);
        }
        return defaultVal;
    }
    console.log('AI Interaction script initialized');
    const chatContainer = document.getElementById('chat-container');
    const mainContent = document.querySelector('.main-content');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const conversationIdInput = document.getElementById('conversation-id');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const editBtn = document.getElementById('edit-btn');

    // Bottom chat elements
    const bottomChatContainer = document.getElementById('bottom-chat-container');
    const bottomChatInput = document.getElementById('chat-bottom-input');
    const bottomChatSendBtn = document.getElementById('chat-send-btn');
    const chatPlusBtn = document.getElementById('chat-plus-btn');
    const chatDropdown = document.getElementById('chat-dropdown');
    const chatSearchTagsContainer = document.getElementById('chat-search-tags');
    const chatFileInput = document.getElementById('chat-image-upload-input');
    
    const topSearchContainer = document.getElementById('top-search-container');
    const searchTabs = document.querySelectorAll('#tab-all, #tab-fast-answer, #tab-alert');

    console.log('DOM Elements found:', { chatContainer, mainContent, userInput, sendBtn, bottomChatContainer });

    let currentEditingMessageId = null;
    let lastResponseData = null;
    let selectedMentionProduct = null;
    let activeTrigger = null; // '@'
    const mentionPopup = document.getElementById('product-mention-popup');
    const replyContext = document.getElementById('chat-reply-context');
    let allTabContent = chatContainer ? chatContainer.innerHTML : '';
    let alertIdToDelete = null;

    const aiChatContainer = document.getElementById('ai-chat-container');
    const aiChatMessages = document.getElementById('ai-chat-messages');

    // Tab Switching Logic
    function setChatMode(isChatMode) {
        if (isChatMode) {
            if (topSearchContainer) topSearchContainer.classList.add('hidden');
            if (bottomChatContainer) {
                bottomChatContainer.classList.add('active');
                // Check if we have messages. If not, center the input
                if (aiChatMessages && aiChatMessages.children.length <= 1) { // 1 is for welcome message
                    bottomChatContainer.classList.add('centered');
                    document.body.classList.add('chat-initial-state');
                }
            }
            if (chatContainer) chatContainer.style.display = 'none';
            if (aiChatContainer) aiChatContainer.style.display = 'block';
            document.body.classList.add('ask-ai-mode');
            if (bottomChatInput) {
                bottomChatInput.placeholder = t('ask_ai_anything', 'Ask AI anything...');
                bottomChatInput.focus();
            }
        } else {
            if (topSearchContainer) topSearchContainer.classList.remove('hidden');
            if (bottomChatContainer) {
                bottomChatContainer.classList.remove('active');
                bottomChatContainer.classList.remove('centered');
            }
            document.body.classList.remove('chat-initial-state');
            if (chatContainer) chatContainer.style.display = 'block';
            if (aiChatContainer) aiChatContainer.style.display = 'none';
            document.body.classList.remove('ask-ai-mode');
            if (chatDropdown) chatDropdown.classList.remove('show');
            if (bottomChatInput) {
                bottomChatInput.placeholder = t('describe_anything', 'Describe anything...');
            }
        }
    }

    // Chat Dropdown Logic
    if (chatPlusBtn && chatDropdown) {
        chatPlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!chatDropdown.contains(e.target) && !chatPlusBtn.contains(e.target)) {
                chatDropdown.classList.remove('show');
            }
        });

        const chatOptions = chatDropdown.querySelectorAll('.dropdown-option');
        
        const createChatTag = (text, id) => {
            const tag = document.createElement('div');
            tag.className = 'search-tag';
            tag.dataset.id = id;
            tag.innerHTML = `
                <span>${text}</span>
                <i class="fa-solid fa-xmark"></i>
            `;
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                tag.remove();
                const option = document.getElementById(id);
                if (option) option.classList.remove('active');
                if (id === 'chat-btn-image-search' && chatFileInput) chatFileInput.value = '';
            });
            return tag;
        };

        if (chatFileInput) {
            chatFileInput.addEventListener('change', (e) => {
                if (chatFileInput.files && chatFileInput.files[0]) {
                    const fileName = chatFileInput.files[0].name;
                    const id = 'chat-btn-image-search';
                    const option = document.getElementById(id);
                    let existingTag = chatSearchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                    if (existingTag) existingTag.remove();
                    const tag = createChatTag(`Img: ${fileName}`, id);
                    chatSearchTagsContainer.appendChild(tag);
                    if (option) option.classList.add('active');
                }
            });
        }

        chatOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = option.id;

                if (id === 'chat-btn-image-search') {
                    let existingTag = chatSearchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                    if (existingTag) {
                        existingTag.remove();
                        option.classList.remove('active');
                        if (chatFileInput) chatFileInput.value = '';
                    } else {
                        if (chatFileInput) chatFileInput.click();
                    }
                    return;
                }

                if (id === 'chat-btn-filter') {
                    const filterModal = document.getElementById('filter-modal-overlay');
                    if (filterModal) filterModal.classList.add('active');
                    chatDropdown.classList.remove('show');
                    return;
                }

                const text = option.querySelector('span').innerText;
                let existingTag = chatSearchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);

                if (existingTag) {
                    existingTag.remove();
                    option.classList.remove('active');
                } else {
                    const tag = createChatTag(text, id);
                    chatSearchTagsContainer.appendChild(tag);
                    option.classList.add('active');
                }
                chatDropdown.classList.remove('show');
            });
        });
    }

    searchTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // Don't prevent default as other logic might rely on it
            const id = tab.id;
            
            // If switching FROM 'tab-all' to another tab, save current results content
            const activeTabAll = document.querySelector('#tab-all.active');
            if (activeTabAll && id !== 'tab-all') {
                allTabContent = chatContainer.innerHTML;
            }

            // Remove active from all tabs
            searchTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (id === 'tab-fast-answer') {
                setChatMode(true);
            } else if (id === 'tab-alert') {
                setChatMode(false);
                if (topSearchContainer) topSearchContainer.classList.add('hidden');
                if (window.renderSavedAlerts) {
                    window.renderSavedAlerts();
                }
            } else {
                setChatMode(false);
                if (id === 'tab-all') {
                    const searchInput = document.getElementById('user-input');
                    if (searchInput && searchInput.value.trim() === '') {
                        if (typeof window.showLandingView === 'function') {
                            window.showLandingView();
                        } else {
                            window.location.href = '/';
                        }
                        return;
                    }
                    // Restore results if we have them, otherwise clear
                    chatContainer.innerHTML = allTabContent || '';
                    if (allTabContent) {
                        attachSearchResultsListeners();
                    }
                }
            }
        });
    });

    // Check initial state from URL or active tab
    const activeTab = document.querySelector('.search-tab.active');
    if (activeTab) {
        if (activeTab.id === 'tab-fast-answer') {
            setChatMode(true);
        } else if (activeTab.id === 'tab-alert') {
            setChatMode(false);
            if (topSearchContainer) topSearchContainer.classList.add('hidden');
            if (window.renderSavedAlerts) {
                window.renderSavedAlerts();
            }
        }
    }


    if (bottomChatInput) {
        bottomChatInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const cursorPos = e.target.selectionStart;
            const lastChar = value.slice(cursorPos - 1, cursorPos);

            if (lastChar === '@') {
                activeTrigger = '@';
                showMentionPopup();
            } else if (!value.includes('@') || lastChar === ' ') {
                hideMentionPopup();
            }
        });

        bottomChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideMentionPopup();
            }
        });
    }

    if (userInput) {
        userInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    function showMentionPopup() {
        if (!lastResponseData || !lastResponseData.products || lastResponseData.products.length === 0) {
            console.log('No products to mention');
            return;
        }

        mentionPopup.innerHTML = '';
        lastResponseData.products.slice(0, 15).forEach(product => {
            const item = document.createElement('div');
            item.className = 'mention-item';
            item.innerHTML = `
                <img src="${product.image_url || ''}" alt="">
                <div class="mention-info">
                    <div class="mention-title">${escapeHTML(product.title)}</div>
                    <div class="mention-price">${formatPrice(product.price)} ${product.currency || t('som', "so'm")}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                if (activeTrigger === '@') {
                    selectProductForMention(product);
                }
            });
            mentionPopup.appendChild(item);
        });

        mentionPopup.classList.add('active');
    }



    function hideMentionPopup() {
        if (mentionPopup) mentionPopup.classList.remove('active');
    }

    function selectProductForMention(product) {
        selectedMentionProduct = product;
        hideMentionPopup();
        
        // Remove the '@' if it was just typed
        const value = bottomChatInput.value;
        bottomChatInput.value = value.replace(/@$/, '');

        // Show reply context
        if (replyContext) {
            let aboutText = t('question_about', 'question about {title}');
            aboutText = aboutText.replace('{title}', `<strong>${escapeHTML(product.title)}</strong>`);
            replyContext.innerHTML = `
                <div class="reply-content">
                    <i class="fa-solid fa-reply"></i> 
                    ${aboutText}
                </div>
                <div class="reply-close" id="close-reply-context"><i class="fa-solid fa-xmark"></i></div>
            `;
            replyContext.classList.add('active');
            
            document.getElementById('close-reply-context').addEventListener('click', () => {
                selectedMentionProduct = null;
                replyContext.classList.remove('active');
            });
        }
        bottomChatInput.focus();
    }

    function scrollToBottom() {
        if (!mainContent) return;
        mainContent.scrollTo({
            top: mainContent.scrollHeight,
            behavior: 'smooth'
        });
    }
    // scrollToBottom();
    const alertModal = document.getElementById('alert-delete-modal');
    const alertModalConfirm = document.getElementById('alert-modal-confirm');
    const alertModalCancel = document.getElementById('alert-modal-cancel');

    function hideAlertModal() {
        if (alertModal) alertModal.classList.remove('show');
        alertIdToDelete = null;
    }

    if (alertModalConfirm) {
        alertModalConfirm.addEventListener('click', () => {
            console.log('Confirming alert deletion for ID:', alertIdToDelete);
            if (alertIdToDelete) {
                const allSaved = JSON.parse(localStorage.getItem('saved_alerts') || '[]');
                const updated = allSaved.filter(a => String(a.id) !== String(alertIdToDelete));
                localStorage.setItem('saved_alerts', JSON.stringify(updated));
                hideAlertModal();
                if (typeof window.renderSavedAlerts === 'function') {
                    window.renderSavedAlerts();
                }
            }
        });
    }

    if (alertModalCancel) {
        alertModalCancel.addEventListener('click', hideAlertModal);
    }

    if (alertModal) {
        alertModal.addEventListener('click', (e) => {
            if (e.target === alertModal) {
                hideAlertModal();
            }
        });
    }

    window.deleteAlert = function (alertId) {
        console.log('Opening delete modal for alert:', alertId);
        alertIdToDelete = alertId;
        if (alertModal) {
            alertModal.classList.add('show');
        } else {
            if (confirm(t('delete_notification_confirm', 'Do you want to delete this notification?'))) {
                const allSaved = JSON.parse(localStorage.getItem('saved_alerts') || '[]');
                const updated = allSaved.filter(a => String(a.id) !== String(alertId));
                localStorage.setItem('saved_alerts', JSON.stringify(updated));
                if (typeof window.renderSavedAlerts === 'function') {
                    window.renderSavedAlerts();
                }
            }
        }
    };

    const btnDiscount = document.getElementById('btn-discount');
    const btnAgentMode = document.getElementById('btn-agent-mode');
    const btnImageSearch = document.getElementById('btn-image-search');
    const btnFilter = document.getElementById('btn-filter');
    const mobilePlusBtn = document.getElementById('mobile-plus-btn');
    const mobileActionsPopover = document.getElementById('mobile-actions-popover');
    const activeTogglesMobile = document.getElementById('active-toggles-mobile');
    const getActionBtn = (action) => {
        if (action === 'agent-mode') return btnAgentMode;
        if (action === 'image-search') return btnImageSearch;
        if (action === 'discount') return btnDiscount;
        if (action === 'filter') return btnFilter;
        return null;
    };

    function syncActiveTogglesMobile() {
        if (!activeTogglesMobile || window.innerWidth > 768) {
            if (activeTogglesMobile) activeTogglesMobile.innerHTML = '';
            return;
        }

        const config = [
            { id: 'discount', btn: btnDiscount, label: t('discount', 'Discount'), icon: 'fa-tag' },
            { id: 'agent-mode', btn: btnAgentMode, label: t('agent_mode', 'Agent Mode'), icon: 'fa-robot' },
            { id: 'image-search', btn: btnImageSearch, label: t('image_search', 'Image search'), icon: 'fa-image' },
            { id: 'filter', btn: btnFilter, label: t('filtering', 'Filtering'), icon: 'fa-filter' }
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
        const contentArea = document.querySelector('.content-area');
        const searchInterface = document.querySelector('.search-interface');
        if (contentArea && searchInterface && window.innerWidth <= 768) {
            setTimeout(() => {
                const height = searchInterface.offsetHeight;
                contentArea.style.paddingBottom = (height + 40) + 'px';
            }, 50);
        }
    }

    // Use MutationObserver to sync visual state (X icon) with class changes
    // This allows search_bar.js to manage the source of truth (tags/active class)
    // without conflict from ai_interaction.js
    const toggleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const btn = mutation.target;
                const isActive = btn.classList.contains('active');
                const xIcon = btn.querySelector('.remove-icon');

                if (isActive && !xIcon) {
                    const icon = document.createElement('i');
                    icon.className = 'fa-solid fa-xmark remove-icon';
                    icon.style.marginLeft = '8px';
                    icon.style.fontSize = '0.8rem';
                    btn.appendChild(icon);
                } else if (!isActive && xIcon) {
                    xIcon.remove();
                }

                // Sync mobile toggles whenever state changes
                syncActiveTogglesMobile();
            }
        });
    });

    [btnDiscount, btnAgentMode, btnImageSearch, btnFilter].forEach(btn => {
        if (btn) {
            toggleObserver.observe(btn, { attributes: true });
        }
    });

    // Remove direct click listeners for simple toggles - let search_bar.js handle it
    // Only kept for Filter to handle modal logic (but not state toggling)

    const filterModalOverlay = document.getElementById('filter-modal-overlay');
    const filterCancel = document.getElementById('filter-cancel');
    const filterConfirm = document.getElementById('filter-confirm');

    if (btnFilter && filterModalOverlay) {
        btnFilter.addEventListener('click', (e) => {
            console.log('Filter button clicked. Active:', btnFilter.classList.contains('active'));
            // Note: search_bar.js handles the tag and active class toggling.
            // We only need to handle the Modal opening/clearing logic.

            // If it WAS active before the click, search_bar.js will deactivate it.
            // If it WAS inactive, search_bar.js will activate it.

            // However, since both run on click, we check the CURRENT state 
            // but we must be careful about race conditions. 
            // Actually, search_bar.js runs AFTER this because it is loaded later?
            // Wait, listeners run in order of attachment. ai_interaction.js is attached first.

            // So at this point:
            // If button is INACTIVE: User wants to ACTIVATE. 
            // We open modal. search_bar.js will follow and set Active + Tag.

            // If button is ACTIVE: User wants to DEACTIVATE.
            // We clear fields. search_bar.js will follow and remove Active + Tag.

            if (btnFilter.classList.contains('active')) {
                // User is turning it OFF
                document.getElementById('filter-price-min').value = '';
                document.getElementById('filter-price-max').value = '';
                document.getElementById('filter-color').value = '';
                document.getElementById('filter-region').value = '';
                document.getElementById('filter-rating').value = '';
                document.getElementById('filter-sort').value = 'relevance';
            } else {
                // User is turning it ON
                filterModalOverlay.classList.add('active');
                console.log('Modal opened');
            }
        });

        if (filterCancel) {
            filterCancel.addEventListener('click', () => {
                filterModalOverlay.classList.remove('active');
                // If user cancels, maybe we should remove the tag if it was just added?
                // But search_bar.js added it on click. 
                // User can click Filter again to remove it. 
            });
        }

        if (filterConfirm) {
            filterConfirm.addEventListener('click', () => {
                // search_bar.js already activated the button on open.
                filterModalOverlay.classList.remove('active');
                setTimeout(() => {
                    syncActiveTogglesMobile();
                }, 100);
            });
        }

        filterModalOverlay.addEventListener('click', (e) => {
            if (e.target === filterModalOverlay) {
                filterModalOverlay.classList.remove('active');
            }
        });
    }

    const currentChatIdParam = new URLSearchParams(window.location.search).get('chat_id');
    const draftKey = currentChatIdParam ? `draft_${currentChatIdParam}` : 'draft_new';

    if (userInput && !userInput.value.trim() && localStorage.getItem(draftKey)) {
        userInput.value = localStorage.getItem(draftKey);
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    }

    userInput.addEventListener('input', function () {
        const id = conversationIdInput.value || (new URLSearchParams(window.location.search).get('chat_id')) || 'new';
        localStorage.setItem(`draft_${id}`, this.value);
    });

    function clearDraft() {
        const id = conversationIdInput.value || (new URLSearchParams(window.location.search).get('chat_id')) || 'new';
        localStorage.removeItem(`draft_${id}`);
    }

    async function sendMessage(overridePrompt = null) {
        console.log('sendMessage called');
        let prompt = overridePrompt;
        
        if (prompt === null) {
            const isBottomActive = bottomChatContainer && bottomChatContainer.classList.contains('active');
            const activeInput = isBottomActive ? bottomChatInput : userInput;
            prompt = activeInput ? activeInput.value.trim() : '';
        }

        const isAiChatMode = document.body.classList.contains('ask-ai-mode');
        
        if (isAiChatMode) {
            await sendAiChatMessage(prompt);
            return;
        }

        const isAutoTrigger = sendBtn && sendBtn.dataset.isAutoTrigger === 'true';
        // const isOnSearchPage = window.location.pathname.startsWith('/search');

        if (!isAutoTrigger) {
            // Always refresh/redirect to update URL and state on manual search
            const isBottomActive = bottomChatContainer && bottomChatContainer.classList.contains('active');
            const tagsSelector = isBottomActive ? '#chat-search-tags .search-tag' : '#search-tags .search-tag';
            const tags = document.querySelectorAll(tagsSelector);
            
            let params = new URLSearchParams();
            params.set('q', prompt);

            tags.forEach(tag => {
                const id = tag.dataset.id;
                if (id.includes('agent-mode')) params.set('agent_mode', '1');
                if (id.includes('discount')) params.set('discount', '1');
                if (id.includes('filter')) params.set('filter', '1');
            });

            window.history.pushState(null, '', `/?${params.toString()}`);
            // No return here, allow it to proceed dynamically
        }

        const tabAll = document.getElementById('tab-all');
        if (tabAll && !tabAll.classList.contains('active')) {
            tabAll.click();
        }

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
        }

        currentEditingMessageId = null;

        // Clear container for new results (fixes appending issue)
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }

        const welcome = document.querySelector('.welcome-screen');
        if (welcome) welcome.remove();

        // Show loading skeleton
        chatContainer.innerHTML = buildLoadingSkeleton();

        try {
            const startTime = Date.now();

            const response = await fetch('/api/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    prompt: prompt
                })
            });

            const data = await response.json();
            lastResponseData = data;
            lastResponseData.prompt = prompt;

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);

            // Render the search results
            renderSearchResults(data, prompt, duration);

        } catch (error) {
            console.error('Error:', error);
            chatContainer.innerHTML = `<div style="color:red; padding:1rem;">${t('something_went_wrong', 'Sorry, something went wrong.')}</div>`;
        }

        const activeInput = (bottomChatContainer && bottomChatContainer.classList.contains('active')) ? bottomChatInput : userInput;
        if (activeInput) {
            // activeInput.value = ''; // Temporarily removed to preserve text as requested
            activeInput.disabled = false;
            activeInput.style.height = 'auto';
            activeInput.style.height = (activeInput.scrollHeight) + 'px';
        }

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
        }
        if (bottomChatSendBtn) {
            bottomChatSendBtn.disabled = false;
            bottomChatSendBtn.style.opacity = '1';
        }

        clearDraft();
    }

    async function sendAiChatMessage(prompt) {
        if (!aiChatMessages) return;

        // Move input to bottom if it was centered
        if (bottomChatContainer) {
            bottomChatContainer.classList.remove('centered');
        }
        document.body.classList.remove('chat-initial-state');

        // Remove welcome screen if present
        const welcome = aiChatMessages.querySelector('.ai-chat-welcome');
        if (welcome) welcome.remove();

        // Add user message
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'ai-msg user-msg';
        
        let replyHTML = '';
        if (selectedMentionProduct) {
            replyHTML = `
                <div class="msg-reply-reference">
                    <img src="${selectedMentionProduct.image_url || ''}" alt="">
                    <div class="reply-ref-info">
                        <div class="reply-ref-title">${escapeHTML(selectedMentionProduct.title)}</div>
                    </div>
                </div>
            `;
        }

        userMsgDiv.innerHTML = `
            <div class="msg-content">
                ${replyHTML}
                <div class="msg-text">${escapeHTML(prompt)}</div>
            </div>
        `;
        aiChatMessages.appendChild(userMsgDiv);
        scrollToBottom();

        // Clear input
        if (bottomChatInput) {
            bottomChatInput.value = '';
            bottomChatInput.style.height = 'auto';
        }

        // Add thinking indicator
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'ai-msg ai-response-msg thinking';
        thinkingDiv.innerHTML = `<div class="msg-content"><i class="fa-solid fa-ellipsis fa-fade"></i> ${t('ai_thinking', "AI is thinking...")}</div>`;
        aiChatMessages.appendChild(thinkingDiv);
        scrollToBottom();

        const chatPayload = { prompt: prompt };
        if (selectedMentionProduct) {
            chatPayload.context_product = selectedMentionProduct;
            // Clear context after sending
            selectedMentionProduct = null;
            if (replyContext) replyContext.classList.remove('active');
        }



        try {
            const response = await fetch('/api/ai-chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(chatPayload)
            });

            const data = await response.json();
            thinkingDiv.remove();

            if (data.response) {
                const aiMsgDiv = document.createElement('div');
                aiMsgDiv.className = 'ai-msg ai-response-msg';
                aiMsgDiv.innerHTML = `<div class="msg-content">${formatAiMessage(data.response)}</div>`;
                aiChatMessages.appendChild(aiMsgDiv);
            } else {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'ai-msg ai-response-msg error';
                errorDiv.innerHTML = `<div class="msg-content">${t('error_try_again', 'An error occurred. Please try again.')}</div>`;
                aiChatMessages.appendChild(errorDiv);
            }
            scrollToBottom();
        } catch (error) {
            console.error('AI Chat Error:', error);
            thinkingDiv.remove();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ai-msg ai-response-msg error';
            errorDiv.innerHTML = `<div class="msg-content">${t('connection_lost', 'Connection with server lost.')}</div>`;
            aiChatMessages.appendChild(errorDiv);
            scrollToBottom();
        }
    }

    function formatAiMessage(text) {
        // Basic markdown-like formatting for AI responses
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
        return formatted;
    }

    function buildLoadingSkeleton() {
        return `
            <div class="search-results-layout">
                <div class="search-results-main">
                    <div class="sr-ai-summary">
                        <div class="sr-skeleton sr-skeleton-text w90"></div>
                        <div class="sr-skeleton sr-skeleton-text w75"></div>
                        <div class="sr-skeleton sr-skeleton-text w60"></div>
                    </div>
                </div>
                <div class="search-results-sidebar">
                    <div class="sr-price-viz">
                        <div class="sr-skeleton sr-skeleton-text w60"></div>
                        <div class="sr-skeleton sr-skeleton-text w90"></div>
                        <div class="sr-skeleton sr-skeleton-text w75"></div>
                    </div>
                </div>
            </div>
        `;
    }

    function formatPrice(price) {
        if (!price && price !== 0) return '';
        const num = parseFloat(price);
        if (isNaN(num)) return '';
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function renderSearchResults(data, prompt, duration) {
        const products = data.products || [];
        const sources = data.sources || {};

        // AI Summary mock text
        let aiSummary = t('search_summary_format', '"{prompt}" so\'rovi bo\'yicha {products_count} ta mahsulot topildi. Natijalar {sites_count} ta saytdan va {stores_count} ta do\'kondan to\'plangan. Narxlar turli manbalarda farq qilishi mumkin — eng yaxshi taklifni tanlash uchun narxlarni solishtiring.');
        aiSummary = aiSummary
            .replace('{prompt}', prompt)
            .replace('{products_count}', sources.products_count || products.length)
            .replace('{sites_count}', sources.sites_count || 0)
            .replace('{stores_count}', sources.stores_count || 0);

        // Top 3 products
        const topProducts = products.slice(0, 3);
        const remainingProducts = products.slice(3, 13);

        // Price calculations
        const prices = products.map(p => parseFloat(p.price)).filter(p => p > 0 && !isNaN(p));
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        // Determine dominant currency for price visualization
        const currencyCounts = {};
        products.forEach(p => { if (p.currency) { currencyCounts[p.currency] = (currencyCounts[p.currency] || 0) + 1; } });
        const dominantCurrency = Object.keys(currencyCounts).sort((a, b) => currencyCounts[b] - currencyCounts[a])[0] || t('som', "so'm");

        // Price distribution for bars
        const priceRanges = buildPriceRanges(prices, minPrice, maxPrice);

        // Links from all products
        const allLinks = products.filter(p => p.product_url).map(p => ({
            title: p.title || '',
            url: p.product_url,
            crawled_at: p.crawled_at || '',
            site: p.site_name || ''
        }));

        // Labels for source preview pills
        const sitesCount = sources.sites_count || 0;
        const sitesLabel = sitesCount === 1 ? t('site', 'site') : t('sites', 'sites');

        const storesCount = sources.stores_count || 0;
        const storesLabel = storesCount === 1 ? t('store', 'store') : t('stores', 'stores');

        const productsCount = sources.products_count || products.length;
        const productsLabel = productsCount === 1 ? t('product', 'product') : t('products', 'products');

        // Build left side
        let leftHTML = '';

        // AI Summary
        leftHTML += `
            <div class="sr-ai-summary">
                <div class="sr-ai-summary-text">${aiSummary}</div>
                <div class="sr-ai-action-row">
                    <div class="sr-source-preview">
                        <div class="sr-source-pill">
                            <i class="fa-solid fa-globe"></i>
                            <span>${sitesCount} ${sitesLabel}</span>
                        </div>
                        <div class="sr-source-pill">
                            <i class="fa-solid fa-shop"></i>
                            <span>${storesCount} ${storesLabel}</span>
                        </div>
                        <div class="sr-source-pill">
                            <i class="fa-solid fa-box-open"></i>
                            <span>${productsCount} ${productsLabel}</span>
                        </div>
                    </div>
                    <button class="sr-continue-btn" id="sr-continue-chat-btn">${t('continue_conversation', 'Continue conversation')}</button>
                </div>
            </div>
        `;

        // Top 3 product cards
        if (topProducts.length > 0) {
            leftHTML += '<div class="sr-top-cards">';
            topProducts.forEach(p => {
                leftHTML += buildTopCard(p);
            });
            leftHTML += '</div>';
        }

        // Remaining products grid
        if (remainingProducts.length > 0) {
            leftHTML += `<div class="sr-products-section-title">${t('all_results', 'All results')}</div>`;
            leftHTML += '<div class="sr-products-grid">';
            remainingProducts.forEach(p => {
                leftHTML += buildGridCard(p);
            });
            leftHTML += '</div>';
        }

        // Build right side
        let rightHTML = '';

        // Price visualization
        if (prices.length > 0) {
            rightHTML += `
                <div class="sr-price-viz">
                    <div class="sr-price-viz-title">${t('prices', 'Prices')} <span class="sr-price-currency-label">${dominantCurrency}</span></div>
                    <div class="sr-price-stats">
                        <div class="sr-price-stat">
                            <span class="sr-price-stat-value">${formatPrice(minPrice)}</span>
                            <span class="sr-price-stat-label">${t('min', 'Min')}</span>
                        </div>
                        <div class="sr-price-stat">
                            <span class="sr-price-stat-value">${formatPrice(avgPrice)}</span>
                            <span class="sr-price-stat-label">${t('average', 'Average')}</span>
                        </div>
                        <div class="sr-price-stat">
                            <span class="sr-price-stat-value">${formatPrice(maxPrice)}</span>
                            <span class="sr-price-stat-label">${t('max', 'Max')}</span>
                        </div>
                    </div>
                    <div class="sr-price-bars">
                        ${priceRanges.map(r => `
                            <div class="sr-price-bar-item">
                                <span class="sr-price-bar-label">${r.label}</span>
                                <div class="sr-price-bar-track">
                                    <div class="sr-price-bar-fill ${r.colorClass}" style="width: ${r.percent}%"></div>
                                </div>
                                <span class="sr-price-bar-count">${r.count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        // Links section
        if (allLinks.length > 0) {
            const defaultShow = 10;
            const hasMore = allLinks.length > defaultShow;

            rightHTML += `
                <div class="sr-links-section">
                    <div class="sr-links-title">
                        ${t('sources', 'Sources')} (${allLinks.length})
                        <span class="sr-links-collapse-btn" id="sr-collapse-links"><i class="fa-solid fa-xmark"></i></span>
                    </div>
                    <div class="sr-links-list ${hasMore ? 'collapsed' : ''}" id="sr-links-list">
                        ${allLinks.map((link, i) => `
                            <div class="sr-link-item" ${hasMore && i >= defaultShow ? 'style="display:none" data-hidden-link' : ''}>
                                <span class="sr-link-item-title">${escapeHTML(link.title)}</span>
                                <a href="${escapeHTML(link.url)}" target="_blank" rel="noopener" class="sr-link-item-url">${escapeHTML(link.url)}</a>
                                ${link.crawled_at ? `<span class="sr-link-item-meta">${timeAgo(link.crawled_at)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ${hasMore ? `<button class="sr-links-show-all" id="sr-show-all-links">${t('all', 'All')} (${allLinks.length})</button>` : ''}
                </div>
            `;
        }

        // Assemble
        chatContainer.innerHTML = `
            <div class="search-results-layout">
                <div class="search-results-main">${leftHTML}</div>
                <div class="search-results-sidebar">${rightHTML}</div>
            </div>
        `;
        
        // Update allTabContent whenever new results are rendered
        allTabContent = chatContainer.innerHTML;

        attachSearchResultsListeners();
    }

    function attachSearchResultsListeners() {
        // Event: Continue chat -> Ask AI tab
        const continueBtn = document.getElementById('sr-continue-chat-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                const askAiTab = document.getElementById('tab-fast-answer');
                if (askAiTab) askAiTab.click();
            });
        }

        // Event: Show all links
        const showAllBtn = document.getElementById('sr-show-all-links');
        const collapseBtn = document.getElementById('sr-collapse-links');
        const linksList = document.getElementById('sr-links-list');

        if (showAllBtn && linksList && collapseBtn) {
            showAllBtn.addEventListener('click', () => {
                linksList.classList.remove('collapsed');
                linksList.querySelectorAll('[data-hidden-link]').forEach(el => {
                    el.style.display = '';
                });
                linksList.style.maxHeight = '600px';
                linksList.style.overflowY = 'auto';
                showAllBtn.style.display = 'none';
                collapseBtn.style.display = 'inline-block';
            });

            collapseBtn.addEventListener('click', () => {
                linksList.classList.add('collapsed');
                linksList.querySelectorAll('[data-hidden-link]').forEach(el => {
                    el.style.display = 'none';
                });
                linksList.style.maxHeight = '';
                linksList.style.overflowY = '';
                showAllBtn.style.display = 'block';
                collapseBtn.style.display = 'none';
            });
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function buildTopCard(p) {
        const priceText = p.price ? formatPrice(p.price) : '';
        const oldPriceText = p.old_price ? formatPrice(p.old_price) : '';
        const imgSrc = p.image_url || '';
        const url = p.product_url || '#';
        const accuracyHtml = p.accuracy !== undefined && p.accuracy !== null ? `
            <div class="sr-accuracy-badge" title="${t('accuracy_title', 'Match accuracy')}">
                <i class="fa-solid fa-circle-check"></i>
                <span>${t('accuracy', 'Accuracy')}: ${p.accuracy}%</span>
            </div>
        ` : '';

        return `
            <div class="sr-top-card">
                <a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="sr-top-card-link">
                    <div class="sr-top-card-img">
                        ${imgSrc ? `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.title || '')}" loading="lazy">` : `<span>${t('no_image', 'No image')}</span>`}
                    </div>
                    <div class="sr-top-card-body">
                        ${accuracyHtml}
                        <div class="sr-top-card-title">${escapeHTML(p.title || '')}</div>
                        <div class="sr-top-card-price-row">
                            ${priceText ? `<span class="sr-top-card-price">${priceText} <span class="sr-price-currency">${p.currency || t('som', "so'm")}</span></span>` : ''}
                            ${oldPriceText && oldPriceText !== priceText ? `<span class="sr-top-card-old-price">${oldPriceText}</span>` : ''}
                        </div>
                        <div class="sr-top-card-seller">${escapeHTML(p.who_by || p.site_name || '')}</div>
                    </div>
                </a>
            </div>
        `;
    }

    function buildGridCard(p) {
        const priceText = p.price ? formatPrice(p.price) : '';
        const oldPriceText = p.old_price ? formatPrice(p.old_price) : '';
        const imgSrc = p.image_url || '';
        const url = p.product_url || '#';
        const accuracyHtml = p.accuracy !== undefined && p.accuracy !== null ? `
            <div class="sr-accuracy-badge" title="${t('accuracy_title', 'Match accuracy')}">
                <i class="fa-solid fa-circle-check"></i>
                <span>${t('accuracy', 'Accuracy')}: ${p.accuracy}%</span>
            </div>
        ` : '';

        return `
            <div class="sr-grid-card">
                <a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="sr-grid-card-link">
                    <div class="sr-grid-card-img">
                        ${imgSrc ? `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.title || '')}" loading="lazy">` : `<span>${t('no_image', 'No image')}</span>`}
                    </div>
                    <div class="sr-grid-card-body">
                        ${accuracyHtml}
                        <div class="sr-grid-card-title">${escapeHTML(p.title || '')}</div>
                        ${priceText ? `<span class="sr-grid-card-price">${priceText} <span class="sr-price-currency">${p.currency || t('som', "so'm")}</span></span>` : ''}
                        ${oldPriceText && oldPriceText !== priceText ? `<span class="sr-grid-card-old-price">${oldPriceText}</span>` : ''}
                        <div class="sr-grid-card-seller">${escapeHTML(p.who_by || p.site_name || '')}</div>
                    </div>
                </a>
            </div>
        `;
    }

    function buildPriceRanges(prices, minPrice, maxPrice) {
        if (prices.length === 0) return [];

        const range = maxPrice - minPrice;
        if (range === 0) {
            return [{
                label: formatPrice(minPrice),
                count: prices.length,
                percent: 100,
                colorClass: 'low'
            }];
        }

        const step = range / 4;
        const ranges = [];
        const classes = ['low', 'low', 'mid', 'high'];

        for (let i = 0; i < 4; i++) {
            const from = minPrice + (step * i);
            const to = i === 3 ? maxPrice + 1 : minPrice + (step * (i + 1));
            const count = prices.filter(p => p >= from && p < to).length;
            ranges.push({
                label: `${formatPrice(from)} - ${formatPrice(to > maxPrice ? maxPrice : to)}`,
                count: count,
                percent: prices.length > 0 ? Math.round((count / prices.length) * 100) : 0,
                colorClass: classes[i]
            });
        }

        return ranges;
    }

    function timeAgo(date) {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date; // Return original if invalid

        const seconds = Math.floor((new Date() - d) / 1000);
        if (seconds < 60) return t('just_now', 'Just now');

        const intervals = {
            year: 31536000,
            month: 2592000,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (let unit in intervals) {
            const count = Math.floor(seconds / intervals[unit]);
            if (count >= 1) {
                const isUz = t('ago', 'ago') !== 'ago';
                if (isUz) {
                    const uzUnits = {
                        year: 'yil',
                        month: 'oy',
                        day: 'kun',
                        hour: 'soat',
                        minute: 'daqiqa'
                    };
                    return `${count} ${uzUnits[unit]} ${t('ago', 'oldin')}`;
                } else {
                    return `${count} ${unit}${count > 1 ? 's' : ''} ${t('ago', 'ago')}`;
                }
            }
        }
        return t('recently', 'Recently');
    }

    sendBtn.addEventListener('click', () => {
        const mode = sendBtn.dataset.mode;

        if (mode === 'edit') {
            userInput.readOnly = false;
            userInput.focus();

            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';

            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.dataset.mode = 'send';

        } else {
            sendMessage();
        }
    });

    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (bottomChatInput) {
        bottomChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        bottomChatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    if (bottomChatSendBtn) {
        bottomChatSendBtn.addEventListener('click', () => {
            sendMessage();
        });
    }


    // scrollToBottom();

    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            conversationIdInput.value = '';
            chatContainer.innerHTML = `
                <div class="welcome-screen" style="text-align: center; margin-top: 10vh;">
                    <h1>${t('welcome_h1', 'How can I help you explore products today?')}</h1>
                    <p style="color: var(--text-muted); margin-top: 10px;">${t('welcome_p', 'Ask about laptops, accessories, or any gadgets.')}</p>
                </div>
            `;
            const newUrl = '/new/';
            window.history.pushState({ path: newUrl }, '', newUrl);

            userInput.value = '';
            userInput.readOnly = false;
            userInput.style.height = 'auto';

            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.dataset.mode = 'send';

            userInput.focus();

            document.querySelectorAll('.history-list li').forEach(li => li.classList.remove('active'));
            if (window.innerWidth <= 768) {
            }
        });
    }

    chatContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-msg-btn');
        if (editBtn) {
            currentEditingMessageId = editBtn.dataset.messageId;

            const messageContentDiv = editBtn.closest('.message-content');
            const clone = messageContentDiv.cloneNode(true);
            const actions = clone.querySelector('.message-actions');
            if (actions) actions.remove();

            const reasoning = clone.querySelector('.reasoning-container');
            if (reasoning) reasoning.remove();

            const text = clone.textContent.trim();
            userInput.value = text;
            userInput.focus();
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
        }
    });

    window.addEventListener('popstate', (event) => {
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('chat_id');
        if (id) {
            loadConversation(id);
        } else if (newChatBtn) {
            newChatBtn.click();
        }
    });

    function deleteChat(chatId) {
        currentChatId = chatId;
        openModal(deleteModal);
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

    if (mobilePlusBtn && mobileActionsPopover) {
        mobilePlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileActionsPopover.classList.toggle('show');
            mobilePlusBtn.classList.toggle('active', isOpen);
        });

        document.addEventListener('click', (e) => {
            if (!mobileActionsPopover.contains(e.target) && !mobilePlusBtn.contains(e.target)) {
                mobileActionsPopover.classList.remove('show');
                mobilePlusBtn.classList.remove('active');
            }
        });

        mobileActionsPopover.addEventListener('click', (e) => {
            const item = e.target.closest('.popover-item');
            if (item) {
                const action = item.dataset.action;
                const btn = getActionBtn(action);
                if (btn) btn.click();

                mobileActionsPopover.classList.remove('show');
                mobilePlusBtn.classList.remove('active');

                syncActiveTogglesMobile();
            }
        });
    }

    if (activeTogglesMobile) {
        activeTogglesMobile.addEventListener('click', (e) => {
            const tag = e.target.closest('.active-tag');
            if (tag) {
                const action = tag.dataset.action;
                const btn = getActionBtn(action);
                if (btn) btn.click();
                syncActiveTogglesMobile();
            }
        });
    }

    [btnDiscount, btnAgentMode, btnImageSearch, btnFilter].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                setTimeout(syncActiveTogglesMobile, 50);
            });
        }
    });

    setTimeout(syncActiveTogglesMobile, 500);
    const alertBtn = document.getElementById('alert-btn');
    const tabAlert = document.getElementById('tab-alert');
    const tabAll = document.getElementById('tab-all');

    if (alertBtn) {
        alertBtn.addEventListener('click', async () => {
            if (!lastResponseData || !lastResponseData.prompt) {
                alert(t('please_search_first', 'Please search something first.'));
                return;
            }

            alertBtn.disabled = true;

            try {
                // Save to database via /api/chat/save/
                const saveResponse = await fetch('/api/chat/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify({
                        prompt: lastResponseData.prompt,
                        response: lastResponseData.response || '',
                        reasoning_steps: lastResponseData.reasoning_steps || [],
                        products: lastResponseData.products || []
                    })
                });

                const saveData = await saveResponse.json();

                if (saveData.status === 'success') {
                    // Also save to localStorage for alerts tab
                    const alerts = JSON.parse(localStorage.getItem('saved_alerts') || '[]');
                    const newAlert = {
                        id: Date.now(),
                        timestamp: new Date().toISOString(),
                        prompt: lastResponseData.prompt,
                        products: lastResponseData.products || [],
                        response: lastResponseData.response || '',
                        conversation_id: saveData.conversation_id
                    };
                    alerts.unshift(newAlert);
                    localStorage.setItem('saved_alerts', JSON.stringify(alerts));

                    // If currently on Alerts tab, refresh immediately
                    if (tabAlert && tabAlert.classList.contains('active')) {
                        window.renderSavedAlerts();
                    }

                    alertBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #22c55e;"></i>';

                    // Trigger Mock Social Alert
                    if (window.sendAlertToSocialMedia) {
                        window.sendAlertToSocialMedia(newAlert);
                    }

                    setTimeout(() => {
                        alertBtn.innerHTML = '<i class="fa-regular fa-bell"></i>';
                    }, 2000);
                } else {
                    alert(t('save_error', 'Save Error'));
                }
            } catch (err) {
                console.error('Save error:', err);
                alert(t('save_error', 'Save Error'));
            }

            alertBtn.disabled = false;
        });
    }

    // Removed redundant and conflicting tab switching logic that cleared results

    window.renderSavedAlerts = function () {
        const alerts = JSON.parse(localStorage.getItem('saved_alerts') || '[]');

        if (alerts.length === 0) {
            chatContainer.innerHTML = `
                <div class="alerts-page-container">
                    <div class="alerts-empty-full">
                        <div class="alerts-empty-icon-wrapper">
                            <i class="fa-regular fa-bell-slash"></i>
                        </div>
                        <h3>${t('no_alerts_saved', 'No alerts saved yet')}</h3>
                        <p>${t('save_alerts_desc', 'Save search results using the bell button.')}</p>
                        <div class="alerts-empty-hint">
                            <i class="fa-regular fa-lightbulb"></i>
                            ${t('save_alerts_hint', 'Press the 🔔 button to save the search result')}
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        chatContainer.innerHTML = `
            <div class="alerts-page-container">
                <div class="alerts-sidebar">
                    <div class="alerts-sidebar-header">
                        <div class="alerts-sidebar-header-left">
                            <div class="alerts-sidebar-icon"><i class="fa-solid fa-bookmark"></i></div>
                            <div>
                                <div class="alerts-sidebar-title">${t('alerts_history', 'Alerts History')}</div>
                            </div>
                        </div>
                        <span class="alerts-count-badge">${alerts.length}</span>
                    </div>
                    <div class="alerts-search-bar">
                        <i class="fa-solid fa-magnifying-glass alerts-search-icon"></i>
                        <input type="text" class="alerts-search-input" id="alerts-search-input" placeholder="${t('search_alerts_placeholder', 'Search alerts history')}" />
                    </div>
                    <div class="alerts-list-container" id="alerts-list"></div>
                </div>
                <div class="alert-detail-view" id="alert-detail">
                    <div class="alert-detail-empty">
                        <div class="alert-detail-empty-icon">
                            <i class="fa-regular fa-hand-pointer"></i>
                        </div>
                        <h3>${t('for_more_details', 'For more details')}</h3>
                        <p> ${t('select_alert_hint', 'Select any alert history on the left')} </p>
                    </div>
                </div>
            </div>
        `;

        const listContainer = document.getElementById('alerts-list');
        const detailContainer = document.getElementById('alert-detail');
        const searchInput = document.getElementById('alerts-search-input');

        function renderAlertsList(filterText) {
            listContainer.innerHTML = '';
            const filtered = filterText
                ? alerts.filter(a => a.prompt.toLowerCase().includes(filterText.toLowerCase()))
                : alerts;

            if (filtered.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 2rem 1rem; color: #475569;">
                        <i class="fa-solid fa-search" style="font-size: 1.5rem; margin-bottom: 0.75rem; opacity: 0.4;"></i>
                        <p style="font-size: 0.9rem;">${t('no_results_found', 'No results found')}</p>
                    </div>
                `;
                return;
            }

            filtered.forEach(alert => {
                const date = new Date(alert.timestamp).toLocaleString('uz-UZ', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const item = document.createElement('div');
                item.className = 'alert-item';
                item.dataset.alertId = alert.id;
                item.innerHTML = `
                    <div class="alert-item-header">
                        <div class="alert-item-prompt">${alert.prompt}</div>
                        <button class="delete-alert-small" title="${t('delete', 'Delete')}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="alert-item-time"><i class="fa-regular fa-clock"></i> ${date}</div>
                `;

                item.addEventListener('click', (e) => {
                    const delSmallBtn = e.target.closest('.delete-alert-small');
                    if (delSmallBtn) {
                        e.stopPropagation();
                        window.deleteAlert(alert.id);
                        return;
                    }

                    document.querySelectorAll('.alert-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    renderAlertDetail(alert);

                    // Mobile behavior: Show detail view
                    const pageContainer = document.querySelector('.alerts-page-container');
                    if (pageContainer) {
                        pageContainer.classList.add('mobile-detail-active');
                    }
                });

                listContainer.appendChild(item);
            });
        }

        // Initial render
        renderAlertsList('');

        // Search functionality
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                renderAlertsList(this.value.trim());
            });
        }

        function renderAlertDetail(alert) {
            const dateFull = new Date(alert.timestamp).toLocaleString('uz-UZ', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });


            detailContainer.innerHTML = `
                <div class="alert-detail-content-wrapper">
                    <div class="mobile-sticky-header">
                        <button class="mobile-back-btn" id="mobile-alert-back">
                            <i class="fa-solid fa-chevron-left"></i> ${t('back', 'Back')}
                        </button>
                    </div>
                    <div class="alert-detail-header">
                        <div style="width: 100%;">
                            <div class="alert-detail-header-info">
                                <div class="alert-detail-title-wrapper">
                                    <input type="text" id="alert-prompt-input" class="alert-detail-title-input" value="${alert.prompt.replace(/"/g, '&quot;')}" readonly>
                                    <button class="edit-prompt-btn" id="edit-alert-prompt-btn" title="Edit">
                                        <i class="fa-solid fa-pen"></i>
                                    </button>
                                </div>
                                <div class="alert-detail-meta">
                                    <span class="alert-detail-meta-item"><i class="fa-regular fa-calendar"></i> ${dateFull}</span>
                                    <span class="alert-detail-meta-item"><i class="fa-solid fa-hashtag"></i> ID: ${alert.id.toString().slice(-6)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="alert-detail-actions">
                            <button class="alert-action-btn alert-action-btn-search" title="${t('try_again_discovery', 'Try again discovery')}" id="re-search-btn">
                                <i class="fa-solid fa-magnifying-glass"></i> ${t('rediscovery', 'Rediscovery')}
                            </button>
                            <button class="alert-action-btn alert-action-btn-delete" id="delete-alert-btn">
                                <i class="fa-regular fa-trash-can"></i> ${t('delete', 'Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const delBtn = document.getElementById('delete-alert-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.deleteAlert(alert.id);
                });
            }

            const reSearchBtn = document.getElementById('re-search-btn');
            if (reSearchBtn) {
                reSearchBtn.addEventListener('click', () => {
                    const tabAllBtn = document.getElementById('tab-all');
                    if (tabAllBtn) tabAllBtn.click();
                    if (userInput) {
                        userInput.value = alert.prompt;
                        userInput.focus();
                        userInput.style.height = 'auto';
                        userInput.style.height = (userInput.scrollHeight) + 'px';
                    }
                });
            }

            const editPromptBtn = document.getElementById('edit-alert-prompt-btn');
            const promptInput = document.getElementById('alert-prompt-input');
            if (editPromptBtn && promptInput) {
                const icon = editPromptBtn.querySelector('i');
                let isEditing = false;

                const savePrompt = () => {
                    promptInput.setAttribute('readonly', 'true');
                    promptInput.classList.remove('editing');
                    icon.classList.remove('fa-check');
                    icon.classList.add('fa-pen');
                    isEditing = false;

                    if (alert.prompt !== promptInput.value) {
                        alert.prompt = promptInput.value;
                        const sidebarItemPrompt = document.querySelector(`.alert-item[data-alert-id="${alert.id}"] .alert-item-prompt`);
                        if (sidebarItemPrompt) {
                            sidebarItemPrompt.textContent = alert.prompt;
                        }
                    }
                };

                editPromptBtn.addEventListener('click', () => {
                    if (!isEditing) {
                        promptInput.removeAttribute('readonly');
                        promptInput.focus();
                        promptInput.classList.add('editing');
                        icon.classList.remove('fa-pen');
                        icon.classList.add('fa-check');
                        isEditing = true;
                    } else {
                        savePrompt();
                    }
                });

                promptInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        savePrompt();
                    }
                });
            }

            const mobileBackBtn = document.getElementById('mobile-alert-back');
            if (mobileBackBtn) {
                mobileBackBtn.addEventListener('click', () => {
                    const pageContainer = document.querySelector('.alerts-page-container');
                    if (pageContainer) pageContainer.classList.remove('mobile-detail-active');
                });
            }
        }
    }
    // Auth Interceptor
    document.addEventListener('click', (e) => {
        // Find closest element with auth-required class
        const target = e.target.closest('.auth-required');

        if (target) {
            // Check global auth state
            // It should be boolean true/false from base.html injection
            if (window.isAuthenticated === false) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Just to be sure

                const authModal = document.getElementById('auth-modal-overlay');
                if (authModal) {
                    authModal.classList.add('active');
                }
            }
        }
    }, true); // Capture phase to intercept before any other listener

    // Auth Modal Controls
    const authModalClose = document.getElementById('auth-modal-close');
    const authModalOverlay = document.getElementById('auth-modal-overlay');

    if (authModalClose) {
        authModalClose.addEventListener('click', () => {
            if (authModalOverlay) authModalOverlay.classList.remove('active');
        });
    }

    if (authModalOverlay) {
        authModalOverlay.addEventListener('click', (e) => {
            if (e.target === authModalOverlay) {
                authModalOverlay.classList.remove('active');
            }
        });
    }

    // Settings Modal Logic
    const settingsModalOverlay = document.getElementById('settings-modal-overlay');
    const settingsClose = document.getElementById('settings-close');
    const settingsTriggers = document.querySelectorAll('.btn-settings');
    const settingsNavItems = document.querySelectorAll('.settings-nav-item');
    const settingsSections = document.querySelectorAll('.settings-section');
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    // Open Settings
    settingsTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (settingsModalOverlay) settingsModalOverlay.classList.add('active');

            // Close profile dropdown if open
            const profileDropdown = document.getElementById('profile-dropdown');
            const landingProfileDropdown = document.getElementById('landing-profile-dropdown');
            if (profileDropdown) profileDropdown.classList.remove('show');
            if (landingProfileDropdown) landingProfileDropdown.classList.remove('show');
        });
    });

    // Close Settings
    // Close Settings
    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            settingsModalOverlay.classList.remove('active');
        });
    }

    const settingsCloseTop = document.getElementById('settings-close-top');
    if (settingsCloseTop) {
        settingsCloseTop.addEventListener('click', () => {
            if (settingsModalOverlay) settingsModalOverlay.classList.remove('active');
        });
    }

    if (settingsModalOverlay) {
        settingsModalOverlay.addEventListener('click', (e) => {
            if (e.target === settingsModalOverlay) {
                settingsModalOverlay.classList.remove('active');
            }
        });
    }

    // Navigation Switching
    settingsNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;

            // Update nav active state
            settingsNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update section visibility
            settingsSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `section-${target}`) {
                    section.classList.add('active');
                }
            });
        });
    });

    // Dark Mode Toggle
    if (darkModeToggle) {
        // Initial state
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            darkModeToggle.checked = true;
        }

        darkModeToggle.addEventListener('change', () => {
            if (darkModeToggle.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // Color Presets
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const color = dot.dataset.color;
            document.documentElement.style.setProperty('--primary', color);

            colorDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');

            localStorage.setItem('accentColor', color);
        });
    });

    // Load initial accent color
    const savedColor = localStorage.getItem('accentColor');
    if (savedColor) {
        document.documentElement.style.setProperty('--primary', savedColor);
        colorDots.forEach(dot => {
            if (dot.dataset.color === savedColor) {
                colorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
            }
        });
    }

    // Language Switcher Logic
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        // Load saved language
        const savedLang = localStorage.getItem('language') || 'en';
        languageSelect.value = savedLang;

        languageSelect.addEventListener('change', () => {
            const selectedLang = languageSelect.value;
            localStorage.setItem('language', selectedLang);
            console.log(`Language changed to: ${selectedLang}`);
            
            // Submit form to Django's setlang view
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/i18n/setlang/';

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfmiddlewaretoken';
            csrfInput.value = getCookie('csrftoken') || '';
            form.appendChild(csrfInput);

            const langInput = document.createElement('input');
            langInput.type = 'hidden';
            langInput.name = 'language';
            langInput.value = selectedLang;
            form.appendChild(langInput);

            const nextInput = document.createElement('input');
            nextInput.type = 'hidden';
            nextInput.name = 'next';
            nextInput.value = window.location.pathname;
            form.appendChild(nextInput);

            document.body.appendChild(form);
            form.submit();
        });
    }

    // Social Media Alerts Logic
    const socialToggles = [
        { id: 'toggle-telegram', key: 'alert_telegram', name: 'Telegram' },
        { id: 'toggle-whatsapp', key: 'alert_whatsapp', name: 'WhatsApp' },
        { id: 'toggle-discord', key: 'alert_discord', name: 'Discord' },
        { id: 'toggle-email', key: 'alert_email', name: 'Email' }
    ];

    socialToggles.forEach(toggle => {
        const el = document.getElementById(toggle.id);
        if (el) {
            // Load saved state
            el.checked = localStorage.getItem(toggle.key) === 'true';

            el.addEventListener('change', () => {
                localStorage.setItem(toggle.key, el.checked);
                console.log(`${toggle.name} alert toggled: ${el.checked}`);
            });
        }
    });

    window.sendAlertToSocialMedia = function (alertData) {
        const enabledPlatforms = socialToggles.filter(t => localStorage.getItem(t.key) === 'true');

        if (enabledPlatforms.length > 0) {
            const platformNames = enabledPlatforms.map(p => p.name).join(', ');
            console.log(`Sending alert for prompt "${alertData.prompt}" to: ${platformNames}`);

            // Show feedback
            const feedback = document.createElement('div');
            feedback.className = 'alert-feedback-toast';
            feedback.innerHTML = `<i class="fa-solid fa-paper-plane"></i>${t('alert_turned_on', 'Alert turned on for')} ${platformNames}`;
            feedback.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                animation: slideInRight 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 500;
            `;

            // Add animation keyframes if not exists
            if (!document.getElementById('toast-style')) {
                const style = document.createElement('style');
                style.id = 'toast-style';
                style.textContent = `
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes fadeOut {
                        to { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(feedback);

            setTimeout(() => {
                feedback.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => feedback.remove(), 500);
            }, 3000);
        } else {
            console.log('No social media platforms enabled for alerts.');
        }
    };

    // Monitoring Popup Logic
    const monitoringBtn = document.getElementById('btn-monitoring');
    const monitoringPopup = document.getElementById('monitoring-popup');
    const monitoringClose = document.getElementById('monitoring-close');

    function updateMonitoringStats() {
        if (!monitoringPopup) return;

        const emptyState = document.getElementById('mon-empty-state');
        const sections = monitoringPopup.querySelectorAll('.mon-chart-section');

        if (!lastResponseData || !lastResponseData.products || lastResponseData.products.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            sections.forEach(el => el.style.display = 'none');
            document.getElementById('mon-total').innerText = '0';
            document.getElementById('mon-discounted').innerText = '0';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        sections.forEach(el => el.style.display = 'flex');

        const products = lastResponseData.products;
        const total = products.length;
        let drops = 0;
        let increases = 0;
        let stable = 0;

        products.forEach(p => {
            const oldPrice = parseFloat(p.old_price) || 0;
            const currentPrice = parseFloat(p.price) || 0;

            if (oldPrice > 0 && currentPrice > 0) {
                if (currentPrice < oldPrice) {
                    drops++;
                } else if (currentPrice > oldPrice) {
                    increases++;
                } else {
                    stable++;
                }
            } else if (currentPrice > 0) {
                // If only current price exists, assume stable or new
                stable++;
            } else {
                // No price info
                stable++;
            }
        });

        // Update Text
        document.getElementById('mon-total').innerText = total;
        document.getElementById('mon-discounted').innerText = drops;

        // Calculate Percentages
        const pDrops = total > 0 ? Math.round((drops / total) * 100) : 0;
        const pIncreases = total > 0 ? Math.round((increases / total) * 100) : 0;
        const pStable = total > 0 ? Math.round((stable / total) * 100) : 0;

        // Update Bars
        document.getElementById('bar-drops').style.width = `${pDrops}%`;
        document.getElementById('label-drops').innerText = `${pDrops}%`; // Missing element in HTML? Checked

        // I noticed I used label-drops in HTML but I might have missed label-increases/stable.
        // Wait, my HTML insert had them. Let's verify.

        const elIncreases = document.getElementById('label-increases');
        if (elIncreases) elIncreases.innerText = `${pIncreases}%`;
        document.getElementById('bar-increases').style.width = `${pIncreases}%`;

        const elStable = document.getElementById('label-stable');
        if (elStable) elStable.innerText = `${pStable}%`;
        document.getElementById('bar-stable').style.width = `${pStable}%`;
    }

    if (monitoringBtn && monitoringPopup) {
        monitoringBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (monitoringPopup.classList.contains('show')) {
                monitoringPopup.classList.remove('show');
            } else {
                console.log('Opening monitoring stats');
                updateMonitoringStats();
                monitoringPopup.classList.add('show');
            }
        });

        if (monitoringClose) {
            monitoringClose.addEventListener('click', () => {
                monitoringPopup.classList.remove('show');
            });
        }

        document.addEventListener('click', (e) => {
            if (!monitoringPopup.contains(e.target) && !monitoringBtn.contains(e.target)) {
                monitoringPopup.classList.remove('show');
            }
        });
    }

});

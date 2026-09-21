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
    const chatClearBtn = document.getElementById('chat-clear-btn');
    const chatPlusBtn = document.getElementById('chat-plus-btn');
    const chatDropdown = document.getElementById('chat-dropdown');
    const chatSearchTagsContainer = document.getElementById('chat-search-tags');
    const chatFileInput = document.getElementById('chat-attach-file-input');
    
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

    // Search tab: the ranked list is paged server-side, search_id pins it so rows never shift.
    let searchState = { query: '', page: 1, searchId: '' };
    // Agent tab: the transcript travels with every message as the authoritative
    // copy; the session id lets the server keep its own short memory alongside it.
    let chatHistory = [];
    const MAX_CHAT_HISTORY = 40;
    const MAX_CITATIONS = 8;

    /** Stable per-browser id for the server-side conversation memory.
     *  The server keeps the last 10 messages for an hour, so this is context,
     *  not an archive — losing it costs nothing. */
    const SESSION_KEY = 'findle.chat.session';
    let chatSessionId = (function () {
        try {
            const saved = localStorage.getItem(SESSION_KEY);
            if (saved) return saved;
        } catch (e) { /* private mode, or storage blocked */ }
        const fresh = 'w-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        try { localStorage.setItem(SESSION_KEY, fresh); } catch (e) { /* not fatal */ }
        return fresh;
    })();

    /** Start a new conversation locally: a fresh id is all the server needs. */
    function resetChatSession() {
        chatSessionId = 'w-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        try { localStorage.setItem(SESSION_KEY, chatSessionId); } catch (e) { /* not fatal */ }
    }

    /** A yes/no dialog for destructive actions.
     *  Its own node rather than the alert-delete modal, which carries that
     *  flow's own state; the classes are shared so the styling stays one thing. */
    function showConfirm({ title, text, confirmLabel, onConfirm }) {
        let overlay = document.getElementById('generic-confirm-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'alert-modal-overlay';
            overlay.id = 'generic-confirm-modal';
            overlay.innerHTML = `
                <div class="alert-modal-box">
                    <div class="alert-modal-icon"><i class="fa-regular fa-trash-can"></i></div>
                    <div class="alert-modal-title"></div>
                    <div class="alert-modal-text"></div>
                    <div class="alert-modal-actions">
                        <button class="alert-modal-btn alert-modal-btn-cancel" data-confirm-cancel></button>
                        <button class="alert-modal-btn alert-modal-btn-confirm" data-confirm-ok></button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        overlay.querySelector('.alert-modal-title').textContent = title || '';
        overlay.querySelector('.alert-modal-text').textContent = text || '';
        const okBtn = overlay.querySelector('[data-confirm-ok]');
        const cancelBtn = overlay.querySelector('[data-confirm-cancel]');
        okBtn.textContent = confirmLabel || t('confirm', 'Confirm');
        cancelBtn.textContent = t('cancel', 'Cancel');

        const close = () => {
            overlay.classList.remove('show');
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };

        // Fresh handlers each time, so an earlier caller's callback cannot fire.
        okBtn.onclick = () => { close(); if (onConfirm) onConfirm(); };
        cancelBtn.onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        document.addEventListener('keydown', onKey);

        overlay.classList.add('show');
    }

    /** The bin only earns its place in the input once there is something to bin. */
    function updateClearButton() {
        if (!chatClearBtn) return;
        const hasThread = !!(aiChatMessages && aiChatMessages.querySelector('.ai-msg'));
        chatClearBtn.hidden = !hasThread;
    }

    /** Forget the conversation: the server's copy, the replayed transcript and
     *  the thread on screen. A fresh session id means the next message starts
     *  clean even if the delete never reached the API. */
    async function clearConversation() {
        const sessionId = chatSessionId;

        if (chatClearBtn) chatClearBtn.disabled = true;
        try {
            await fetch(`/api/chat/memory/${encodeURIComponent(sessionId)}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCookie('csrftoken') }
            });
        } catch (e) {
            // The local reset below still gives the user a clean slate.
            console.warn('Could not clear server memory', e);
        }
        if (chatClearBtn) chatClearBtn.disabled = false;

        resetChatSession();
        chatHistory = [];
        answerSets.clear();

        if (aiChatMessages) {
            aiChatMessages.innerHTML = `<div class="ai-chat-welcome"><h2>${t('chat_with_findle', 'Chat with Findle AI')}</h2></div>`;
        }
        if (bottomChatContainer) {
            bottomChatContainer.classList.add('centered');
            document.body.classList.add('chat-initial-state');
        }
        updateClearButton();
    }

    /** Read an SSE response frame by frame, calling onEvent(name, data) for each.
     *  Written against the response body rather than EventSource because these
     *  are POSTs, and EventSource can only issue GETs. */
    async function readEventStream(response, onEvent) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Frames are separated by a blank line; keep the trailing partial.
            let split;
            while ((split = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, split);
                buffer = buffer.slice(split + 2);

                let name = 'message';
                const dataLines = [];
                frame.split('\n').forEach(line => {
                    line = line.replace(/\r$/, '');
                    if (line.startsWith('event:')) name = line.slice(6).trim();
                    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
                });
                if (!dataLines.length) continue;
                try {
                    onEvent(name, JSON.parse(dataLines.join('\n')));
                } catch (e) {
                    console.warn('Bad SSE frame', e);
                }
            }
        }
    }
    // Each answer keeps the listing set it cited, so older citations still resolve after new searches.
    const answerSets = new Map();
    let answerSetSeq = 0;

    const aiChatContainer = document.getElementById('ai-chat-container');
    const aiChatMessages = document.getElementById('ai-chat-messages');

    /* ---------------------------------------------------------------
       The Agent thread outlives the page. localStorage holds both the
       rendered transcript — so answers, citations and suggestions come
       back exactly as they were — and the plain-text history that is
       replayed to the API with the next message.
       --------------------------------------------------------------- */
    const TRANSCRIPT_KEY = 'findle.chat.transcript';
    const HISTORY_KEY = 'findle.chat.history';
    const CITE_SEQ_KEY = 'findle.chat.citeseq';

    /** Persist the thread as it should come back: the welcome screen is
     *  scaffolding and an in-flight bubble is not an answer, so neither is
     *  part of what gets stored. */
    function saveChatThread() {
        if (!aiChatMessages) return;

        const copy = aiChatMessages.cloneNode(true);
        copy.querySelectorAll('.ai-msg.thinking, .ai-chat-welcome').forEach(el => el.remove());

        try {
            if (!copy.querySelector('.ai-msg')) {
                [TRANSCRIPT_KEY, HISTORY_KEY, CITE_SEQ_KEY].forEach(key => localStorage.removeItem(key));
                return;
            }
            localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
            localStorage.setItem(CITE_SEQ_KEY, String(answerSetSeq));

            // A long run of listing answers can outgrow the quota. The recent
            // exchanges are the ones worth keeping, so shed from the top until
            // it fits rather than losing the thread altogether.
            for (;;) {
                try {
                    localStorage.setItem(TRANSCRIPT_KEY, copy.innerHTML);
                    return;
                } catch (e) {
                    const oldest = copy.querySelector('.ai-msg');
                    if (!oldest || copy.querySelectorAll('.ai-msg').length <= 2) throw e;
                    oldest.remove();
                }
            }
        } catch (e) {
            // Private mode, blocked storage, or still too large: the thread on
            // screen is unaffected, only its survival past this page is.
            console.warn('Could not save the chat thread', e);
        }
    }

    /** Put the saved thread back, so the Agent tab opens where it was left. */
    function restoreChatThread() {
        if (!aiChatMessages) return;

        let markup = '';
        let saved = null;
        let seq = 0;
        try {
            markup = localStorage.getItem(TRANSCRIPT_KEY) || '';
            saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            seq = parseInt(localStorage.getItem(CITE_SEQ_KEY) || '0', 10);
        } catch (e) {
            return; // Nothing to restore is the same as no storage at all.
        }
        if (!markup) return;

        aiChatMessages.innerHTML = markup;
        if (Array.isArray(saved)) chatHistory = saved.slice(-MAX_CHAT_HISTORY);

        // The listing sets behind the restored citations did not survive the
        // reload, so number new answers above them instead of reusing — and
        // hijacking — the markers the old ones still point at.
        if (seq > 0) answerSetSeq = seq;

        // A thread is already on screen, so the input belongs at the bottom.
        if (bottomChatContainer) bottomChatContainer.classList.remove('centered');
        document.body.classList.remove('chat-initial-state');
    }

    restoreChatThread();

    if (aiChatMessages) {
        // One observer instead of a call at every point that touches the thread —
        // answers also arrive from the Search tab handing one over.
        new MutationObserver(() => {
            updateClearButton();
            saveChatThread();
        }).observe(aiChatMessages, { childList: true });
        updateClearButton();
    }

    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirm({
                title: t('clear_conversation_q', 'Clear this conversation?'),
                text: t('clear_conversation_text', 'The messages and what the assistant remembers are deleted. Your search results stay.'),
                confirmLabel: t('clear', 'Clear'),
                onConfirm: clearConversation
            });
        });
    }


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
                if (id === 'chat-btn-attach-file' && chatFileInput) chatFileInput.value = '';
            });
            return tag;
        };

        if (chatFileInput) {
            chatFileInput.addEventListener('change', (e) => {
                if (chatFileInput.files && chatFileInput.files[0]) {
                    const fileName = chatFileInput.files[0].name;
                    const id = 'chat-btn-attach-file';
                    const option = document.getElementById(id);
                    let existingTag = chatSearchTagsContainer.querySelector(`.search-tag[data-id="${id}"]`);
                    if (existingTag) existingTag.remove();
                    const tag = createChatTag(`${t('file_prefix', 'File')}: ${fileName}`, id);
                    chatSearchTagsContainer.appendChild(tag);
                    if (option) option.classList.add('active');
                }
            });
        }

        chatOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = option.id;

                if (id === 'chat-btn-attach-file') {
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

            if (mainContent) tabScrollMemory[activeTabId] = mainContent.scrollTop;
            const landing = pendingScroll;
            pendingScroll = null;

            // If switching FROM 'tab-all' to another tab, save current results content
            const activeTabAll = document.querySelector('#tab-all.active');
            if (activeTabAll && id !== 'tab-all') {
                allTabContent = chatContainer.innerHTML;
            }

            // Remove active from all tabs
            searchTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (id === 'tab-fast-answer') {
                tab.classList.remove('has-unread');
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

            activeTabId = id;
            const resume = tabScrollMemory[id] || 0;
            applyScroll(() => (landing ? landing() : scrollMainTo(resume)));
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

    /* ---------------------------------------------------------------
       Both tabs scroll inside .main-content, so each keeps its own
       offset and a programmatic switch says where it wants to land.
       --------------------------------------------------------------- */
    const tabScrollMemory = {};
    let activeTabId = 'tab-all';
    let pendingScroll = null;

    function scrollMainTo(top) {
        if (mainContent) mainContent.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    }

    /** Switching tabs animates .content-area's padding for 300ms, which moves the scroll target
     *  underneath us — so place the scroll once now and again once the layout has settled. */
    function applyScroll(place) {
        requestAnimationFrame(place);
        setTimeout(place, 340);
    }

    /** Height of whatever is pinned over the content, so a target isn't hidden behind it. */
    function stickyOffset() {
        if (!mainContent) return 0;
        return ['.topbar', '.topbar-search-tabs-container'].reduce((total, selector) => {
            const el = mainContent.querySelector(selector);
            const pinned = el && getComputedStyle(el).position === 'sticky';
            return pinned ? total + el.offsetHeight : total;
        }, 12);
    }

    function scrollToElement(el) {
        if (!mainContent || !el) return;
        const top = el.getBoundingClientRect().top - mainContent.getBoundingClientRect().top + mainContent.scrollTop;
        scrollMainTo(top - stickyOffset());
    }

    /** Switch tabs and decide where the new tab lands; without `landing` it resumes where it was. */
    function switchTab(tabId, landing) {
        const tab = document.getElementById(tabId);
        if (!tab) return;

        if (tab.classList.contains('active')) {
            if (landing) applyScroll(landing);
            return;
        }

        pendingScroll = landing || null;
        tab.click();
    }

    /** Going home starts the workspace over. Everything tied to the last visit
     *  goes — the results, the query, the plus-menu tags, the tab that was open
     *  — and only the Agent thread carries across. */
    function resetWorkspace() {
        // Leave Ask-AI mode first: .bottom-chat-container is fixed to the
        // viewport and lives outside #app-view, so hiding the app view does
        // not take the chat input with it.
        setChatMode(false);
        if (bottomChatContainer) bottomChatContainer.classList.remove('active', 'centered');
        document.body.classList.remove('ask-ai-mode', 'chat-initial-state');

        // The Search tab and everything pinned to the query behind it.
        if (chatContainer) {
            chatContainer.innerHTML = '';
            chatContainer.style.display = 'block';
        }
        allTabContent = '';
        searchState = { query: '', page: 1, searchId: '' };
        lastResponseData = null;
        selectedMentionProduct = null;
        if (replyContext) replyContext.classList.remove('active');
        hideMentionPopup();
        if (userInput) {
            userInput.value = '';
            userInput.style.height = 'auto';
        }
        document.querySelectorAll('#search-tags .search-tag, #chat-search-tags .search-tag')
            .forEach(tag => tag.remove());
        document.querySelectorAll('#search-dropdown .dropdown-option.active, #chat-dropdown .dropdown-option.active')
            .forEach(option => option.classList.remove('active'));
        [document.getElementById('attach-file-input'), document.getElementById('chat-attach-file-input')]
            .forEach(input => { if (input) input.value = ''; });

        // Back on Search, set directly rather than through the tab handler:
        // that one answers an empty query by returning to the landing view,
        // which is exactly where we already are.
        searchTabs.forEach(t => t.classList.remove('active'));
        const searchTab = document.getElementById('tab-all');
        if (searchTab) searchTab.classList.add('active');
        activeTabId = 'tab-all';
        Object.keys(tabScrollMemory).forEach(key => delete tabScrollMemory[key]);
        pendingScroll = null;
    }

    // The landing view owns the transition; it calls this on the way back.
    window.resetWorkspace = resetWorkspace;
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

    const btnAttachFile = document.getElementById('btn-attach-file');
    const btnFilter = document.getElementById('btn-filter');
    const mobilePlusBtn = document.getElementById('mobile-plus-btn');
    const mobileActionsPopover = document.getElementById('mobile-actions-popover');
    const activeTogglesMobile = document.getElementById('active-toggles-mobile');
    const getActionBtn = (action) => {
        if (action === 'attach-file') return btnAttachFile;
        if (action === 'filter') return btnFilter;
        return null;
    };

    function syncActiveTogglesMobile() {
        if (!activeTogglesMobile || window.innerWidth > 768) {
            if (activeTogglesMobile) activeTogglesMobile.innerHTML = '';
            return;
        }

        const config = [
            { id: 'attach-file', btn: btnAttachFile, label: t('attach_file', 'Attach file'), icon: 'fa-paperclip' },
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

    [btnAttachFile, btnFilter].forEach(btn => {
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

    /** True when a plus-menu tag such as "deep-research" is active in either search bar. */
    function hasActiveTag(name) {
        return Array.from(document.querySelectorAll('#search-tags .search-tag, #chat-search-tags .search-tag'))
            .some(tag => (tag.dataset.id || '').includes(name));
    }

    async function sendMessage(overridePrompt = null) {
        console.log('sendMessage called');
        let prompt = overridePrompt;
        
        if (prompt === null) {
            const isBottomActive = bottomChatContainer && bottomChatContainer.classList.contains('active');
            const activeInput = isBottomActive ? bottomChatInput : userInput;
            prompt = activeInput ? activeInput.value.trim() : '';
        }

        if (!prompt) return;

        // The Agent tab owns both the chat API and deep research; Search only ever runs /search.
        if (document.body.classList.contains('ask-ai-mode') || hasActiveTag('deep-research')) {
            const agentTab = document.getElementById('tab-fast-answer');
            if (agentTab && !agentTab.classList.contains('active')) agentTab.click();
            await sendAgentMessage(prompt);
            return;
        }

        const isAutoTrigger = sendBtn && sendBtn.dataset.isAutoTrigger === 'true';

        if (!isAutoTrigger) {
            // Always refresh/redirect to update URL and state on manual search
            const isBottomActive = bottomChatContainer && bottomChatContainer.classList.contains('active');
            const tagsSelector = isBottomActive ? '#chat-search-tags .search-tag' : '#search-tags .search-tag';
            const tags = document.querySelectorAll(tagsSelector);

            let params = new URLSearchParams();
            params.set('q', prompt);

            tags.forEach(tag => {
                if ((tag.dataset.id || '').includes('filter')) params.set('filter', '1');
            });

            window.history.pushState(null, '', `/?${params.toString()}`);
            // No return here, allow it to proceed dynamically
        }

        currentEditingMessageId = null;
        await runSearch(prompt, 1);
        clearDraft();
    }

    /** Search tab — POST /search through Django. `page` walks the cached ranked list. */
    async function runSearch(prompt, page = 1) {
        if (!chatContainer) return;

        const isNewQuery = page === 1 || prompt !== searchState.query;
        if (isNewQuery) searchState = { query: prompt, page: 1, searchId: '' };

        const tabAll = document.getElementById('tab-all');
        if (tabAll && !tabAll.classList.contains('active')) tabAll.click();

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
        }

        const welcome = document.querySelector('.welcome-screen');
        if (welcome) welcome.remove();

        chatContainer.innerHTML = buildLoadingSkeleton(false);

        try {
            const startTime = Date.now();

            const body = { prompt: prompt, page: page, session_id: chatSessionId };
            if (page > 1 && searchState.searchId) body.search_id = searchState.searchId;

            const response = await fetch('/api/search/stream/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(body)
            });

            if (!response.ok || !response.body) {
                // An error page (403/500) is HTML, not JSON — don't let the parse mask the status.
                const failed = await response.json().catch(() => null);
                throw new Error((failed && failed.error) || `${t('something_went_wrong', 'Sorry, something went wrong.')} (HTTP ${response.status})`);
            }

            let data = null;
            let streamError = null;

            await readEventStream(response, (event, payload) => {
                if (event === 'stage') {
                    setSearchProgress(payload);
                } else if (event === 'results') {
                    // The whole point of streaming: listings are ready long before
                    // the written answer, so put them on screen now.
                    data = Object.assign({}, payload, { query: prompt });
                    renderSearchResults(data, prompt, null);
                } else if (event === 'done') {
                    data = payload;
                } else if (event === 'error') {
                    streamError = (payload && payload.message) || null;
                }
            });

            if (streamError) throw new Error(streamError);
            if (!data) throw new Error(t('something_went_wrong', 'Sorry, something went wrong.'));

            const pageInfo = data.page || {};
            searchState = {
                query: prompt,
                page: pageInfo.page || page,
                searchId: pageInfo.search_id || searchState.searchId
            };

            lastResponseData = data;
            lastResponseData.prompt = prompt;

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            // Re-render once the full payload is in: same grid, now with the
            // final counts and timing. `rendered` only tells us the grid is
            // already up, so this never flashes an empty state.
            renderSearchResults(data, prompt, duration);

            // A question routes itself to the chat layer — that answer belongs in Agent.
            if (isNewQuery && data.assist && data.assist.answer) {
                const questionMsg = pushAnswerToAskAI(prompt, data, false);

                if (data.mode === 'chat') {
                    chatHistory.push({ role: 'user', content: prompt }, { role: 'assistant', content: data.assist.answer });
                    chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);

                    // Open Agent on the question that was just asked, so the answer reads top-down.
                    switchTab('tab-fast-answer', () => scrollToElement(questionMsg));
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            chatContainer.innerHTML = `<div class="sr-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(error.message || t('something_went_wrong', 'Sorry, something went wrong.'))}</div>`;
        }

        const activeInput = (bottomChatContainer && bottomChatContainer.classList.contains('active')) ? bottomChatInput : userInput;
        if (activeInput) {
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
    }

    /** Agent tab — /chat by default, /deep-research while the Deep research tag is on. */
    async function sendAgentMessage(prompt) {
        if (!aiChatMessages || !prompt) return;

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

        const isDeepResearch = hasActiveTag('deep-research');

        // Add thinking indicator
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'ai-msg ai-response-msg thinking';
        thinkingDiv.innerHTML = isDeepResearch
            ? `<div class="msg-content"><i class="fa-solid fa-flask fa-fade"></i> ${t('deep_research_running', 'Deep research is running, this may take up to a minute...')}</div>`
            : `<div class="msg-content"><i class="fa-solid fa-ellipsis fa-fade"></i> ${t('ai_thinking', "AI is thinking...")}</div>`;
        aiChatMessages.appendChild(thinkingDiv);
        scrollToBottom();

        const chatPayload = { prompt: prompt };
        if (!isDeepResearch) {
            // Both: the replayed transcript is authoritative, the session id lets
            // the server keep its own short memory of the same conversation.
            chatPayload.history = chatHistory.slice(-MAX_CHAT_HISTORY);
            chatPayload.session_id = chatSessionId;
        }
        if (selectedMentionProduct) {
            chatPayload.context_product = selectedMentionProduct;
            // Clear context after sending
            selectedMentionProduct = null;
            if (replyContext) replyContext.classList.remove('active');
        }

        if (bottomChatSendBtn) {
            bottomChatSendBtn.disabled = true;
            bottomChatSendBtn.style.opacity = '0.5';
        }

        try {
            const response = await fetch(isDeepResearch ? '/api/deep-research/stream/' : '/api/ai-chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(chatPayload)
            });

            let data = null;
            if (isDeepResearch && response.ok && response.body) {
                // Research runs for ~11s. Showing the plan and then each step as
                // it finishes is the difference between a progress bar and a
                // blank wait, so the thinking bubble becomes a live log.
                let streamError = null;
                await readEventStream(response, (event, payload) => {
                    if (event === 'plan') {
                        renderResearchProgress(thinkingDiv, payload, []);
                    } else if (event === 'step') {
                        renderResearchProgress(thinkingDiv, null, [payload]);
                    } else if (event === 'done') {
                        data = payload;
                    } else if (event === 'error') {
                        streamError = (payload && payload.message) || null;
                    }
                });
                if (streamError) data = { error: streamError };
            } else {
                data = await response.json().catch(() => null);
            }
            thinkingDiv.remove();

            const answer = isDeepResearch ? ((data && data.report && data.report.summary) || '') : ((data && data.response) || '');

            if (response.ok && data && answer) {
                rememberAnswerSet(data, prompt);

                const aiMsgDiv = document.createElement('div');
                aiMsgDiv.className = 'ai-msg ai-response-msg';
                aiMsgDiv.innerHTML = `<div class="msg-content">${isDeepResearch ? buildDeepResearchAnswer(data) : buildChatAnswer(data)}</div>`;
                aiChatMessages.appendChild(aiMsgDiv);

                chatHistory.push({ role: 'user', content: prompt }, { role: 'assistant', content: answer });
                chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);

                // Listings the agent found fill the Search tab, both as results and as citation targets.
                if (chatContainer && data.products && data.products.length) {
                    lastResponseData = data;
                    lastResponseData.prompt = prompt;
                    // The Search tab falls back to the landing view on an empty query box.
                    if (userInput) userInput.value = prompt;
                    searchState = { query: prompt, page: (data.page && data.page.page) || 1, searchId: (data.page && data.page.search_id) || '' };
                    renderSearchResults(data, prompt, null);
                    chatContainer.style.display = 'none';

                    // Searching and deep research are about the listings, so hand the user straight
                    // to them; a statistics or compare answer is the text itself, so stay put.
                    // Fresh results start at the top, not wherever the chat thread was scrolled.
                    if (isDeepResearch || data.intent === 'search') showSearchTab(() => scrollMainTo(0));
                }
            } else {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'ai-msg ai-response-msg error';
                errorDiv.innerHTML = `<div class="msg-content">${escapeHTML((data && data.error) || t('error_try_again', 'An error occurred. Please try again.'))}</div>`;
                aiChatMessages.appendChild(errorDiv);
            }
            scrollToBottom();
        } catch (error) {
            console.error('Agent error:', error);
            thinkingDiv.remove();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ai-msg ai-response-msg error';
            errorDiv.innerHTML = `<div class="msg-content">${t('connection_lost', 'Connection with server lost.')}</div>`;
            aiChatMessages.appendChild(errorDiv);
            scrollToBottom();
        }

        if (bottomChatSendBtn) {
            bottomChatSendBtn.disabled = false;
            bottomChatSendBtn.style.opacity = '1';
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

    /** Name the stage the search is on, so the skeleton says something true.
     *  Unknown stage names are ignored rather than printed raw — the API adds
     *  stages (it already emits `cache`) and a raw identifier is not a label. */
    function setSearchProgress(payload) {
        const note = document.querySelector('.sr-loading-note');
        if (!note) return;

        const labels = {
            cache: t('stage_cache', 'Checking earlier results'),
            extract: t('stage_extract', 'Reading the query'),
            retrieve: t('stage_retrieve', 'Searching listings'),
            rank: t('stage_rank', 'Ranking matches'),
            assist: t('stage_assist', 'Writing the answer')
        };
        const label = labels[(payload && payload.name) || ''];
        if (!label) return;

        const found = payload && (payload.total || payload.found);
        note.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHTML(label)}` +
            (found ? ` <span class="sr-stage-count">${escapeHTML(String(found))}</span>` : '');
    }

    function buildLoadingSkeleton(isDeepResearch) {
        const cards = Array.from({ length: 8 }, () => `
            <div class="sr-grid-card sr-grid-card-skeleton">
                <div class="sr-skeleton sr-skeleton-img"></div>
                <div class="sr-grid-card-body">
                    <div class="sr-skeleton sr-skeleton-text w90"></div>
                    <div class="sr-skeleton sr-skeleton-text w60"></div>
                    <div class="sr-skeleton sr-skeleton-text w75"></div>
                </div>
            </div>
        `).join('');

        // Always present: setSearchProgress() rewrites it as each stage lands.
        const note = isDeepResearch
            ? `<div class="sr-loading-note"><i class="fa-solid fa-flask fa-fade"></i> ${t('deep_research_running', 'Deep research is running, this may take up to a minute...')}</div>`
            : `<div class="sr-loading-note"><i class="fa-solid fa-circle-notch fa-spin"></i> ${t('searching', 'Searching...')}</div>`;

        return `
            <div class="search-results-layout">
                <div class="search-results-main">
                    ${note}
                    <div class="sr-products-grid">${cards}</div>
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

    /* =========================================================
       SEARCH TAB — listings only. Every LLM answer lives in Ask AI.
       ========================================================= */
    function renderSearchResults(data, prompt, duration) {
        const products = data.products || [];
        const sources = data.sources || {};
        const isDeepResearch = !!data.report;

        // Price calculations
        const prices = products.map(p => parseFloat(p.price)).filter(p => p > 0 && !isNaN(p));
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

        // Determine dominant currency for price visualization
        const currencyCounts = {};
        products.forEach(p => { if (p.currency) { currencyCounts[p.currency] = (currencyCounts[p.currency] || 0) + 1; } });
        const dominantCurrency = Object.keys(currencyCounts).sort((a, b) => currencyCounts[b] - currencyCounts[a])[0] || t('som', "so'm");

        const priceRanges = buildPriceRanges(prices, minPrice, maxPrice);

        // Links from all products
        const allLinks = products.filter(p => p.product_url).map(p => ({
            title: p.title || '',
            url: p.product_url,
            crawled_at: p.listed_at || '',
            site: p.site_name || ''
        }));

        const sitesCount = sources.sites_count || 0;
        const sitesLabel = sitesCount === 1 ? t('site', 'site') : t('sites', 'sites');
        const districtsCount = sources.stores_count || 0;
        const totalCount = sources.total_count || products.length;
        // Deep research matches far more than it renders — say how many are on screen
        const countText = (totalCount > products.length)
            ? `${products.length} / ${totalCount}`
            : `${totalCount}`;

        // ---- Left column: result header + one uniform grid ----
        let leftHTML = `
            <div class="sr-result-header">
                <div class="sr-result-headline">
                    ${isDeepResearch ? `<span class="sr-mode-chip"><i class="fa-solid fa-flask"></i> ${t('deep_research', 'Deep research')}</span>` : ''}
                    <span class="sr-result-count">${countText} ${t('listings_found', 'listings found')}</span>
                    ${duration ? `<span class="sr-result-time">${duration}s</span>` : ''}
                </div>
                <div class="sr-result-actions">
                    <div class="sr-source-preview">
                        <div class="sr-source-pill"><i class="fa-solid fa-globe"></i><span>${sitesCount} ${sitesLabel}</span></div>
                        ${districtsCount ? `<div class="sr-source-pill"><i class="fa-solid fa-location-dot"></i><span>${districtsCount} ${t('districts', 'districts')}</span></div>` : ''}
                    </div>
                    <button class="sr-continue-btn" id="sr-continue-chat-btn">
                        <i class="fa-solid fa-bolt"></i> ${t('view_ai_answer', 'View AI answer')}
                    </button>
                </div>
            </div>
        `;

        if (products.length > 0) {
            leftHTML += `<div class="sr-products-grid">${products.map(buildGridCard).join('')}</div>`;
            leftHTML += buildPager(data.page);
        } else {
            leftHTML += `
                <div class="sr-empty">
                    <i class="fa-regular fa-face-frown"></i>
                    <p>${t('no_results_found', 'No listings matched this search.')}</p>
                </div>
            `;
        }

        // ---- Right column: price distribution + sources ----
        let rightHTML = '';

        if (prices.length > 0) {
            rightHTML += `
                <div class="sr-price-viz">
                    <div class="sr-price-viz-header">
                        <div class="sr-price-viz-title">${t('prices', 'Prices')} <span class="sr-price-currency-label">${escapeHTML(dominantCurrency)}</span></div>
                    </div>
                    <div class="sr-price-stats-inline">
                        <span class="sr-price-stat-item"><strong>${t('min', 'Min')}:</strong> ${formatPrice(minPrice)}</span>
                        <span class="sr-price-stat-divider">•</span>
                        <span class="sr-price-stat-item"><strong>${t('average', 'Average')}:</strong> ${formatPrice(avgPrice)}</span>
                        <span class="sr-price-stat-divider">•</span>
                        <span class="sr-price-stat-item"><strong>${t('max', 'Max')}:</strong> ${formatPrice(maxPrice)}</span>
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

    /** Pager for the ranked list. The API pages it from cache, so "next" costs one cheap call. */
    function buildPager(page) {
        if (!page || !page.pages || page.pages < 2) return '';

        const current = page.page;
        const last = page.pages;

        // The ends stay reachable and the current page keeps its neighbours: 1 2 3 … 44 45 46
        const shown = [...new Set([1, 2, 3, current - 1, current, current + 1, last - 2, last - 1, last])]
            .filter(n => n >= 1 && n <= last)
            .sort((a, b) => a - b);

        let numbers = '';
        shown.forEach((n, i) => {
            if (i && n - shown[i - 1] > 1) numbers += `<span class="sr-pager-gap">…</span>`;
            numbers += `<button type="button" class="sr-pager-num${n === current ? ' active' : ''}" data-page="${n}">${n}</button>`;
        });

        return `
            <div class="sr-pager">
                <button type="button" class="sr-pager-btn" data-page="${current - 1}" ${page.has_prev ? '' : 'disabled'} title="${t('previous', 'Previous')}">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                ${numbers}
                <button type="button" class="sr-pager-btn" data-page="${current + 1}" ${page.has_next ? '' : 'disabled'} title="${t('next', 'Next')}">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    function attachSearchResultsListeners() {
        // Event: Continue chat -> Agent tab
        const continueBtn = document.getElementById('sr-continue-chat-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                const askAiTab = document.getElementById('tab-fast-answer');
                if (askAiTab) askAiTab.click();
            });
        }

        chatContainer.querySelectorAll('.sr-pager [data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page, 10);
                if (!page || btn.disabled || page === searchState.page) return;
                runSearch(searchState.query, page);
                scrollMainTo(0);
            });
        });

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
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Every card is the same width and height — a plain grid, no featured row. */
    function buildGridCard(p) {
        const priceText = p.price ? formatPrice(p.price) : '';
        const imgSrc = p.image_url || '';
        const url = p.product_url || '';
        const title = p.title || '';

        const accuracyHtml = (p.accuracy !== undefined && p.accuracy !== null) ? `
            <span class="sr-accuracy-badge" title="${t('accuracy_title', 'Match accuracy')}">
                <i class="fa-solid fa-circle-check"></i> ${p.accuracy}%
            </span>
        ` : '';

        // Compact spec line: rooms · area · floor
        const specs = [];
        if (p.rooms) specs.push(`${p.rooms} ${t('rooms_short', 'xona')}`);
        if (p.total_area) specs.push(`${p.total_area} m²`);
        if (p.floor) specs.push(p.total_floors ? `${p.floor}/${p.total_floors} ${t('floor_short', 'qavat')}` : `${p.floor} ${t('floor_short', 'qavat')}`);
        const specsHtml = specs.length ? `<div class="sr-grid-card-specs">${specs.map(s => escapeHTML(s)).join(' · ')}</div>` : '';

        const location = p.who_by || p.district || p.region || '';

        const inner = `
            <div class="sr-grid-card-img">
                ${imgSrc
                    ? `<img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(title)}" loading="lazy">`
                    : `<span class="sr-grid-card-noimg"><i class="fa-regular fa-image"></i></span>`}
                ${accuracyHtml}
            </div>
            <div class="sr-grid-card-body">
                <div class="sr-grid-card-title">${escapeHTML(title)}</div>
                ${specsHtml}
                <div class="sr-grid-card-price-row">
                    ${priceText
                        ? `<span class="sr-grid-card-price">${priceText} <span class="sr-price-currency">${escapeHTML(p.currency || t('som', "so'm"))}</span></span>`
                        : `<span class="sr-grid-card-price muted">${t('price_not_listed', 'Price on request')}</span>`}
                </div>
                <div class="sr-grid-card-footer">
                    <span class="sr-grid-card-seller">${escapeHTML(location)}</span>
                    ${p.site_name ? `<span class="sr-grid-card-site">${escapeHTML(p.site_name)}</span>` : ''}
                </div>
            </div>
        `;

        // Telegram-sourced listings have no public URL — render them as a plain card.
        const attrs = `class="sr-grid-card" data-product-id="${escapeHTML(p.product_id || '')}"`;
        return url
            ? `<div ${attrs}><a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="sr-grid-card-link">${inner}</a></div>`
            : `<div ${attrs}><div class="sr-grid-card-link">${inner}</div></div>`;
    }

    /* =========================================================
       ASK AI TAB — assist answers and deep-research reports
       ========================================================= */
    function buildAssistAnswer(data) {
        const assist = data.assist || {};
        const total = (data.sources && data.sources.total_count) || (data.products || []).length;
        const citations = assist.citations || [];

        let body;
        if (!assist.answer) {
            body = `${total} ${t('listings_found', 'listings found')}.`;
        } else if (citations.length) {
            body = linkCitations(formatAiMessage(assist.answer), citations, data.citeGroup);
        } else {
            body = formatAiMessage(assist.answer) + buildCitations(data);
        }

        let html = `<div class="msg-text">${body}</div>`;

        if (assist.highlights && assist.highlights.length) {
            html += `<ul class="sr-answer-list">${assist.highlights.map(h => `<li>${escapeHTML(h)}</li>`).join('')}</ul>`;
        }

        html += buildSourceList(citations);
        html += buildSuggestions(assist.questions);
        html += buildBackToSearchLink(total);
        return html;
    }

    /** Tie an answer to the listings behind it, so its citations resolve even after a later search. */
    function rememberAnswerSet(data, prompt) {
        if (!data.products || !data.products.length) return;
        data.citeGroup = String(++answerSetSeq);
        answerSets.set(data.citeGroup, { data: data, prompt: prompt });
    }

    /** Turn the [1], [2] markers the API writes into links to the listing each one cites.
     *
     *  Matching is by `ref`, not by position: the API drops any marker it could
     *  not ground, so the list legitimately runs 1, 2, 4. A marker with no
     *  matching source is left as plain text rather than pointing somewhere
     *  wrong. Telegram listings have no public page (`url: null`) — those
     *  become buttons that reveal the card in the Search tab instead.
     */
    function linkCitations(html, citations, citeGroup) {
        if (!citations || !citations.length) return html;

        const byRef = new Map(citations.map(c => [Number(c.ref), c]));

        return html.replace(/\[(\d{1,3})\]/g, (whole, digits) => {
            const cite = byRef.get(Number(digits));
            if (!cite) return whole;

            const price = cite.price
                ? `${formatPrice(cite.price)} ${cite.currency || ''}`.trim()
                : t('price_not_listed', 'Price on request');
            const label = `${cite.title || ''} — ${price}`;

            if (cite.url) {
                return `<a class="sr-ref" href="${escapeHTML(cite.url)}" target="_blank" rel="noopener"
                           title="${escapeHTML(label)}">${digits}</a>`;
            }
            return `<button type="button" class="sr-ref sr-ref-nolink"
                        data-cite="${escapeHTML(cite.product_id)}"
                        data-cite-group="${escapeHTML(citeGroup || '')}"
                        title="${escapeHTML(label)}">${digits}</button>`;
        });
    }

    /** The listings behind an answer, listed under it so the [n] markers have a legend. */
    function buildSourceList(citations) {
        if (!citations || !citations.length) return '';

        // Not truncated: the list is collapsed by default, and these are the
        // listings the answer stands on — hiding some while the summary counts
        // them all would misstate what was checked.
        const rows = citations.map(c => {
            const price = c.price ? `${formatPrice(c.price)} ${c.currency || ''}`.trim() : '';
            const meta = [c.site_name, c.district, price].filter(Boolean).join(' · ');
            const title = escapeHTML(c.title || t('listing', 'Listing'));
            const body = `<span class="sr-source-num">${c.ref}</span>
                          <span class="sr-source-title">${title}</span>
                          ${meta ? `<span class="sr-source-meta">${escapeHTML(meta)}</span>` : ''}`;
            return c.url
                ? `<li><a href="${escapeHTML(c.url)}" target="_blank" rel="noopener">${body}</a></li>`
                : `<li><span class="sr-source-offsite" title="${escapeHTML(t('no_public_link', 'No public link'))}">${body}</span></li>`;
        }).join('');

        return `<details class="sr-sources">
                    <summary>${t('sources', 'Sources')} (${citations.length})</summary>
                    <ol class="sr-source-list">${rows}</ol>
                </details>`;
    }

    /** Numbered links from a claim to the listings it stands on. Clicking one reveals that card. */
    function buildCitations(data) {
        const cited = (data.products || []).slice(0, MAX_CITATIONS);
        if (!cited.length) return '';

        const chips = cited.map((p, i) => {
            const price = p.price ? `${formatPrice(p.price)} ${p.currency || ''}`.trim() : t('price_not_listed', 'Price on request');
            const label = `${p.title || ''} — ${price}`;
            return `<button type="button" class="sr-cite" data-cite="${escapeHTML(p.product_id)}" data-cite-group="${escapeHTML(data.citeGroup || '')}" title="${escapeHTML(label)}">${i + 1}</button>`;
        }).join('');

        return `<span class="sr-cites">${chips}</span>`;
    }

    /** One /chat turn: the reply, the facts behind it, its listings and the follow-ups it offers. */
    function buildChatAnswer(data) {
        const products = data.products || [];
        const citations = data.citations || [];

        // Real [n] markers win; the positional chips stay for answers the API
        // returned without a source list.
        const body = citations.length
            ? linkCitations(formatAiMessage(data.response), citations, data.citeGroup)
            : formatAiMessage(data.response) + buildCitations(data);

        let html = `<div class="msg-text">${body}</div>`;

        if (data.highlights && data.highlights.length) {
            html += `<ul class="sr-answer-list">${data.highlights.map(h => `<li>${escapeHTML(h)}</li>`).join('')}</ul>`;
        }
        html += buildSourceList(citations);
        html += buildSuggestions(data.questions);
        if (products.length) {
            html += buildBackToSearchLink((data.sources && data.sources.total_count) || products.length);
        }
        return html;
    }

    /** Follow-ups the model wrote for this answer — one click asks the next question. */
    function buildSuggestions(questions) {
        if (!questions || !questions.length) return '';

        const chips = questions
            .map(q => `<button type="button" class="sr-suggestion">${escapeHTML(q)}</button>`)
            .join('');

        return `<div class="sr-answer-subtitle">${t('to_refine_search', 'To narrow the search')}</div>
                <div class="sr-suggestions">${chips}</div>`;
    }

    /** Turn the thinking bubble into a live research log: the plan first, then
     *  each step as it completes. State rides on the element so successive
     *  frames accumulate instead of replacing each other. */
    function renderResearchProgress(bubble, plan, newSteps) {
        if (!bubble) return;
        if (!bubble._research) bubble._research = { goal: '', planned: 0, steps: [] };
        const state = bubble._research;

        if (plan) {
            state.goal = plan.goal || '';
            state.planned = (plan.steps || []).length;
        }
        (newSteps || []).forEach(s => {
            if (s && (s.question || s.query)) state.steps.push(s);
        });

        const done = state.steps.length;
        const total = Math.max(state.planned, done);

        const rows = state.steps.map(s => `
            <li>
                <i class="fa-solid fa-check"></i>
                <span>${escapeHTML(s.question || s.query || '')}</span>
                ${s.total ? `<span class="sr-step-count">${escapeHTML(String(s.total))}</span>` : ''}
            </li>`).join('');

        bubble.innerHTML = `
            <div class="msg-content">
                <div class="sr-research-live">
                    <div class="sr-research-head">
                        <i class="fa-solid fa-flask fa-fade"></i>
                        <span>${escapeHTML(state.goal || t('deep_research_running', 'Deep research is running...'))}</span>
                        ${total ? `<span class="sr-research-progress">${done}/${total}</span>` : ''}
                    </div>
                    ${rows ? `<ol class="sr-research-steps">${rows}</ol>` : ''}
                </div>
            </div>`;
        scrollToBottom();
    }

    function buildDeepResearchAnswer(data) {
        const report = data.report || {};
        const steps = data.steps || [];
        const total = (data.sources && data.sources.total_count) || (data.products || []).length;

        let html = `<div class="sr-answer-badge"><i class="fa-solid fa-flask"></i> ${t('deep_research', 'Deep research')}</div>`;

        if (report.goal) {
            html += `<div class="sr-answer-goal">${escapeHTML(report.goal)}</div>`;
        }
        const citations = data.citations || [];
        // Every round's listings are merged into one list, so [3] means the same
        // listing wherever it turns up in the report.
        const cite = (text) => citations.length
            ? linkCitations(escapeHTML(text), citations, data.citeGroup)
            : escapeHTML(text);

        if (report.summary) {
            const summary = citations.length
                ? linkCitations(formatAiMessage(report.summary), citations, data.citeGroup)
                : formatAiMessage(report.summary) + buildCitations(data);
            html += `<div class="msg-text">${summary}</div>`;
        }
        if (report.findings && report.findings.length) {
            html += `<div class="sr-answer-subtitle">${t('key_findings', 'Key findings')}</div>`;
            html += `<ul class="sr-answer-list">${report.findings.map(f => `<li>${cite(f)}</li>`).join('')}</ul>`;
        }
        if (report.gaps && report.gaps.length) {
            html += `<div class="sr-answer-subtitle">${t('open_questions', 'Open questions')}</div>`;
            html += `<ul class="sr-answer-list">${report.gaps.map(g => `<li>${cite(g)}</li>`).join('')}</ul>`;
        }
        html += buildSourceList(citations);
        if (steps.length) {
            html += `
                <details class="sr-answer-steps">
                    <summary>${t('research_steps', 'Research steps')} (${steps.length})</summary>
                    <ol>${steps.map(s => `<li>${escapeHTML(s.question || s.query)}${s.total ? ` <span class="sr-step-count">${s.total}</span>` : ''}</li>`).join('')}</ol>
                </details>
            `;
        }

        html += buildBackToSearchLink(total);
        return html;
    }

    function buildBackToSearchLink(total) {
        return `
            <button type="button" class="sr-answer-link" data-goto-search>
                <i class="fa-solid fa-magnifying-glass"></i>
                ${t('see_listings', 'See listings')}${total ? ` (${total})` : ''}
            </button>
        `;
    }

    /** Mirror the query into the Ask AI tab and render the LLM answer there. */
    function pushAnswerToAskAI(prompt, data, isDeepResearch) {
        if (!aiChatMessages) return;

        rememberAnswerSet(data, prompt);

        const welcome = aiChatMessages.querySelector('.ai-chat-welcome');
        if (welcome) welcome.remove();

        const userMsg = document.createElement('div');
        userMsg.className = 'ai-msg user-msg';
        userMsg.innerHTML = `<div class="msg-content"><div class="msg-text">${escapeHTML(prompt)}</div></div>`;
        aiChatMessages.appendChild(userMsg);

        const aiMsg = document.createElement('div');
        aiMsg.className = 'ai-msg ai-response-msg';
        aiMsg.innerHTML = `<div class="msg-content">${isDeepResearch ? buildDeepResearchAnswer(data) : buildAssistAnswer(data)}</div>`;
        aiChatMessages.appendChild(aiMsg);

        // Hint that an answer is waiting on the other tab
        const askAiTab = document.getElementById('tab-fast-answer');
        if (askAiTab && !askAiTab.classList.contains('active')) {
            askAiTab.classList.add('has-unread');
        }

        return userMsg;
    }

    function showSearchTab(landing) {
        switchTab('tab-all', landing);
    }

    /** Follow a citation: open Search on the cited listing and flash it so the eye lands on it. */
    function focusCitedCard(productId, group) {
        if (!chatContainer) return;

        const selector = `.sr-grid-card[data-product-id="${CSS.escape(productId)}"]`;
        const answerSet = answerSets.get(group);

        // A later search may have replaced the grid — put this answer's listings back first.
        if (!chatContainer.querySelector(selector) && answerSet) {
            const page = answerSet.data.page || {};
            if (userInput) userInput.value = answerSet.prompt;
            searchState = { query: answerSet.prompt, page: page.page || 1, searchId: page.search_id || '' };
            lastResponseData = answerSet.data;
            lastResponseData.prompt = answerSet.prompt;
            renderSearchResults(answerSet.data, answerSet.prompt, null);
        }

        // The tab switch re-renders the grid from the saved markup, so look the card up after it.
        showSearchTab(() => {
            const card = chatContainer.querySelector(selector);
            if (!card) return;

            card.scrollIntoView({ block: 'center' });
            if (card.classList.contains('sr-card-flash')) return;

            card.classList.add('sr-card-flash');
            setTimeout(() => card.classList.remove('sr-card-flash'), 2000);
        });
    }

    // Inside an Agent answer: citations and "See listings" open Search, suggestions ask the next question
    if (aiChatMessages) {
        aiChatMessages.addEventListener('click', (e) => {
            const cite = e.target.closest('.sr-cite');
            if (cite) {
                focusCitedCard(cite.dataset.cite, cite.dataset.citeGroup);
                return;
            }

            if (e.target.closest('[data-goto-search]')) {
                showSearchTab(() => scrollMainTo(0));
                return;
            }

            const suggestion = e.target.closest('.sr-suggestion');
            if (suggestion) sendAgentMessage(suggestion.textContent.trim());
        });
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

    [btnAttachFile, btnFilter].forEach(btn => {
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

document.addEventListener('DOMContentLoaded', () => {
    console.log('AI Interaction script initialized');
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const conversationIdInput = document.getElementById('conversation-id');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const editBtn = document.getElementById('edit-btn');
    console.log('DOM Elements found:', { chatContainer, userInput, sendBtn });

    let currentEditingMessageId = null;
    let lastResponseData = null;
    let allTabContent = chatContainer ? chatContainer.innerHTML : '';
    let alertIdToDelete = null;

    if (userInput) {
        userInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    function scrollToBottom() {
        if (!chatContainer) return;
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    scrollToBottom();
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
            if (confirm('Ushbu bildirishnomani o\'chirmoqchimisiz?')) {
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
        const contentArea = document.querySelector('.content-area');
        const searchInterface = document.querySelector('.search-interface');
        if (contentArea && searchInterface && window.innerWidth <= 768) {
            setTimeout(() => {
                const height = searchInterface.offsetHeight;
                contentArea.style.paddingBottom = (height + 40) + 'px';
            }, 50);
        }
    }

    function toggleButtonState(btn) {
        if (!btn) return;
        const isActive = btn.classList.contains('active');

        if (isActive) {
            btn.classList.remove('active');
            const removeIcon = btn.querySelector('.remove-icon');
            if (removeIcon) removeIcon.remove();
        } else {
            btn.classList.add('active');
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
                toggleButtonState(btn);
            });
        }
    });

    const filterModalOverlay = document.getElementById('filter-modal-overlay');
    const filterCancel = document.getElementById('filter-cancel');
    const filterConfirm = document.getElementById('filter-confirm');

    if (btnFilter && filterModalOverlay) {
        btnFilter.addEventListener('click', (e) => {
            console.log('Filter button clicked. Active:', btnFilter.classList.contains('active'));
            if (btnFilter.classList.contains('active')) {
                toggleButtonState(btnFilter);
                document.getElementById('filter-price-min').value = '';
                document.getElementById('filter-price-max').value = '';
                document.getElementById('filter-color').value = '';
                document.getElementById('filter-region').value = '';
                document.getElementById('filter-rating').value = '';
                document.getElementById('filter-sort').value = 'relevance';
            } else {
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
                toggleButtonState(btnFilter);
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

    async function sendMessage() {
        console.log('sendMessage called');
        const prompt = userInput ? userInput.value.trim() : '';
        console.log('Prompt:', prompt);
        if (!prompt) return;

        const tabAll = document.getElementById('tab-all');
        if (tabAll && !tabAll.classList.contains('active')) {
            tabAll.click();
        }

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
        }

        currentEditingMessageId = null;

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

            const reasoningContainer = reasoningBlock.querySelector('#current-reasoning');
            reasoningContainer.className = 'reasoning-container';
            reasoningContainer.innerHTML = `
                <div class="reasoning-header" style="cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%;" onclick="this.nextElementSibling.classList.toggle('show')">
                    <strong><i class="fa-solid fa-brain"></i> Thoughts:</strong>
                    <span style="font-size: 0.85rem; color: var(--text-muted); margin-left: auto; display: flex; gap: 15px;">
                        <span><i class="fa-regular fa-clock"></i> ${duration}s</span>
                        <span><i class="fa-solid fa-star" style="color: gold;"></i> AI Score: 98/100</span>
                    </span>
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
                step.style.opacity = '1';
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
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';

        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';

        clearDraft();
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

    function scrollToBottom() {
        if (!chatContainer) return;
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    scrollToBottom();

    const newChatBtn = document.querySelector('.new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
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
                alert('Iltimos, avval biror narsa qidiring.');
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
                    setTimeout(() => {
                        alertBtn.innerHTML = '<i class="fa-regular fa-bell"></i>';
                    }, 2000);
                } else {
                    alert('Saqlashda xatolik yuz berdi.');
                }
            } catch (err) {
                console.error('Save error:', err);
                alert('Saqlashda xatolik yuz berdi.');
            }

            alertBtn.disabled = false;
        });
    }

    function switchTab(activeId) {
        document.querySelectorAll('.search-tab').forEach(t => {
            t.classList.toggle('active', t.id === activeId);
        });
    }

    if (tabAlert) {
        tabAlert.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.getElementById('tab-all').classList.contains('active')) {
                allTabContent = chatContainer.innerHTML;
            }
            switchTab('tab-alert');
            window.renderSavedAlerts();
        });
    }

    if (tabAll) {
        tabAll.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('tab-all');
            chatContainer.innerHTML = allTabContent;
        });
    }

    ['tab-product', 'tab-service', 'tab-news', 'tab-fast-answer'].forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                if (document.getElementById('tab-all').classList.contains('active')) {
                    allTabContent = chatContainer.innerHTML;
                }
                switchTab(tabId);
                chatContainer.innerHTML = '';
            });
        }
    });

    window.renderSavedAlerts = function () {
        const alerts = JSON.parse(localStorage.getItem('saved_alerts') || '[]');

        if (alerts.length === 0) {
            chatContainer.innerHTML = `
                <div class="empty-alerts-state">
                    <div class="empty-icon">
                        <i class="fa-regular fa-bell-slash"></i>
                    </div>
                    <h3>Hali hech qanday bildirishnoma saqlanmagan</h3>
                    <p>Qidiruv natijalarini qo'ng'iroqcha tugmasi orqali saqlab qo'ying.</p>
                </div>
            `;
            return;
        }

        chatContainer.innerHTML = `
            <div class="alerts-fullscreen">
                <div class="alerts-page-header">
                    <div class="alerts-page-title">
                        <i class="fa-solid fa-bookmark"></i> Saqlangan qidiruvlar
                        <span class="alerts-count-badge">${alerts.length}</span>
                    </div>
                </div>
                <div class="alerts-card-grid" id="alerts-card-grid"></div>
            </div>
        `;

        const gridContainer = document.getElementById('alerts-card-grid');

        alerts.forEach((alert, index) => {
            const dateFull = new Date(alert.timestamp).toLocaleString('uz-UZ', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = 'alert-card';
            card.style.animationDelay = `${index * 0.05}s`;

            let responsePreview = '';
            if (alert.response) {
                responsePreview = `<div class="alert-card-response">${alert.response}</div>`;
            }

            card.innerHTML = `
                <div class="alert-card-top">
                    <div class="alert-card-prompt">${alert.prompt}</div>
                    <button class="alert-card-delete" title="O'chirish">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
                ${responsePreview}
                <div class="alert-card-footer">
                    <div class="alert-card-date">
                        <i class="fa-regular fa-calendar"></i> ${dateFull}
                    </div>
                    <div class="alert-card-id">#${alert.id.toString().slice(-6)}</div>
                </div>
            `;

            const deleteBtn = card.querySelector('.alert-card-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.deleteAlert(alert.id);
                });
            }

            gridContainer.appendChild(card);
        });
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

});

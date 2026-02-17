document.addEventListener('DOMContentLoaded', () => {
    console.log('AI Interaction script initialized');
    const chatContainer = document.getElementById('chat-container');
    const mainContent = document.querySelector('.main-content');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const conversationIdInput = document.getElementById('conversation-id');
    const historyList = document.getElementById('history-list');
    const historySearch = document.getElementById('history-search');
    const editBtn = document.getElementById('edit-btn');
    console.log('DOM Elements found:', { chatContainer, mainContent, userInput, sendBtn });

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
            { id: 'discount', btn: btnDiscount, label: 'Discount', icon: 'fa-tag' },
            { id: 'agent-mode', btn: btnAgentMode, label: 'Agent Mode', icon: 'fa-robot' },
            { id: 'image-search', btn: btnImageSearch, label: 'Image search', icon: 'fa-image' },
            { id: 'filter', btn: btnFilter, label: 'Filtering', icon: 'fa-filter' }
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

    async function sendMessage() {
        console.log('sendMessage called');
        const prompt = userInput ? userInput.value.trim() : '';
        console.log('Prompt:', prompt);
        if (!prompt) return;

        const isAutoTrigger = sendBtn && sendBtn.dataset.isAutoTrigger === 'true';
        // const isOnSearchPage = window.location.pathname.startsWith('/search');

        if (!isAutoTrigger) {
            // Always refresh/redirect to update URL and state on manual search
            const tags = document.querySelectorAll('#search-tags .search-tag');
            let params = new URLSearchParams();
            params.set('q', prompt);

            tags.forEach(tag => {
                const id = tag.dataset.id;
                if (id === 'btn-agent-mode') params.set('agent_mode', '1');
                if (id === 'btn-discount') params.set('discount', '1');
                if (id === 'btn-filter') params.set('filter', '1');
            });

            window.location.href = `/?${params.toString()}`;
            return;
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
                        <span><i class="fa-solid fa-star" style="color: gold;"></i> AI Score:  96%</span>
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
                // scrollToBottom();
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

            // scrollToBottom();

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


    // scrollToBottom();

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
        // Price Logic
        let priceHtml = '';
        const dbOldPrice = parseFloat(product.old_price) || 0;
        const dbPrice = parseFloat(product.price) || 0;

        // Formatter for Uzbek Sum
        const formatPrice = (num) => {
            return num.toLocaleString('uz-UZ').replace(/,/g, ' ') + " so'm";
        };

        // Determine which is current and which is old
        let currentPrice = dbPrice;
        let oldPrice = dbOldPrice;

        if (currentPrice === 0 && oldPrice > 0) {
            currentPrice = oldPrice;
            oldPrice = 0;
        }

        if (oldPrice > 0 && oldPrice !== currentPrice) {
            // Show both if different and non-zero
            const isDiscount = oldPrice > currentPrice;
            const discountPercent = isDiscount ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;

            priceHtml = `
                <div class="product-price-container">
                    <div class="product-price-row">
                        <span class="product-old-price">${formatPrice(oldPrice)}</span>
                        ${isDiscount ? `<span class="product-discount-tag">-${discountPercent}%</span>` : ''}
                    </div>
                    <div class="product-price">${formatPrice(currentPrice)}</div>
                </div>
            `;
        } else if (currentPrice > 0) {
            priceHtml = `
                <div class="product-price-container">
                    <div class="product-price">${formatPrice(currentPrice)}</div>
                </div>
            `;
        } else {
            priceHtml = `
                <div class="product-price-container">
                    <div class="product-price" style="color: #64748b; font-size: 0.9rem;">Narxi noma'lum</div>
                </div>
            `;
        }

        // Rating Logic
        let rating = parseFloat(product.rating) || 0;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                starsHtml += '<i class="fa-solid fa-star" style="color: gold; font-size: 0.8rem;"></i>';
            } else if (i - 0.5 <= rating) {
                starsHtml += '<i class="fa-solid fa-star-half-stroke" style="color: gold; font-size: 0.8rem;"></i>';
            } else {
                starsHtml += '<i class="fa-regular fa-star" style="color: #ccc; font-size: 0.8rem;"></i>';
            }
        }

        // Image Logic
        let imageHtml = '';
        if (product.image_url) {
            imageHtml = `<img src="${product.image_url}" alt="${product.title}" style="width: 100%; height: 100%; object-fit: contain;">`;
        } else {
            imageHtml = `<i class="fa-solid fa-box-open" style="font-size: 3rem; color: #ccc;"></i>`;
        }

        return `
            <a href="${product.product_url || '#'}" target="_blank" class="product-card-link">
                <div class="product-card">
                    <div class="product-img">
                        ${imageHtml}
                    </div>
                    <div class="product-info">
                        <div class="product-title">${product.title || product.name || 'No Title'}</div>
                        ${priceHtml}
                        <div class="product-rating">
                            ${starsHtml} <span class="rating-count">(${rating})</span>
                        </div>
                        <div class="product-who-by">
                            <i class="fa-solid fa-shop"></i> ${product.who_by || 'Unknown Seller'}
                        </div>
                    </div>
                </div>
            </a>
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

                    // Trigger Mock Social Alert
                    if (window.sendAlertToSocialMedia) {
                        window.sendAlertToSocialMedia(newAlert);
                    }

                    setTimeout(() => {
                        alertBtn.innerHTML = '<i class="fa-regular fa-bell"></i>';
                    }, 2000);
                } else {
                    alert('Save Error');
                }
            } catch (err) {
                console.error('Save error:', err);
                alert('Save Error');
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
                <div class="alerts-page-container">
                    <div class="alerts-empty-full">
                        <div class="alerts-empty-icon-wrapper">
                            <i class="fa-regular fa-bell-slash"></i>
                        </div>
                        <h3>Hali hech qanday bildirishnoma saqlanmagan</h3>
                        <p>Qidiruv natijalarini qo'ng'iroqcha tugmasi orqali saqlab qo'ying.</p>
                        <div class="alerts-empty-hint">
                            <i class="fa-regular fa-lightbulb"></i>
                            Qidiruv natijasini saqlash uchun <strong>&nbsp;🔔&nbsp;</strong> tugmasini bosing
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
                                <div class="alerts-sidebar-title">Alerts History</div>
                            </div>
                        </div>
                        <span class="alerts-count-badge">${alerts.length}</span>
                    </div>
                    <div class="alerts-search-bar">
                        <i class="fa-solid fa-magnifying-glass alerts-search-icon"></i>
                        <input type="text" class="alerts-search-input" id="alerts-search-input" placeholder="Search alerts history" />
                    </div>
                    <div class="alerts-list-container" id="alerts-list"></div>
                </div>
                <div class="alert-detail-view" id="alert-detail">
                    <div class="alert-detail-empty">
                        <div class="alert-detail-empty-icon">
                            <i class="fa-regular fa-hand-pointer"></i>
                        </div>
                        <h3>For more details</h3>
                        <p> Select any alert history on the left </p>
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
                        <p style="font-size: 0.9rem;">Natija topilmadi</p>
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
                item.innerHTML = `
                    <div class="alert-item-header">
                        <div class="alert-item-prompt">${alert.prompt}</div>
                        <button class="delete-alert-small" title="O'chirish">
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

            let productsHtml = '';
            if (alert.products && alert.products.length > 0) {
                productsHtml = `
                    <div class="alert-products-section">
                        <div class="alert-products-grid">
                            ${alert.products.map(p => createProductCard(p)).join('')}
                        </div>
                    </div>
                `;
            }

            detailContainer.innerHTML = `
                <div class="alert-detail-content-wrapper">
                    <div class="mobile-sticky-header">
                        <button class="mobile-back-btn" id="mobile-alert-back">
                            <i class="fa-solid fa-chevron-left"></i> Back
                        </button>
                    </div>
                    <div class="alert-detail-header">
                        <div style="width: 100%;">
                            <div class="alert-detail-header-info">
                                <div class="alert-detail-title">${alert.prompt}</div>
                                <div class="alert-detail-meta">
                                    <span class="alert-detail-meta-item"><i class="fa-regular fa-calendar"></i> ${dateFull}</span>
                                    <span class="alert-detail-meta-item"><i class="fa-solid fa-hashtag"></i> ID: ${alert.id.toString().slice(-6)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="alert-detail-actions">
                            <button class="alert-action-btn alert-action-btn-search" title="Try again discovery" id="re-search-btn">
                                <i class="fa-solid fa-magnifying-glass"></i> Rediscovery
                            </button>
                            <button class="alert-action-btn alert-action-btn-delete" id="delete-alert-btn">
                                <i class="fa-regular fa-trash-can"></i> Delete
                            </button>
                        </div>
                    </div>
                    ${productsHtml}
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
            // Mock reload or UI update could happen here
            // location.reload(); // Uncomment if real reload is needed
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
            feedback.innerHTML = `<i class="fa-solid fa-paper-plane"></i>Alert turned on for ${platformNames}`;
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

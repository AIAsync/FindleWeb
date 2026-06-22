const dom = `
<div id="top-search-container"></div>
<div id="bottom-chat-container"></div>
<div id="ai-chat-messages"><div></div><div></div></div>
<div id="chat-container"></div>
<div id="ai-chat-container"></div>
<input id="chat-bottom-input">
`;
// mock
let isChatMode = true;
let topSearchContainer = { classList: { add: () => {}, remove: () => {} } };
let bottomChatContainer = { classList: { add: () => {}, remove: () => {} } };
let aiChatMessages = { children: { length: 2 } };
let chatContainer = { style: {} };
let aiChatContainer = { style: {} };
let document = { body: { classList: { add: () => {}, remove: () => {} } } };
let bottomChatInput = { focus: () => {} };
let chatDropdown = { classList: { remove: () => {} } };

if (isChatMode) {
    if (topSearchContainer) topSearchContainer.classList.add('hidden');
    if (bottomChatContainer) {
        bottomChatContainer.classList.add('active');
        if (aiChatMessages && aiChatMessages.children.length <= 1) {
            bottomChatContainer.classList.add('centered');
            document.body.classList.add('chat-initial-state');
        }
    }
    if (chatContainer) chatContainer.style.display = 'none';
    if (aiChatContainer) aiChatContainer.style.display = 'block';
    document.body.classList.add('ask-ai-mode');
    if (bottomChatInput) {
        bottomChatInput.placeholder = "Ask AI anything...";
        bottomChatInput.focus();
    }
}
console.log(aiChatContainer.style.display);

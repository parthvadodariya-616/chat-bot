document.addEventListener('DOMContentLoaded', function() {
    const newChatButton = document.getElementById('new-chat-button');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatArea = document.getElementById('chat-area');
    const chatContainer = document.getElementById('chat-container');
    const historyList = document.getElementById('history-list');
    const sidebar = document.getElementById('sidebar');
    const openSidebarButton = document.getElementById('open-sidebar-button');
    const closeSidebarButton = document.getElementById('close-sidebar-button');
    const chatTitle = document.getElementById('chat-title');

    let currentSessionId = null;
    let isUserAtBottom = true;

    const jumpToBottomBtn = document.createElement('button');
    jumpToBottomBtn.id = 'jump-to-bottom-btn';
    jumpToBottomBtn.className = 'absolute bottom-20 right-8 bg-[#A3FF00] text-black p-2 rounded-full shadow-lg opacity-0 transform translate-y-4 pointer-events-none';
    jumpToBottomBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>`;
    chatArea.appendChild(jumpToBottomBtn);

    const showJumpToBottomBtn = () => jumpToBottomBtn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    const hideJumpToBottomBtn = () => jumpToBottomBtn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    
    const scrollAnchor = document.createElement('div');
    scrollAnchor.id = 'scroll-anchor';
    chatContainer.appendChild(scrollAnchor);

    const observer = new IntersectionObserver(([entry]) => {
        isUserAtBottom = entry.isIntersecting;
        if (isUserAtBottom) hideJumpToBottomBtn();
    }, { root: chatContainer, threshold: 0.5 });
    observer.observe(scrollAnchor);
    
    const scrollToBottom = (behavior = 'auto') => scrollAnchor.scrollIntoView({ behavior, block: 'end' });

    const toggleUIState = (isChatActive, title = "Welcome") => {
        welcomeScreen.classList.toggle('hidden', isChatActive);
        chatArea.classList.toggle('hidden', !isChatActive);
        chatTitle.textContent = title;
        messageInput.disabled = !isChatActive;
        document.getElementById('send-button').disabled = !isChatActive;
        if (!isChatActive) currentSessionId = null;
    };

    const appendMessage = (sender, message, isMarkdown = false) => {
        if (!isUserAtBottom) showJumpToBottomBtn();
        
        const messageElement = document.createElement('div');
        // --- UPDATED COLORS FOR NEON THEME ---
        const bubbleClass = sender === 'user' ? 'bg-gray-800 text-white self-end' : 'bg-gray-900 text-white self-start';
        messageElement.className = `max-w-xl p-3 rounded-lg ${bubbleClass} whitespace-pre-wrap break-words`;
        
        if (isMarkdown) {
            messageElement.innerHTML = DOMPurify.sanitize(marked.parse(message));
            messageElement.classList.add('prose');
        } else {
            messageElement.textContent = message;
        }
        
        chatContainer.insertBefore(messageElement, scrollAnchor);
        if (isUserAtBottom) scrollToBottom();
        return messageElement;
    };

    const closeSidebar = () => sidebar.classList.add('-translate-x-full');
    
    const sendMessage = async (event) => {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (!userMessage || !currentSessionId) return;
    
        appendMessage('user', userMessage);
        messageInput.value = '';
        messageInput.focus();
    
        const botMessageElement = appendMessage('bot', '', true);
        botMessageElement.classList.add('streaming-text');
    
        let fullBotResponse = '';
    
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage }),
            });
    
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
    
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
    
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6);
                        if (dataStr.trim()) {
                            const data = JSON.parse(dataStr);
                            if (data.text) {
                                fullBotResponse += data.text;
                                botMessageElement.innerHTML = DOMPurify.sanitize(marked.parse(fullBotResponse));
                                if (isUserAtBottom) scrollToBottom();
                            } else if (data.error) {
                                botMessageElement.textContent = data.error;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            botMessageElement.textContent = 'Sorry, an error occurred while streaming.';
        } finally {
            botMessageElement.classList.remove('streaming-text');
            if(fullBotResponse) saveChatTurn(userMessage, fullBotResponse);
        }
    };

    const saveChatTurn = async (userMessage, botResponse) => {
        try {
            await fetch('/save_chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    user_message: userMessage,
                    bot_response: botResponse,
                }),
            });
        } catch (error) { console.error('Error saving chat turn:', error); }
    };

    const startNewChat = async () => {
        try {
            closeSidebar();
            const response = await fetch('/new_chat', { method: 'POST' });
            const data = await response.json();
            currentSessionId = data.session_id;
            chatContainer.innerHTML = '';
            chatContainer.appendChild(scrollAnchor);
            toggleUIState(true, "New Chat");
            await loadHistoryList();
        } catch (error) { console.error('Error starting new chat:', error); }
    };
    
    const deleteConversation = async (sessionIdToDelete, historyItemElement) => {
        try {
            await fetch(`/history/${sessionIdToDelete}`, { method: 'DELETE' });
            if (currentSessionId === sessionIdToDelete) toggleUIState(false, "Welcome");
            historyItemElement.remove();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            loadHistoryList(); 
        }
    };

    const loadHistoryList = async () => {
        try {
            const response = await fetch('/history');
            const histories = await response.json();
            historyList.innerHTML = '';
            histories.forEach(history => {
                if (!history.title) return;
                
                const historyItemContainer = document.createElement('div');
                historyItemContainer.className = 'group flex items-center justify-between p-2 rounded-md hover:bg-gray-800'; // UPDATED COLOR
                
                const title = document.createElement('span');
                title.className = 'text-sm truncate cursor-pointer flex-grow text-white'; // UPDATED COLOR
                title.textContent = history.title;
                title.addEventListener('click', () => loadConversation(history.id, history.title));
                
                const defaultView = document.createElement('div');
                const confirmView = document.createElement('div');
                confirmView.className = 'hidden flex items-center space-x-1';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-gray-700'; // UPDATED COLOR
                deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
                defaultView.appendChild(deleteBtn);

                const confirmBtn = document.createElement('button');
                confirmBtn.className = 'p-1 rounded-full hover:bg-gray-700'; // UPDATED COLOR
                confirmBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
                
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'p-1 rounded-full hover:bg-gray-700'; // UPDATED COLOR
                cancelBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;

                confirmView.appendChild(confirmBtn);
                confirmView.appendChild(cancelBtn);

                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('#history-list .js-confirm-view').forEach(el => el.classList.add('hidden'));
                    document.querySelectorAll('#history-list .js-default-view').forEach(el => el.classList.remove('hidden'));
                    defaultView.classList.add('hidden');
                    confirmView.classList.remove('hidden');
                });

                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    defaultView.classList.remove('hidden');
                    confirmView.classList.add('hidden');
                });
                
                confirmBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteConversation(history.id, historyItemContainer);
                });

                defaultView.classList.add('js-default-view');
                confirmView.classList.add('js-confirm-view');
                
                historyItemContainer.appendChild(title);
                historyItemContainer.appendChild(defaultView);
                historyItemContainer.appendChild(confirmView);
                historyList.appendChild(historyItemContainer);
            });
        } catch (error) { console.error('Error loading history:', error); }
    };
            
    const loadConversation = async (sessionId, title) => {
        try {
            closeSidebar();
            const response = await fetch(`/history/${sessionId}`);
            const data = await response.json();
            currentSessionId = data.session_id;
            chatContainer.innerHTML = '';
            chatContainer.appendChild(scrollAnchor);
            data.messages.forEach(turn => {
                appendMessage('user', turn.user);
                appendMessage('bot', turn.bot, true);
            });
            toggleUIState(true, title);
            setTimeout(() => scrollToBottom('smooth'), 100);
        } catch (error) { console.error('Error loading conversation:', error); }
    };
    
    newChatButton.addEventListener('click', startNewChat);
    chatForm.addEventListener('submit', sendMessage);
    openSidebarButton.addEventListener('click', () => sidebar.classList.remove('-translate-x-full'));
    closeSidebarButton.addEventListener('click', closeSidebar);
    jumpToBottomBtn.addEventListener('click', () => scrollToBottom('smooth'));

    toggleUIState(false);
    loadHistoryList();
});
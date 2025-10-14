(function() {
    'use strict';
    
    // დავრწმუნდეთ, რომ გლობალური namespace არსებობს
    window.GeminiPowerUp = window.GeminiPowerUp || {};
    
    // ამ მოდულისთვის საჭირო ცვლადები
    let promptsPanel, promptsList, promptModal, activeModalPrompt = null;
    let isUpdatingLinks = false; // Lock to prevent link/unlink race conditions

    // Storage Helper ფუნქციები
    const getPrompts = async () => {
        try {
            if (chrome.runtime?.id && window.GeminiPowerUp.getStorage) {
                const data = await window.GeminiPowerUp.getStorage('savedPrompts');
                return data.savedPrompts || [];
            }
        } catch (error) { console.warn("Could not get prompts, context likely invalidated.", error); }
        return [];
    };

    const savePrompts = async (prompts) => {
        try {
            if (chrome.runtime?.id && window.GeminiPowerUp.setStorage) {
                await window.GeminiPowerUp.setStorage({ savedPrompts: prompts });
            }
        } catch (error) { console.warn("Could not save prompts, context likely invalidated.", error); }
    };

    // UI-ს შექმნის ფუნქცია
    function initializePromptManagerUI() {
        if (document.querySelector('.prompts-panel')) return;

        // --- პრომპტების პანელის შექმნა ---
        promptsPanel = document.createElement('div');
        promptsPanel.className = 'prompts-panel';
        promptsPanel.innerHTML = `
            <div class="prompts-panel-header">
                <span class="prompts-panel-header-title">Saved Prompts</span>
                <div class="header-actions">
                <button class="prompt-assistant-btn" title="Prompt Assistant"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"></path></svg></button>
                    <button class="new-prompt-btn" title="Create New Prompt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg></button>
                    <button class="import-btn" title="Import Prompts"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"></path></svg></button>
                    <button class="export-btn" title="Export Prompts"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></button>
                    <button class="search-prompt-btn" title="Search Prompts"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg></button>
                </div>
                <div class="prompt-search-wrapper">
                    <input type="text" class="prompt-search-input" placeholder="Search prompts...">
                    <button class="close-search-btn" title="Close Search"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg></button>
                </div>
                <input type="file" id="prompt-file-importer" style="display:none" accept=".json">
            </div>
            <ul class="prompts-list"></ul>`;
        
        const header = promptsPanel.querySelector('.prompts-panel-header');
        const searchInput = promptsPanel.querySelector('.prompt-search-input');
        const searchBtn = promptsPanel.querySelector('.search-prompt-btn');
        const closeSearchBtn = promptsPanel.querySelector('.close-search-btn');
        const fileImporter = promptsPanel.querySelector('#prompt-file-importer');

        searchBtn.onclick = () => { header.classList.add('search-active'); searchInput.focus(); };
        closeSearchBtn.onclick = () => { header.classList.remove('search-active'); searchInput.value = ''; renderPrompts(); };
        searchInput.oninput = (e) => renderPrompts(e.target.value);
        promptsPanel.querySelector('.new-prompt-btn').onclick = createPromptModal;
        promptsPanel.querySelector('.prompt-assistant-btn').onclick = startPromptAssistantSession;
        promptsPanel.querySelector('.export-btn').onclick = exportPrompts;
        promptsPanel.querySelector('.import-btn').onclick = () => fileImporter.click();
        fileImporter.onchange = importPrompts;

        document.body.appendChild(promptsPanel);
        promptsList = promptsPanel.querySelector('.prompts-list');
        window.GeminiPowerUp.promptsPanel = promptsPanel;

        // --- მოდალური ფანჯრის შექმნა ---
        promptModal = document.createElement('div');
        promptModal.className = 'prompt-modal-overlay';
        promptModal.innerHTML = `<div class="prompt-modal-container"></div>`;
        promptModal.onclick = (e) => { if (e.target === promptModal) closeModal(); };
        document.body.appendChild(promptModal);

        renderPrompts();
    }

    async function renderPrompts(filterText = '') {
        const prompts = await getPrompts();
        promptsList.innerHTML = '';
        const lowerCaseFilter = filterText.trim().toLowerCase();
        const filteredPrompts = lowerCaseFilter ? prompts.filter(p => p.text.toLowerCase().includes(lowerCaseFilter)) : prompts;

        if (prompts.length === 0) {
            promptsList.innerHTML = `<div class="empty-list-message">The list is empty.<br>Add new prompts using the save button.</div>`;
            return;
        }
        if (filteredPrompts.length === 0) {
            promptsList.innerHTML = `<div class="empty-list-message">No prompts found.</div>`;
            return;
        }
        filteredPrompts.forEach(prompt => {
            const li = document.createElement('li');
            li.dataset.id = prompt.id;
            
            const isLinked = prompt.linkedProjects && prompt.linkedProjects.length > 0;
            if (isLinked) {
                li.classList.add('is-linked');
            }

            const linkIndicatorHTML = isLinked 
                ? `<span class="prompt-link-indicator" title="Linked to ${prompt.linkedProjects.length} project(s)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8v-2z"></path></svg></span>`
                : '';

            li.innerHTML = `
                ${linkIndicatorHTML}
                <div class="prompt-text">${escapeHTML(prompt.text)}</div>
                <div class="prompt-actions">
                    <button class="use-prompt" title="Use Prompt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg></button>
                    <button class="manage-prompt-links" title="Manage Links & Move"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg></button>
                    <button class="edit-prompt" title="Edit"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg></button>
                    <button class="delete-prompt" title="Delete"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg></button>
                </div>`;
            li.onclick = () => showPromptModal(prompt);
            li.querySelector('.use-prompt').onclick = (e) => { e.stopPropagation(); usePrompt(prompt.text); };
            li.querySelector('.manage-prompt-links').onclick = (e) => { e.stopPropagation(); openLinkManagerModal(prompt); };
            li.querySelector('.edit-prompt').onclick = (e) => { e.stopPropagation(); editPromptModal(prompt); };
            li.querySelector('.delete-prompt').onclick = (e) => { e.stopPropagation(); deletePrompt(prompt.id); };
            promptsList.appendChild(li);
        });
        if (!lowerCaseFilter) {
            new Sortable(promptsList, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onStart: () => promptsList.classList.add('is-dragging'),
                onEnd: async (evt) => {
                    promptsList.classList.remove('is-dragging');
                    const newOrderIds = Array.from(promptsList.children).map(li => li.dataset.id);
                    let currentPrompts = await getPrompts();
                    currentPrompts.sort((a, b) => newOrderIds.indexOf(String(a.id)) - newOrderIds.indexOf(String(b.id)));
                    await savePrompts(currentPrompts);
                }
            });
        }
    }
    
    async function exportPrompts() {
        const prompts = await getPrompts();
        if (prompts.length === 0) { alert("No prompts to export."); return; }
        const jsonString = JSON.stringify(prompts, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-prompts-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function importPrompts(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedPrompts = JSON.parse(e.target.result);
                if (!Array.isArray(importedPrompts) || (importedPrompts.length > 0 && (typeof importedPrompts[0].id === 'undefined' || typeof importedPrompts[0].text === 'undefined'))) {
                    alert('Error: Invalid prompt file format.'); return;
                }
                const existingPrompts = await getPrompts();
                const existingTexts = new Set(existingPrompts.map(p => p.text));
                const newUniquePrompts = importedPrompts.filter(p => p.text && !existingTexts.has(p.text));
                if (newUniquePrompts.length > 0) {
                    const combinedPrompts = [...existingPrompts, ...newUniquePrompts];
                    await savePrompts(combinedPrompts);
                    await renderPrompts();
                    alert(`${newUniquePrompts.length} new prompt(s) imported successfully!`);
                } else {
                    alert("No new prompts to import. All prompts from the file already exist.");
                }
            } catch (error) {
                alert('Error: Could not parse the file. Please ensure it is a valid JSON file.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }
    
    function closeModal() { if(promptModal) promptModal.classList.remove('visible'); activeModalPrompt = null; }

    function showPromptModal(prompt) {
        activeModalPrompt = prompt;
        const container = promptModal.querySelector('.prompt-modal-container');
        container.innerHTML = `
            <div class="prompt-modal-header">
                <div class="prompt-modal-actions">
                    <button class="modal-use-btn">Use</button>
                    <button class="modal-manage-btn">Manage</button>
                    <button class="modal-edit-btn">Edit</button>
                    <button class="modal-delete-btn">Delete</button>
                </div>
                <button class="prompt-modal-close">&times;</button>
            </div>
            <div class="prompt-modal-content"><div class="prompt-modal-text"></div></div>`;
        container.querySelector('.prompt-modal-text').innerText = prompt.text;
        container.querySelector('.prompt-modal-close').onclick = closeModal;
        container.querySelector('.modal-use-btn').onclick = () => { usePrompt(prompt.text); closeModal(); };
        container.querySelector('.modal-manage-btn').onclick = () => openLinkManagerModal(prompt); // Added action
        container.querySelector('.modal-edit-btn').onclick = () => editPromptModal(prompt);
        container.querySelector('.modal-delete-btn').onclick = async () => { await deletePrompt(prompt.id); closeModal(); };
        promptModal.classList.add('visible');
    }

    function editPromptModal(prompt) {
        activeModalPrompt = prompt;
        const container = promptModal.querySelector('.prompt-modal-container');
        container.innerHTML = `
            <div class="prompt-modal-header">
                <div class="prompt-modal-actions">
                    <button class="modal-save-btn">Save</button> <button class="modal-cancel-btn">Cancel</button>
                </div> <button class="prompt-modal-close">&times;</button>
            </div>
            <div class="prompt-modal-content"><textarea class="prompt-modal-textarea">${escapeHTML(prompt.text)}</textarea></div>`;
        container.querySelector('.prompt-modal-close').onclick = closeModal;
        container.querySelector('.modal-cancel-btn').onclick = () => showPromptModal(prompt);
        container.querySelector('.modal-save-btn').onclick = async () => {
            const newText = container.querySelector('.prompt-modal-textarea').value;
            let prompts = await getPrompts();
            const pIndex = prompts.findIndex(p => p.id === prompt.id);
            if (pIndex > -1) {
                prompts[pIndex].text = newText;
                await savePrompts(prompts);
                await renderPrompts();
                showPromptModal(prompts[pIndex]);
            }
        };
        if (!promptModal.classList.contains('visible')) promptModal.classList.add('visible');
    }

    function createPromptModal() {
        activeModalPrompt = null;
        const container = promptModal.querySelector('.prompt-modal-container');
        container.innerHTML = `
            <div class="prompt-modal-header">
                <div class="prompt-modal-actions">
                    <button class="modal-save-btn">Save</button> <button class="modal-cancel-btn">Cancel</button>
                </div> <button class="prompt-modal-close">&times;</button>
            </div>
            <div class="prompt-modal-content"><textarea class="prompt-modal-textarea" placeholder="Enter your prompt here..."></textarea></div>`;
        container.querySelector('.prompt-modal-close').onclick = closeModal;
        container.querySelector('.modal-cancel-btn').onclick = closeModal;
        container.querySelector('.modal-save-btn').onclick = async () => {
            const newText = container.querySelector('.prompt-modal-textarea').value;
            if (newText.trim() === '') return;
            let prompts = await getPrompts();
            prompts.unshift({ id: Date.now(), text: newText });
            await savePrompts(prompts);
            await renderPrompts();
            closeModal();
        };
        promptModal.classList.add('visible');
    }

    async function deletePrompt(id) {
        const confirmed = await window.GeminiPowerUp.showNotification({
            state: 'confirm',
            message: 'Are you sure you want to delete this prompt?',
            buttons: [
                { text: 'Delete', className: 'gpus-toast-confirm-btn', value: true },
                { text: 'Cancel', className: 'gpus-toast-cancel-btn', value: false }
            ]
        });
        if (!confirmed) return;
    
        const allPrompts = await getPrompts();
        const promptToDelete = allPrompts.find(p => p.id === id);
    
        if (promptToDelete && promptToDelete.linkedProjects && promptToDelete.linkedProjects.length > 0) {
            // If the prompt is linked, we need to clean up those links in the projects
            const allProjects = await (window.GeminiPowerUp.getStorage('geminiProjects').then(d => d.geminiProjects || []));
            promptToDelete.linkedProjects.forEach(projectId => {
                const project = allProjects.find(p => p.id === projectId);
                if (project && project.context && project.context.linkedPromptIds) {
                    project.context.linkedPromptIds = project.context.linkedPromptIds.filter(promptId => promptId !== id);
                }
            });
            await window.GeminiPowerUp.setStorage({ geminiProjects: allProjects });
        }
    
        // Finally, delete the prompt itself
        const remainingPrompts = allPrompts.filter(p => p.id !== id);
        await savePrompts(remainingPrompts);
        await renderPrompts();
    }

    function usePrompt(text) {
        const inputArea = document.querySelector('.ql-editor');
        if (inputArea) {
            const htmlContent = escapeHTML(text).split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
            inputArea.innerHTML = htmlContent;
            inputArea.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(inputArea);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        if (promptsPanel.classList.contains('visible')) {
            window.GeminiPowerUp.togglePromptsPanel();
        }
    }

    async function openLinkManagerModal(prompt) {
        const PROJECTS_KEY = 'geminiProjects';
        const projectsData = await window.GeminiPowerUp.getStorage(PROJECTS_KEY);
        let allProjects = projectsData[PROJECTS_KEY] || [];
    
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'gpus-manage-links-modal-overlay';
    
        const renderContent = (currentPrompt) => {
            let projectOptions = allProjects.length > 0
                ? allProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')
                : '<option disabled>No projects found</option>';
    
            let projectListHTML = allProjects.length > 0
                ? allProjects.map(p => {
                    const isLinked = currentPrompt.linkedProjects?.some(pid => String(pid) === String(p.id));
                    const buttonHTML = isLinked
                        ? `<button class="gpus-link-toggle-btn linked" data-project-id="${p.id}">Unlink</button>`
                        : `<button class="gpus-link-toggle-btn" data-project-id="${p.id}">Link</button>`;
                    
                    return `
                        <li class="gpus-link-manager-item">
                            <span>${escapeHTML(p.name)}</span>
                            ${buttonHTML}
                        </li>`;
                }).join('')
                : '<li class="gpus-link-manager-empty">No projects available to link.</li>';
    
            modalOverlay.innerHTML = `
                <div class="gpus-manage-links-panel">
                    <div class="gpus-manage-links-header">
                        <h3>Manage Prompt</h3>
                        <button class="gpus-manage-links-close-btn">&times;</button>
                    </div>
                    <div class="gpus-manage-links-content">
                        <div class="gpus-manage-links-section">
                            <div class="gpus-section-header">
                                <svg class="gpus-section-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>
                                <h4>Move to Project</h4>
                            </div>
                            <div class="gpus-move-section">
                                <select id="gpus-move-project-select">${projectOptions}</select>
                                <button id="gpus-move-prompt-btn" ${allProjects.length === 0 ? 'disabled' : ''}>Move</button>
                            </div>
                        </div>
                        <div class="gpus-manage-links-section">
                            <div class="gpus-section-header">
                                <svg class="gpus-section-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8v-2z"></path></svg>
                                <h4>Link to Projects</h4>
                            </div>
                            <ul class="gpus-projects-link-list">${projectListHTML}</ul>
                        </div>
                    </div>
                </div>`;
            
            attachListeners(currentPrompt);
        };
    
        const attachListeners = (currentPrompt) => {
            modalOverlay.querySelector('.gpus-manage-links-close-btn').onclick = close;
            modalOverlay.querySelector('.gpus-projects-link-list').addEventListener('click', async (e) => {
            if (isUpdatingLinks) return; // Prevent concurrent operations
            isUpdatingLinks = true;

            const button = e.target.closest('.gpus-link-toggle-btn');
            if (!button) {
                isUpdatingLinks = false;
                return;
            }

            try {
                const projectId = button.dataset.projectId;
                const isCurrentlyLinked = button.classList.contains('linked');
    
                if (isCurrentlyLinked) {
                    if (await window.GeminiPowerUp.unlinkPromptFromProject(currentPrompt.id, projectId)) {
                        window.GeminiPowerUp.showNotification({ state: 'success', message: 'Prompt unlinked.', duration: 1500 });
                        button.textContent = 'Link';
                        button.classList.remove('linked');
                        // Update the prompt object in memory
                        currentPrompt.linkedProjects = currentPrompt.linkedProjects.filter(pid => String(pid) !== String(projectId));
                    }
                } else {
                    if (await window.GeminiPowerUp.linkPromptToProject(currentPrompt.id, projectId)) {
                        window.GeminiPowerUp.showNotification({ state: 'success', message: 'Prompt linked!', duration: 1500 });
                        button.textContent = 'Unlink';
                        button.classList.add('linked');
                        // Update the prompt object in memory
                        currentPrompt.linkedProjects = currentPrompt.linkedProjects || [];
                        currentPrompt.linkedProjects.push(Number(projectId));
                    }
                }
                await renderPrompts(); // Refresh main list to show/hide link indicator
            } finally {
                isUpdatingLinks = false; // Always release the lock
            }
        });
    
            const moveBtn = modalOverlay.querySelector('#gpus-move-prompt-btn');
            if (moveBtn) {
                moveBtn.onclick = async () => {
                    // ... (move logic remains the same)
                    const selectedProjectId = modalOverlay.querySelector('#gpus-move-project-select').value;
                    if (!selectedProjectId) return;
    
                    const allPrompts = await getPrompts();
                    const projectsData = await window.GeminiPowerUp.getStorage(PROJECTS_KEY);
                    const allProjects = projectsData[PROJECTS_KEY] || [];
                    
                    const project = allProjects.find(p => p.id == selectedProjectId);
                    const promptToMove = allPrompts.find(p => p.id === currentPrompt.id);
    
                    if (!project || !promptToMove) return;
    
                    project.context = project.context || { persona: '', prompts: [], files: [] };
                    project.context.prompts = project.context.prompts || [];
    
                    project.context.prompts.push(promptToMove);
                    const remainingGlobalPrompts = allPrompts.filter(p => p.id !== currentPrompt.id);
    
                    await savePrompts(remainingGlobalPrompts);
                    await window.GeminiPowerUp.setStorage({ [PROJECTS_KEY]: allProjects });
                    
                    window.GeminiPowerUp.showNotification({ state: 'success', message: `Prompt moved to "${project.name}"`, duration: 2500 });
                    close();
                    renderPrompts();
                };
            }
        };
    
        const close = () => {
            modalOverlay.remove();
            renderPrompts(); // Always refresh the main list on close
        };
    
        document.body.appendChild(modalOverlay);
        renderContent(prompt);
        modalOverlay.onclick = e => { if (e.target === modalOverlay) close(); };
        modalOverlay.classList.add('visible');
    }

    function startPromptAssistantSession() {
        // Set all necessary flags to "arm" the new chat session immediately
        const navToken = `gpus_token_${Date.now()}`;
        sessionStorage.setItem('gpus_navigation_token', navToken);
        sessionStorage.setItem('gpus_is_prompt_assistant_mode', 'true'); // Specific flag for this mode
        sessionStorage.setItem('gpus_is_armed_for_super_prompt', 'true'); // Main arming flag
        sessionStorage.setItem('gpus_pending_chat_type', 'assistant');

        // Find the correct base URL for a new chat
        const userPrefixMatch = window.location.pathname.match(/^\/u\/\d+\//);
        const newChatUrl = userPrefixMatch ? `${userPrefixMatch[0]}app` : '/app';
        
        // Navigate to the new chat
        window.location.href = `${newChatUrl}#${navToken}`;

        // Close the prompt manager panel if it's open
        if (promptsPanel && promptsPanel.classList.contains('visible')) {
            window.GeminiPowerUp.togglePromptsPanel();
        }
    }

    

    async function addSavePromptButton(userQuery, savedTexts) {
        const queryText = userQuery.querySelector('.query-text')?.innerText;
        const copyButtonWrapper = userQuery.querySelector('button[aria-label="Copy prompt"]')?.parentElement;

        if (!queryText || !copyButtonWrapper || userQuery.querySelector('.gpus-save-prompt-btn')) return;

        const saveButtonWrapper = copyButtonWrapper.cloneNode(true);
        // Add a dedicated wrapper class for easier targeting
        saveButtonWrapper.classList.add('gpus-save-prompt-wrapper');
        const saveButton = saveButtonWrapper.querySelector('button');
        const saveIconEl = saveButtonWrapper.querySelector('mat-icon');

        saveButton.classList.add('gpus-save-prompt-btn');
        saveButton.setAttribute('aria-label', 'Save Prompt');
        saveButton.setAttribute('data-gpus-tooltip', 'Save Prompt');
        saveButton.removeAttribute('jslog');
        saveButton.removeAttribute('mattooltip');
        saveButton.removeAttribute('aria-describedby');

        const iconStyle = "width: 18px; height: 18px; font-size: 18px;";
        saveIconEl.innerHTML = `<svg class="save-icon" viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"></path></svg><svg class="saved-icon" viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg>`;
        saveIconEl.removeAttribute('fonticon');
        saveIconEl.classList.remove('google-symbols', 'mat-ligature-font');

        if (savedTexts.has(queryText)) {
            saveButton.classList.add('saved');
            saveButton.setAttribute('data-gpus-tooltip', 'Prompt is already saved');
        }

        saveButton.onclick = async (e) => {
            e.stopPropagation();
            if (saveButton.classList.contains('saved')) return;

            const currentPrompts = await getPrompts();
            if (currentPrompts.some(p => p.text === queryText)) {
                saveButton.classList.add('saved');
                saveButton.setAttribute('data-gpus-tooltip', 'Prompt is already saved');
                return;
            }
            currentPrompts.unshift({ id: Date.now(), text: queryText });
            await savePrompts(currentPrompts);

            // Re-render the list unconditionally to ensure UI is always in sync.
            await renderPrompts();
            
            saveButton.classList.add('saved');
            saveButton.setAttribute('data-gpus-tooltip', 'Prompt Saved!');
        };

        copyButtonWrapper.insertAdjacentElement('beforebegin', saveButtonWrapper);
    }

    function escapeHTML(str) {
        const p = document.createElement("p");
        p.appendChild(document.createTextNode(str));
        return p.innerHTML;
    }

    // --- Public API ---
    async function addNewPromptFromText(text) {
        if (!text || text.trim() === '') return;
        let prompts = await getPrompts();
        // Check if a prompt with the exact same text already exists
        if (prompts.some(p => p.text.trim() === text.trim())) {
            // Silently ignore duplicates, or show a notification if desired
            console.log("GPUS: Prompt already exists in the library.");
            return;
        }
        prompts.unshift({ id: Date.now(), text: text.trim() });
        await savePrompts(prompts);
        // If the panel is open, refresh it to show the new prompt
        if (promptsPanel && promptsPanel.classList.contains('visible')) {
            await renderPrompts();
        }
    }

    window.GeminiPowerUp.addNewPromptFromText = addNewPromptFromText;
    window.GeminiPowerUp.startPromptAssistantSession = startPromptAssistantSession;

    window.GeminiPowerUp.togglePromptsPanel = async () => {
        if (!promptsPanel) initializePromptManagerUI();

        window.GeminiPowerUp.managePanelToggle(
            promptsPanel,
            '.fab-prompt-manager-btn',
            window.GeminiPowerUp.togglePromptsPanel
        );

        // Re-render the list if the panel is now visible
        if (promptsPanel.classList.contains('visible')) {
            await renderPrompts();
        }
    };

    window.GeminiPowerUp.processUserQueries = async () => {
        if (!chrome.runtime?.id) return;
        const prompts = await getPrompts();
        const savedTexts = new Set(prompts.map(p => p.text));
        document.querySelectorAll('user-query:not(.processed-save)').forEach(el => {
            addSavePromptButton(el, savedTexts);
            el.classList.add('processed-save');
        });
    };
    
    // --- Initialize Module ---
    initializePromptManagerUI();

    async function openPromptEditor(promptId, onSaveCallback) {
        if (!promptModal) initializePromptManagerUI(); // Ensure UI is ready

        const prompts = await getPrompts();
        const promptToEdit = prompts.find(p => String(p.id) === String(promptId));


        if (!promptToEdit) {
            console.error("Prompt not found for editing:", promptId);
            return;
        }
        
        activeModalPrompt = promptToEdit; // Set the active prompt for the modal
        const container = promptModal.querySelector('.prompt-modal-container');

        // Build the editor UI
        container.innerHTML = `
            <div class="prompt-modal-header">
                <div class="prompt-modal-actions">
                    <button class="modal-save-btn">Save Changes</button>
                    <button class="modal-cancel-btn">Cancel</button>
                </div>
                <button class="prompt-modal-close">&times;</button>
            </div>
            <div class="prompt-modal-content"><textarea class="prompt-modal-textarea">${escapeHTML(promptToEdit.text)}</textarea></div>`;
        
        const closeModalAndReset = () => {
            promptModal.classList.remove('visible');
            activeModalPrompt = null;
        };

        container.querySelector('.prompt-modal-close').onclick = closeModalAndReset;
        container.querySelector('.modal-cancel-btn').onclick = closeModalAndReset;

        container.querySelector('.modal-save-btn').onclick = async () => {
            const newText = container.querySelector('.prompt-modal-textarea').value.trim();
            if (newText) {
                const allPrompts = await getPrompts();
                const pIndex = allPrompts.findIndex(p => String(p.id) === String(promptId));
                if (pIndex > -1) {
                    allPrompts[pIndex].text = newText;
                    await savePrompts(allPrompts);
                    
                    if (typeof onSaveCallback === 'function') {
                        onSaveCallback();
                    }
                }
                closeModalAndReset();
            }
        };

        promptModal.classList.add('visible');
        container.querySelector('.prompt-modal-textarea').focus();
    }

    window.GeminiPowerUp.openPromptEditor = openPromptEditor;

})();
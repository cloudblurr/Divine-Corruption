// ui/nodes.js - Story Nodes / Scenario management
import { getState, saveNodes, setActiveNode } from '../state.js';
import { showToast } from './toast.js';
import { switchTab } from '../main.js';
import { generateNodeExportHTML } from '../utils/ai.js';

export function initNodesUI() {
  renderNodes();

  const createBtn = document.getElementById('btn-create-node');
  if (createBtn) {
    createBtn.onclick = openCreateNodeModal;
  }
}

function renderNodes() {
  const state = getState();
  const grid = document.getElementById('nodes-grid');
  const empty = document.getElementById('nodes-empty');

  if (!grid) return;
  grid.innerHTML = '';

  const nodes = state.nodes || [];

  if (nodes.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  nodes.forEach((node, index) => {
    const isActive = state.activeNodeId === node.id;

    const card = document.createElement('div');
    card.className = `node-card card rounded-3xl border ${isActive ? 'border-amber-400 bg-amber-400/5' : 'border-white/10 bg-white/5'} p-5 cursor-pointer`;

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-lg leading-tight pr-6">${node.title}</div>
          <div class="text-xs text-amber-400/70 mt-1">${node.description?.slice(0, 90) || 'A sacred encounter...'}</div>
        </div>
        ${isActive ? `<div class="text-[10px] px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-medium shrink-0">ACTIVE</div>` : ''}
      </div>

      <div class="mt-5 flex items-center justify-between text-sm">
        <button class="enter-btn text-amber-400 hover:underline">Enter Scenario</button>
        
        <div class="flex items-center gap-3">
          <button class="compile-btn text-xs px-3 py-1 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30 transition">Compile Arc</button>
          <button class="export-btn text-xs px-3 py-1 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-900/30 transition">Export Manuscript</button>
          <button class="delete-node-btn text-xs text-red-400 hover:text-red-300">×</button>
        </div>
      </div>
    `;

    // Click whole card to enter
    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      enterNode(node.id);
    };

    // Enter button
    card.querySelector('.enter-btn').onclick = (e) => {
      e.stopImmediatePropagation();
      enterNode(node.id);
    };

    // Compile
    card.querySelector('.compile-btn').onclick = async (e) => {
      e.stopImmediatePropagation();
      await compileNode(node, index);
    };

    // Export as beautiful standalone HTML manuscript
    const exportBtn = card.querySelector('.export-btn');
    if (exportBtn) {
      exportBtn.onclick = async (e) => {
        e.stopImmediatePropagation();
        await exportNodeAsManuscript(node);
      };
    }

    // Delete
    card.querySelector('.delete-node-btn').onclick = async (e) => {
      e.stopImmediatePropagation();
      if (!confirm('Delete this story arc?')) return;
      const updated = state.nodes.filter((_, i) => i !== index);
      await saveNodes(updated);
      if (state.activeNodeId === node.id) {
        await setActiveNode(null);
      }
      renderNodes();
    };

    grid.appendChild(card);
  });
}

function openCreateNodeModal() {
  const modal = document.getElementById('modal-node');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const titleInput = document.getElementById('node-title');
  const descInput = document.getElementById('node-desc');
  const initialInput = document.getElementById('node-initial');
  const cancelBtn = document.getElementById('btn-cancel-node');
  const saveBtn = document.getElementById('btn-save-node');

  titleInput.value = '';
  descInput.value = '';
  initialInput.value = '';

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  cancelBtn.onclick = close;

  saveBtn.onclick = async () => {
    const title = titleInput.value.trim();
    if (!title) {
      showToast('Please give the story arc a title.', 'error');
      return;
    }

    const state = getState();
    const newNode = {
      id: 'node-' + Date.now(),
      title,
      description: descInput.value.trim(),
      initialPrompt: initialInput.value.trim(),
      createdAt: new Date().toISOString(),
      newDawn: true,
      chatHistory: []
    };

    const updated = [...(state.nodes || []), newNode];
    await saveNodes(updated);

    renderNodes();
    showToast('New story arc created. Enter it to begin the encounter.');
    close();
  };

  modal.onclick = (e) => { if (e.target === modal) close(); };
}

async function enterNode(nodeId) {
  const state = getState();
  await setActiveNode(nodeId);

  // Switch to chat tab
  switchTab('chat');

  // Trigger chat UI refresh (via custom event or direct call)
  const event = new CustomEvent('node-changed', { detail: { nodeId } });
  document.dispatchEvent(event);
}

async function compileNode(node, index) {
  const state = getState();
  if (!node.chatHistory || node.chatHistory.length < 2) {
    showToast('Not enough conversation to compile yet.', 'error');
    return;
  }

  // Use AI to summarize and create memory
  const { compileConversation } = await import('../utils/ai.js');
  const memoryEntry = await compileConversation(node.chatHistory, node.title);

  // Add to memory
  const newMemory = [...(state.memory || []), memoryEntry];
  const { saveMemory } = await import('../state.js');
  await saveMemory(newMemory);

  // Close the arc: clear its chat history and deactivate
  const updatedNodes = [...state.nodes];
  updatedNodes[index] = {
    ...updatedNodes[index],
    chatHistory: [],
    compiledAt: new Date().toISOString(),
    newDawn: false
  };
  await saveNodes(updatedNodes);

  if (state.activeNodeId === node.id) {
    await setActiveNode(null);
  }

  showToast('Arc compiled. Wisdom added to Eternal Memory.', 'success');

  // Refresh both views
  renderNodes();
  // Memory panel will refresh when user visits
}

async function exportNodeAsManuscript(node) {
  const state = getState();
  const character = state.character;
  const gallery = state.gallery || [];

  const htmlContent = generateNodeExportHTML(node, character, gallery);

  // Create downloadable standalone HTML file
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const safeTitle = (node.title || 'sacred-arc').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `${safeTitle}-divine-manuscript.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Sacred manuscript exported. Open the HTML file in any browser.', 'success');
}

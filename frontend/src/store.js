import { create } from 'zustand'

const useStore = create((set, get) => ({
  // repo state
  repoUrl: '',
  repoStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  repoError: null,

  // embedding provider
  provider: 'local',
  apiKey: '',

  // graph data
  graph: null,
  nodeMap: {},

  // repo-level metadata (stars, forks, license, languages, contributors)
  repoMeta: null,

  // scene interaction
  selectedNode: null,
  selectedNodeId: null,
  hoveredNode: null,
  searchQuery: '',
  searchResults: [],
  highlightedNodes: new Set(),

  // camera
  cameraTarget: null,

  // agent
  agentPanel: null,

  // expanded file planet
  expandedFileId: null,

  // loading progress (SSE)
  loadingProgress: { stage: '', message: '', pct: 0 },

  // chat
  chatHistory: [],

  // actions
  setRepoUrl: (url) => set({ repoUrl: url }),

  setProvider: ({ provider, apiKey }) => set({ provider, apiKey }),

  setRepoStatus: (status, error = null) => set({ repoStatus: status, repoError: error }),

  setGraph: (graph) => {
    const nodeMap = {}
    if (graph?.nodes) {
      for (const node of graph.nodes) {
        nodeMap[node.id] = node
      }
    }
    set({ graph, nodeMap })
  },

  setSelectedNode: (node) => set({
    selectedNode: node,
    selectedNodeId: node?.id ?? null,
    agentPanel: null,
  }),

  setHoveredNode: (node) => set({ hoveredNode: node }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSearchResults: (results) => {
    const ids = new Set(results.map((r) => r.node_id))
    set({ searchResults: results, highlightedNodes: ids })
  },

  setCameraTarget: (target) => set({ cameraTarget: target }),

  setRepoMeta: (meta) => set({ repoMeta: meta }),

  setAgentPanel: (panel) => set({ agentPanel: panel }),

  setExpandedFile: (fileId) => set({ expandedFileId: fileId }),

  setLoadingProgress: (p) => set({ loadingProgress: p }),

  setChatHistory: (history) => set({ chatHistory: history }),

  clearSelection: () => set({
    selectedNode: null,
    selectedNodeId: null,
    agentPanel: null,
    expandedFileId: null,
    searchResults: [],
    highlightedNodes: new Set(),
    searchQuery: '',
  }),
}))

export default useStore

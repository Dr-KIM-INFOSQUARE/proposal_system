const API_BASE_URL = 'http://127.0.0.1:8000/api';

export const api = {
  uploadDocument: async (file: File, modelId: string = "models/gemini-3-flash-preview") => {
    const formData = new FormData();
    formData.append('file', file);
    
    // 쿼리 파라미터로 model_id 전달
    const response = await fetch(`${API_BASE_URL}/upload?model_id=${modelId}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
    }
    return response.json();
  },

  reanalyzeProject: async (documentId: string, modelId: string = "models/gemini-3-flash-preview") => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/reanalyze?model_id=${modelId}`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Re-analysis failed: ${response.statusText}`);
    }
    return response.json();
  },
  
  saveProject: async (documentId: string, filename: string, selectedNodeIds: (string | number)[], contentNodeIds: (string | number)[]) => {
    const response = await fetch(`${API_BASE_URL}/projects/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        filename: filename,
        selected_node_ids: selectedNodeIds,
        content_node_ids: contentNodeIds,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Save failed: ${response.statusText}`);
    }
    return response.json();
  },
  
  exportProject: async (documentId: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/export`);
    if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
    }
    return response.json();
  },
  
  getProjects: async () => {
    const response = await fetch(`${API_BASE_URL}/projects`);
    if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.statusText}`);
    }
    return response.json();
  },
  
  loadProject: async (documentId: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/load`);
    if (!response.ok) {
        throw new Error(`Failed to open project: ${response.statusText}`);
    }
    return response.json();
  },
  
  deleteProject: async (documentId: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`Failed to delete project: ${response.statusText}`);
    }
    return response.json();
  },
  
  getUsage: async () => {
    const response = await fetch(`${API_BASE_URL}/usage`);
    if (!response.ok) {
        throw new Error(`Failed to load usage data: ${response.statusText}`);
    }
    return response.json();
  }
};

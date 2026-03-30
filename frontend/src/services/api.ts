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
  
  saveProject: async (documentId: string, name: string, filename: string, selectedNodeIds: any[], contentNodeIds: any[]) => {
    const response = await fetch(`${API_BASE_URL}/projects/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        name: name,
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
  
  deleteUsageLog: async (logId: number) => {
    const response = await fetch(`${API_BASE_URL}/projects/usage/${logId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Delete usage log failed: ${response.statusText}`);
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
  },
  
  renameProject: async (documentId: string, newName: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        new_name: newName,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Rename failed: ${response.statusText}`);
    }
    return response.json();
  },

  enhanceIdea: async (documentId: string, ideaText: string, modelId: string = "models/gemini-3.1-pro-preview") => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/idea/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        idea_text: ideaText,
        model_id: modelId,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Idea enhance failed: ${response.statusText}`);
    }
    return response.json();
  },

  enhanceIdeaStream: async (documentId: string, ideaText: string, modelId: string, onProgress: (msg: string) => void) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/idea/enhance-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        idea_text: ideaText,
        model_id: modelId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Idea enhance failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.status === 'error') {
              onProgress(data.message || '오류 발생');
              throw new Error(data.message || 'Unknown stream error');
            }
            if (data.message) onProgress(data.message);
            if (data.status === 'completed') result = data.data; // data.data contains master_brief and usage
          } catch (e) {
            if (e instanceof Error && e.message === 'Unknown stream error' || (e as Error).message.includes('error')) {
              throw e;
            }
            console.error("Parse error in enhance stream", e);
          }
        }
      }
    }
    return result;
  },

  saveMasterBrief: async (documentId: string, masterBrief: string, initialIdea?: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/idea/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        document_id: documentId, 
        master_brief: masterBrief,
        initial_idea: initialIdea
      })
    });
    
    if (!response.ok) {
      throw new Error(`Master brief save failed: ${response.statusText}`);
    }
    return response.json();
  },

  uploadDocumentStream: async (file: File, modelId: string, onProgress: (msg: string) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_id', modelId);

    const response = await fetch(`${API_BASE_URL}/upload-stream`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.status === 'error') {
              onProgress(data.message || '오류 발생');
              throw new Error(data.message || 'Unknown stream error');
            }
            if (data.message) onProgress(data.message);
            if (data.status === 'final') result = data;
          } catch (e) {
            if (e instanceof Error && e.message === 'Unknown stream error' || (e as Error).message.includes('error')) {
              throw e; // Reraise stream errors to exit while loop
            }
            console.error("Parse error in SSE stream", e);
          }
        }
      }
    }
    return result;
  },

  reanalyzeProjectStream: async (documentId: string, modelId: string, onProgress: (msg: string) => void) => {
    const formData = new FormData();
    formData.append('model_id', modelId);

    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/reanalyze-stream`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Re-analysis failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.status === 'error') {
              onProgress(data.message || '오류 발생');
              throw new Error(data.message || 'Unknown stream error');
            }
            if (data.message) onProgress(data.message);
            if (data.status === 'final') result = data;
          } catch (e) {
            if (e instanceof Error && e.message === 'Unknown stream error' || (e as Error).message.includes('error')) {
              throw e;
            }
            console.error("Parse error in re-analysis stream", e);
          }
        }
      }
    }
    return result;
  }
};

import type { DocumentNode } from '../types';

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
  
  saveProject: async (
    documentId: string, 
    projectName: string, 
    originalFilename: string, 
    selectedNodeIds: (string | number)[], 
    contentNodeIds: (string | number)[], 
    treeData?: DocumentNode[]
  ) => {
    const response = await fetch(`${API_BASE_URL}/projects/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        name: projectName,
        filename: originalFilename,
        selected_node_ids: selectedNodeIds,
        content_node_ids: contentNodeIds,
        tree_data: treeData,
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

  getProjects: async (keyword?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (keyword) params.append('keyword', keyword);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const queryString = params.toString();
    const url = queryString ? `${API_BASE_URL}/projects?${queryString}` : `${API_BASE_URL}/projects`;
    
    const response = await fetch(url);
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
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        new_name: newName,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Rename failed: ${response.statusText}`);
    }
    return response.json();
  },

  saveProjectDraftReset: async (documentId: string) => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/draft/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Reset failed: ${response.statusText}`);
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
          } catch (err) {
            if (err instanceof Error && err.message === 'Unknown stream error' || (err as Error).message.includes('error')) {
              throw err;
            }
            console.error("Parse error in enhance stream", err);
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

  generateDraftStream: async (documentId: string, modelId: string, researchMode: 'fast' | 'deep' = 'deep', engine: 'lxml' | 'pyhwpx' = 'lxml', onProgress: (msg: string) => void) => {
    console.log(`[API] Starting generateDraftStream for ${documentId} (Mode: ${researchMode}, Engine: ${engine})`);
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/draft/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        model_id: modelId,
        research_mode: researchMode,
        engine: engine
      }),
    });

    console.log(`[API] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      // JSON 파싱 실패를 대비해 text로 먼저 받음
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[API] Stream request failed: ${errorText}`);
      throw new Error(`Draft generation failed: ${response.statusText} (${errorText})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error("[API] ReadableStream is NULL or not supported");
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalTree = null;

    console.log("[API] Entering stream read loop...");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[API] Stream read COMPLETE");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawData = line.substring(6).trim();
            if (!rawData) continue;
            
            try {
              const data = JSON.parse(rawData);
              console.log("[API] SSE data received:", data);
              
              if (data.status === 'error') {
                console.error("[API] SSE reported error:", data.message);
                throw new Error(data.message || 'Stream reported error');
              }
              
              if (data.status === 'completed') {
                console.log("[API] Success mark found. Saving finalTree.");
                finalTree = data.tree;
              } else if (data.research_completed) {
                // 리서치 스킵/완료 시에도 상태 메시지 표시용
                onProgress(`리서치 상태 확인 완료: ${data.research_mode || researchMode}`);
              } else if (data.persona_injected) {
                // 페르소나 주입 완료 시
                onProgress("작성 규칙(페르소나) 설정 완료");
              } else if (data.status) {
                onProgress(data.status);
              } else if (data.phase_status) {
                onProgress(data.phase_status);
              }
            } catch (err) {
              console.error("[API] JSON parse error in stream:", err, "Raw data:", rawData);
            }
          }
        }

      }
    } catch (err) {
      console.error("[API] ERROR during stream reading:", err);
      throw err;
    }

    console.log("[API] Returning finalTree:", finalTree ? "WITH CONTENT" : "EMPTY/NULL");
    return finalTree;
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
  },

  exportHwpx: async (documentId: string, engine: 'lxml' | 'pyhwpx' = 'lxml') => {
    const response = await fetch(`${API_BASE_URL}/projects/${documentId}/export_hwpx?engine=${engine}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Export failed: ${response.statusText}`);
    }
    const data = await response.json();
    return {
        ...data,
        download_url: data.download_url ? `http://127.0.0.1:8000${data.download_url}` : undefined
    };
  }
};

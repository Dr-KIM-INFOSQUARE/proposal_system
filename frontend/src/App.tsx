import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectList } from './components/ProjectList';
import { AnalysisWorkflow } from './components/AnalysisWorkflow';
import { BillingView } from './components/BillingView';
import { ErrorRetryModal } from './components/ErrorRetryModal';
import { api } from './services/api';
import type { DocumentNode } from './types';

function App() {
  const [activeView, setActiveView] = useState<'analysis' | 'projects' | 'billing'>('analysis');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<DocumentNode[]>([]);
  const [projectList, setProjectList] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("models/gemini-3-flash-preview");
  const [fileName, setFileName] = useState<string | null>(null); // UI에 표시될 프로젝트 이름
  const [originalFileName, setOriginalFileName] = useState<string | null>(null); // 원본 파일 이름
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [initialMasterBrief, setInitialMasterBrief] = useState<string>('');
  const [initialIdeaData, setInitialIdeaData] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<(string | number)[]>([]);
  const [contentNodeIds, setContentNodeIds] = useState<(string | number)[]>([]);
  
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [enhanceMessage, setEnhanceMessage] = useState<string | null>(null);

  const [retryModalConfig, setRetryModalConfig] = useState<{
    isOpen: boolean;
    modelName: string;
    resolve?: (retry: boolean) => void;
  } | null>(null);
  
  // AnalysisWorkflow의 강제 초기화를 제어하기 위한 키 (프로젝트 열기/새로 만들기 시에만 변경)
  const [workflowKey, setWorkflowKey] = useState<string>('initial');

  useEffect(() => {
      loadProjects();
  }, [activeView]);

  const loadProjects = async (keyword?: string, startDate?: string, endDate?: string) => {
      try {
          const list = await api.getProjects(keyword, startDate, endDate);
          setProjectList(list);
      } catch (err) {
          console.error("Failed to load projects", err);
          // 8000번 포트 통신 실패 시 사용자에게 알림 (방화벽이나 백엔드 다운 확인용)
          if (err instanceof Error) {
            alert(`서버(Port 8000)와 통신할 수 없습니다.\n접속 주소: ${window.location.hostname}\n사유: ${err.message}`);
            console.error("API Connection Error:", err.message);
          }
      }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    // 선택된 파일 정보를 UI에 즉시 반영하기 위해 임시로 이름만 설정
    setFileName(file.name);
    setOriginalFileName(file.name);
    setFileSize((file.size / 1024 / 1024).toFixed(2) + 'MB');
    // 기존 분석 데이터 초기화
    setTreeData([]);
    setCurrentDocumentId(null);
    setPdfUrl(null);
  };

  const handleCancelSelection = () => {
    setSelectedFile(null);
    setFileName(null);
    setOriginalFileName(null);
    setFileSize(null);
    setTreeData([]);
    setCurrentDocumentId(null);
    setPdfUrl(null);
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) return;
    
    const fileToProcess = selectedFile;
    const modelToUse = selectedModel;
    let success = false;
    
    // [핵심] 첫 업로드에서 확정된 document_id를 보관.
    // 재시도 시에는 이 ID로 reanalyze-stream을 호출하여 파일 재업로드를 방지합니다.
    let pendingDocId: string | null = null;
    
    setIsUploading(true);
    
    while (!success) {
      try {
        setUploadMessage("준비 중...");
        
        if (pendingDocId) {
          // ── 재시도: 이미 저장된 파일로 AI 분석만 다시 실행 ──────────────
          console.log(`[App] Retrying analysis for existing document: ${pendingDocId}`);
          const res = await api.reanalyzeProjectStream(pendingDocId, modelToUse, (msg) => {
            setUploadMessage(msg);
          });
          if (res) {
            setCurrentDocumentId(pendingDocId);
            setTreeData(res.tree || []);
            // PDF URL은 첫 업로드 시 이미 설정되어 있으므로 유지
            setFileName(prev => (!prev || prev === fileToProcess.name) ? fileToProcess.name : prev);
            setOriginalFileName(fileToProcess.name);
            success = true;
          }
        } else {
          // ── 최초 업로드: 파일 저장 + PDF 변환 + AI 분석 ─────────────────
          const res = await api.uploadDocumentStream(fileToProcess, modelToUse, (msg, docId) => {
            setUploadMessage(msg);
            // received 이벤트에서 document_id를 미리 확보 (AI 분석 실패에 대비)
            if (docId && !pendingDocId) {
              pendingDocId = docId;
              setCurrentDocumentId(docId);
            }
          });
          
          if (res) {
            setCurrentDocumentId(res.document_id);
            setTreeData(res.tree || []);
            setPdfUrl(res.pdf_url);
            setFileName(prev => (!prev || prev === fileToProcess.name) ? fileToProcess.name : prev);
            setOriginalFileName(fileToProcess.name);
            pendingDocId = res.document_id;
            success = true;
          }
        }
        
        setSelectedFile(null);
        loadProjects();
      } catch (err) {
        console.error("분석 중 오류가 발생했습니다:", err);
        const modelName = modelToUse.split('/').pop() || modelToUse;
        
        setIsUploading(false);
        setUploadMessage(null);
        
        const retryDecision = await new Promise<boolean>((resolve) => {
          setRetryModalConfig({ isOpen: true, modelName, resolve });
        });
        
        setRetryModalConfig(null);
        
        if (!retryDecision) {
          setSelectedFile(null);
          break;
        } else {
          setIsUploading(true);
        }
      }
    }
    
    setIsUploading(false);
    setUploadMessage(null);
  };


  const handleSave = async (selectedNodeIds: (string | number)[], contentNodeIds: (string | number)[], treeData?: DocumentNode[]) => {
     if (!currentDocumentId) {
         alert("먼저 문서를 업로드해야 합니다.");
         return;
     }
      try {
        await api.saveProject(
          currentDocumentId, 
          fileName || "Untitled Project", 
          originalFileName || "Unknown Document",
          selectedNodeIds, 
          contentNodeIds,
          treeData
        );
        if (treeData) setTreeData(treeData);
        setSelectedNodeIds(selectedNodeIds);
        setContentNodeIds(contentNodeIds);
        alert("문서 구조 분석 결과가 성공적으로 저장되었습니다!");
        loadProjects();
      } catch (err) {
        alert("저장 중 오류: " + err);
      }
  };

  const handleExport = async (selectedNodeIds: (string | number)[], contentNodeIds: (string | number)[], treeData?: DocumentNode[]) => {
     if (!currentDocumentId) {
         alert("문서가 없습니다.");
         return;
     }
      try {
         // 추출 시 자동 저장 전에 선택된 항목 유무를 확인. 
         // 트리 데이터는 있는데 체킹된게 없다면 의도치 않은 데이터 삭제를 방지하기 위해 저장을 스킵.
         if (selectedNodeIds.length === 0 && treeData && treeData.length > 0) {
            console.warn("[Workflow] Skipping auto-save in Export: No nodes selected. To protect existing data.");
         } else {
             // 자동 저장 실행
             await api.saveProject(
               currentDocumentId, 
               fileName || "Untitled Project", 
               originalFileName || "Unknown Document",
               selectedNodeIds, 
               contentNodeIds,
               treeData
             );
         }
 
         const res = await api.exportProject(currentDocumentId);
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `exported_${currentDocumentId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
     } catch (err) {
        alert("내보내기 중 오류가 발생했습니다.\n원인: " + err);
     }
  };

  const handleOpenProject = async (documentId: string) => {
    try {
      const res = await api.loadProject(documentId);
      setCurrentDocumentId(res.document_id);
      setTreeData(res.tree || []);
      setFileName(res.name || res.filename);
      setOriginalFileName(res.filename);
      setFileSize("저장됨");
      setPdfUrl(res.pdf_url);
      setInitialMasterBrief(res.master_brief || '');
      setInitialIdeaData(res.initial_idea || '');
      setSelectedNodeIds(res.selected_ids || []);
      setContentNodeIds(res.content_ids || []);
      setWorkflowKey(documentId); // 프로젝트를 열 때 키를 변경하여 컴포넌트 초기화
      setActiveView('analysis');
    } catch (err) {
      alert("프로젝트를 불러오지 못했습니다: " + err);
    }
  };

  const handleReanalyze = async () => {
    if (!currentDocumentId) return;
    
    const docId = currentDocumentId;
    const modelToUse = selectedModel;
    let success = false;
    
    setIsUploading(true);
    
    while (!success) {
      try {
        setUploadMessage("재분석 준비 중...");
        const res = await api.reanalyzeProjectStream(docId, modelToUse, (msg) => {
          setUploadMessage(msg);
        });
        if (res && res.tree) {
          setTreeData(res.tree);
          // 트리가 갱신되었으므로 완료 목록 갱신 등은 필요 없을 수도 있음 (이미 로드된 상태)
          alert("지정한 모델로 재분석을 완료했습니다.");
          success = true;
        }
      } catch (err) {
        console.error("재분석 중 오류가 발생했습니다:", err);
        const modelName = modelToUse.split('/').pop() || modelToUse;
        
        setIsUploading(false); // 잠시 로딩 멈춤
        setUploadMessage(null);
        
        const retryDecision = await new Promise<boolean>((resolve) => {
          setRetryModalConfig({ isOpen: true, modelName, resolve });
        });
        
        setRetryModalConfig(null);
        
        if (!retryDecision) {
          break; // 취소
        } else {
          setIsUploading(true); // 다시 재시작
        }
      }
    }
    
    setIsUploading(false);
    setUploadMessage(null);
  };

  const handleReset = () => {
    if (confirm("경고! 저장되지 않은 변경사항은 사라질 수 있습니다.")) {
      setCurrentDocumentId(null);
      setTreeData([]);
      setFileName(null);
      setOriginalFileName(null);
      setFileSize(null);
      setPdfUrl(null);
      setInitialMasterBrief('');
      setInitialIdeaData('');
      setSelectedNodeIds([]);
      setContentNodeIds([]);
      setSelectedFile(null);
      setIsUploading(false);
      setWorkflowKey('reset-' + Date.now()); // 새로운 시작을 위해 키 갱신
      setActiveView('analysis');
    }
  };

  const handleCreateNewProject = () => {
    setCurrentDocumentId(null);
    setTreeData([]);
    setFileName(null);
    setOriginalFileName(null);
    setFileSize(null);
    setPdfUrl(null);
    setInitialMasterBrief('');
    setInitialIdeaData('');
    setSelectedNodeIds([]);
    setContentNodeIds([]);
    setSelectedFile(null);
    setIsUploading(false);
    setWorkflowKey('new-' + Date.now()); // 새 프로젝트 작성을 위해 키 갱신
    setActiveView('analysis');
  };

  const handleRename = async (documentId: string, newTitle: string) => {
    try {
      await api.renameProject(documentId, newTitle);
      loadProjects(); // 목록 갱신
      if (currentDocumentId === documentId) {
          setFileName(newTitle);
      }
    } catch (err) {
      console.error("Failed to rename project", err);
    }
  };

  const handleDeleteProject = async (documentId: string) => {
    if (!confirm("정말 이 프로젝트를 삭제하시겠습니까?")) return;
    try {
      await api.deleteProject(documentId);
      await loadProjects();
      if (currentDocumentId === documentId) {
        // 현재 활성화된 프로젝트를 삭제한 경우, 전체 앱 상태를 초기화합니다.
        handleCreateNewProject();
      }
    } catch (err) {
      alert("삭제 중 오류가 발생했습니다: " + err);
    }
  };


  return (
    <div className="flex min-h-screen relative font-body text-on-surface bg-surface">
      <Sidebar 
        isOpen={isSidebarOpen} 
        activeView={activeView} 
        onToggle={toggleSidebar} 
        onViewChange={setActiveView} 
        isUploading={isUploading}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        projects={projectList}
        onOpenProject={handleOpenProject}
      />
      <main className="flex-1 lg:ml-96 w-full min-w-0 bg-surface flex flex-col min-h-screen transition-all duration-300">
        <Header 
          onToggleSidebar={toggleSidebar} 
          onReset={handleReset} 
          projectName={fileName}
          onProjectNameChange={(name: string) => {
            setFileName(name);
            if (currentDocumentId) {
                handleRename(currentDocumentId, name);
            }
          }}
          isAnalyzing={isUploading || isEnhancing}
          aiMessage={isUploading ? uploadMessage : (isEnhancing ? enhanceMessage : null)}
        />
        {activeView === 'analysis' ? (
          <div className="block flex-1 flex-col relative">
            <AnalysisWorkflow 
                key={workflowKey}
                initialTreeData={treeData} 
                initialMasterBrief={initialMasterBrief}
                initialIdeaData={initialIdeaData}
                fileName={fileName}
                originalFileName={originalFileName}
                fileSize={fileSize}
                pdfUrl={pdfUrl}
                documentId={currentDocumentId}
                selectedModel={selectedModel}
                selectedNodeIds={selectedNodeIds}
                contentNodeIds={contentNodeIds}
                onSave={handleSave} 
                onExport={handleExport} 
                onReanalyze={handleReanalyze}
                onSetTreeData={setTreeData}
                isAnalyzing={isUploading}
                uploadMessage={uploadMessage}
                onEnhanceStateChange={(active: boolean, msg?: string) => {
                    setIsEnhancing(active);
                    if (msg) setEnhanceMessage(msg);
                }}
                onFileSelect={handleFileSelect}
                onStartAnalysis={handleStartAnalysis}
                onCancelSelection={handleCancelSelection}
                onTitleChange={(newTitle) => {
                    setFileName(newTitle);
                    // 타이핑 할 때마다 실시간으로 프로젝트 메뉴에도 반영되길 원한다면 handleRename 호출
                    if (currentDocumentId) {
                        handleRename(currentDocumentId, newTitle);
                    }
                }}
                onDocumentIdGenerated={(id, name) => {
                    setCurrentDocumentId(id);
                    if (name) setFileName(name);
                    loadProjects(); // 목록 갱신
                }}
                hasSelectedFile={!!selectedFile}
            />
          </div>
        ) : activeView === 'projects' ? (
          <div className="block flex-1 flex-col">
             <ProjectList 
                onNewProject={handleCreateNewProject} 
                onOpenProject={handleOpenProject} 
                onDeleteProject={handleDeleteProject}
                onRename={handleRename}
                onSearch={(k, s, e) => loadProjects(k, s, e)}
                projects={projectList}
             />
          </div>
        ) : (
          <div className="block flex-1 flex-col">
             <BillingView />
          </div>
        )}
        
        {retryModalConfig && (
          <ErrorRetryModal 
            isOpen={retryModalConfig.isOpen}
            modelName={retryModalConfig.modelName}
            onRetry={() => retryModalConfig.resolve && retryModalConfig.resolve(true)}
            onCancel={() => retryModalConfig.resolve && retryModalConfig.resolve(false)}
          />
        )}
      </main>
    </div>
  );
}

export default App;

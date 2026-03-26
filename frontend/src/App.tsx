import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ProjectList } from './components/ProjectList';
import { DocumentTree } from './components/DocumentTree';
import { LoadingOverlay } from './components/LoadingOverlay';
import { api } from './services/api';
import type { DocumentNode } from './types';

function App() {
  const [activeView, setActiveView] = useState<'analysis' | 'projects'>('analysis');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<DocumentNode[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<any[]>([]);

  useEffect(() => {
     if (activeView === 'projects') {
         loadProjects();
     }
  }, [activeView]);

  const loadProjects = async () => {
      try {
          const list = await api.getProjects();
          setProjectList(list);
      } catch (err) {
          console.error("Failed to load projects", err);
      }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      const res = await api.uploadDocument(file);
      setCurrentDocumentId(res.document_id);
      setTreeData(res.tree || []);
      setFileName(file.name);
      setFileSize((file.size / 1024 / 1024).toFixed(2) + 'MB');
      setActiveView('analysis');
    } catch (err) {
      alert("업로드 중 오류가 발생했습니다: " + err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (selectedNodeIds: (string | number)[], contentNodeIds: (string | number)[]) => {
     if (!currentDocumentId) {
         alert("먼저 문서를 업로드해야 합니다.");
         return;
     }
     try {
       await api.saveProject(currentDocumentId, fileName || "Unknown Document", selectedNodeIds, contentNodeIds);
       alert("프로젝트 상태가 성공적으로 저장되었습니다!");
     } catch (err) {
       alert("저장 중 오류: " + err);
     }
  };

  const handleExport = async (selectedNodeIds: (string | number)[], contentNodeIds: (string | number)[]) => {
     if (!currentDocumentId) {
         alert("문서가 없습니다.");
         return;
     }
     try {
        // 자동 저장 실행
        await api.saveProject(currentDocumentId, fileName || "Unknown Document", selectedNodeIds, contentNodeIds);

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
      setFileName(res.filename);
      setFileSize("저장됨");
      setActiveView('analysis');
    } catch (err) {
      alert("프로젝트를 불러오지 못했습니다: " + err);
    }
  };

  const handleDeleteProject = async (documentId: string) => {
    if (!confirm("정말 이 프로젝트를 삭제하시겠습니까?")) return;
    try {
      await api.deleteProject(documentId);
      await loadProjects();
      if (currentDocumentId === documentId) {
        setCurrentDocumentId(null);
        setTreeData([]);
        setFileName(null);
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
        onUpload={handleUpload}
        isUploading={isUploading}
      />
      <main className="flex-1 lg:ml-80 w-full min-w-0 bg-surface flex flex-col min-h-screen transition-all duration-300">
        <Header onToggleSidebar={toggleSidebar} />
        {activeView === 'analysis' ? (
          <div className="block flex-1 flex-col relative">
            <DocumentTree 
                initialTreeData={treeData} 
                fileName={fileName}
                fileSize={fileSize}
                onSave={handleSave} 
                onExport={handleExport} 
            />
          </div>
        ) : (
          <div className="block flex-1 flex-col">
             <ProjectList 
                onNewProject={() => setActiveView('analysis')} 
                onOpenProject={handleOpenProject} 
                onDeleteProject={handleDeleteProject}
                projects={projectList}
             />
          </div>
        )}
      </main>
      <LoadingOverlay isVisible={isUploading} />
    </div>
  );
}

export default App;

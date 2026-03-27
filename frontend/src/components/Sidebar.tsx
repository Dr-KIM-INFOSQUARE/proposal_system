import React from 'react';
import { ModelSelector } from './ModelSelector';

interface SidebarProps {
  isOpen: boolean;
  activeView: 'analysis' | 'projects' | 'billing';
  onToggle: () => void;
  onViewChange: (view: 'analysis' | 'projects' | 'billing') => void;
  isUploading: boolean;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  projects?: any[];
  onOpenProject?: (documentId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  activeView, 
  onToggle, 
  onViewChange, 
  isUploading,
  selectedModel,
  onModelChange,
  projects = [],
  onOpenProject
}) => {

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (ext === 'docx' || ext === 'doc') return 'description';
    if (ext === 'hwpx' || ext === 'hwp') return 'article';
    return 'insert_drive_file';
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${isOpen ? 'block opacity-100' : 'hidden opacity-0 pointer-events-none'}`} 
        onClick={onToggle}
      />
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-96 flex flex-col bg-[#f2f4f6] dark:bg-slate-900 border-r border-outline-variant/20 overflow-y-auto transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 lg:p-8 flex flex-col h-full min-h-[100vh]">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl shadow-lg shrink-0">
                <span className="material-symbols-outlined text-white">account_tree</span>
              </div>
              <div>
                <h1 className="text-lg lg:text-xl font-extrabold text-[#191c1e] dark:text-white font-headline tracking-tight">PlanWeaver AI</h1>
                <p className="text-[0.625rem] lg:text-[0.6875rem] font-label uppercase tracking-[0.05rem] text-outline">Analytical Architect</p>
              </div>
            </div>
            <button onClick={onToggle} className="lg:hidden p-2 text-outline hover:text-on-surface bg-surface-container rounded-lg">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <nav className="space-y-1 mb-8">
            <a 
              onClick={() => onViewChange('analysis')} 
              className={`flex items-center gap-3 py-3 px-4 lg:px-6 transition-all cursor-pointer rounded-r-lg border-l-4 ${activeView === 'analysis' ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-blue-600 dark:border-blue-500 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#e0e3e5] dark:hover:bg-slate-800 border-transparent font-medium'}`}
            >
              <span className="material-symbols-outlined">dashboard</span>
              <span>대시보드</span>
            </a>
            <a 
              onClick={() => onViewChange('projects')} 
              className={`flex items-center gap-3 py-3 px-4 lg:px-6 transition-all cursor-pointer rounded-r-lg border-l-4 ${activeView === 'projects' ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-blue-600 dark:border-blue-500 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#e0e3e5] dark:hover:bg-slate-800 border-transparent font-medium'}`}
            >
              <span className="material-symbols-outlined">folder</span>
              <span>프로젝트</span>
            </a>
            <a 
              onClick={() => onViewChange('billing')} 
              className={`flex items-center gap-3 py-3 px-4 lg:px-6 transition-all cursor-pointer rounded-r-lg border-l-4 ${activeView === 'billing' ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-blue-600 dark:border-blue-500 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#e0e3e5] dark:hover:bg-slate-800 border-transparent font-medium'}`}
            >
              <span className="material-symbols-outlined">payments</span>
              <span>비용 관리</span>
            </a>
          </nav>

          <div className="mt-auto pb-4">
            <div className="mb-6">
              <ModelSelector 
                selectedModel={selectedModel} 
                onModelChange={onModelChange} 
                disabled={isUploading}
              />
            </div>

            <div className="mt-8">
                <h3 className="text-[0.625rem] lg:text-[0.6875rem] font-label uppercase tracking-[0.05rem] text-outline mb-3">최근 프로젝트</h3>
                <ul className="space-y-2">
                    {projects.length > 0 ? (
                        projects.slice(0, 5).map((project) => (
                            <li 
                                key={project.document_id}
                                onClick={() => onOpenProject?.(project.document_id)}
                                className="flex items-center justify-between p-2 lg:p-3 rounded-lg hover:bg-surface-container-highest transition-colors cursor-pointer group"
                            >
                                <div className="flex items-center gap-2.5 w-[85%]">
                                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-lg">
                                        {getFileIcon(project.filename)}
                                    </span>
                                    <span className="text-xs font-medium text-on-surface truncate">{project.name || project.filename}</span>
                                </div>
                                <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
                            </li>
                        ))
                    ) : (
                        <p className="text-[10px] text-outline italic px-2">최근 작업한 프로젝트가 없습니다.</p>
                    )}
                </ul>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

import React, { useRef } from 'react';

interface SidebarProps {
  isOpen: boolean;
  activeView: 'analysis' | 'projects';
  onToggle: () => void;
  onViewChange: (view: 'analysis' | 'projects') => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, activeView, onToggle, onViewChange, onUpload, isUploading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerUpload = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };
  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${isOpen ? 'block opacity-100' : 'hidden opacity-0 pointer-events-none'}`} 
        onClick={onToggle}
      />
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-80 flex flex-col bg-[#f2f4f6] dark:bg-slate-900 border-r border-outline-variant/20 overflow-y-auto transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
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
          </nav>

          <div className="mt-auto pb-4">
            <div 
              onClick={triggerUpload}
              className={`group relative border-2 border-dashed ${isUploading ? 'border-primary bg-primary-fixed/20' : 'border-outline-variant hover:border-primary'} transition-all rounded-xl p-6 bg-surface-container flex flex-col items-center text-center cursor-pointer mb-4`}
            >
              <input type="file" ref={fileInputRef} className="hidden" accept=".docx,.pdf,.hwpx" onChange={handleFileChange} />
              <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full ${isUploading ? 'bg-primary animate-pulse text-white' : 'bg-primary-fixed text-primary'} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <span className="material-symbols-outlined text-2xl lg:text-3xl">{isUploading ? 'hourglass_empty' : 'cloud_upload'}</span>
              </div>
              <p className="text-sm font-semibold text-on-surface mb-1">{isUploading ? '분석 중...' : '계획서 양식 업로드'}</p>
              <p className="text-[0.7rem] lg:text-[0.75rem] text-outline leading-relaxed break-keep">양식을 드래그 앤 드롭하거나 클릭하세요 (.hwpx, .docx, .pdf)</p>
            </div>

            <div className="mt-8">
                <h3 className="text-[0.625rem] lg:text-[0.6875rem] font-label uppercase tracking-[0.05rem] text-outline mb-3">최근 분석한 양식</h3>
                <ul className="space-y-2">
                    <li className="flex items-center justify-between p-2 lg:p-3 rounded-lg hover:bg-surface-container-highest transition-colors cursor-pointer group">
                        <div className="flex items-center gap-2.5 w-[85%]">
                            <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-lg">picture_as_pdf</span>
                            <span className="text-xs font-medium text-on-surface truncate">예비창업패키지_사업계획서.pdf</span>
                        </div>
                        <span className="material-symbols-outlined text-outline text-sm">more_vert</span>
                    </li>
                </ul>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

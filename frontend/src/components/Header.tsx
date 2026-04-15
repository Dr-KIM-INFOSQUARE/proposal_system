import React from 'react';

interface HeaderProps {
  onToggleSidebar: () => void;
  onReset?: () => void;
  projectName?: string | null;
  onProjectNameChange?: (name: string) => void;
  aiMessage?: string | null;
  isAnalyzing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onReset, projectName, onProjectNameChange, aiMessage, isAnalyzing }) => {
  return (
    <header className="w-full h-16 sticky top-0 z-30 bg-[#ffffff]/90 backdrop-blur-md dark:bg-slate-950/90 flex justify-between items-center px-4 md:px-8 border-b border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-3 md:gap-4 flex-1">
        <button onClick={onToggleSidebar} className="lg:hidden p-2 -ml-2 text-outline hover:text-on-surface bg-surface-container-low rounded-lg transition-colors">
          <span className="material-symbols-outlined">menu</span>
        </button>
        
        {projectName !== null && projectName !== undefined ? (
            <input 
                type="text"
                value={projectName}
                onChange={(e) => onProjectNameChange && onProjectNameChange(e.target.value)}
                placeholder="프로젝트 이름 입력..."
                className="bg-transparent text-lg md:text-xl font-headline font-black text-on-surface border-none focus:ring-2 focus:ring-primary/20 rounded-lg py-1 px-2 -ml-2 transition-all outline-none placeholder:text-outline/40 placeholder:font-normal min-w-[80px] max-w-[400px]"
            />
        ) : (
            <div className="text-sm font-medium text-outline">새 문서를 업로드하거나, 기존 프로젝트를 선택해주세요</div>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {isAnalyzing && (
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full ring-1 ring-primary/20 shrink-0 animate-fade-in">
              <span className="material-symbols-outlined text-primary text-base animate-spin">refresh</span>
              <span className="text-xs font-bold text-primary animate-pulse whitespace-nowrap overflow-hidden text-ellipsis max-w-[280px]">
                  {aiMessage || "AI 작업 진행 중..."}
              </span>
          </div>
        )}
        {onReset && (
          <button 
            onClick={onReset}
            className="flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-full transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.3)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.4)] hover:scale-[1.02] active:scale-[0.97] border-none group"
          >
            <span className="material-symbols-outlined text-lg md:text-xl group-hover:rotate-90 transition-transform duration-300">add_circle</span>
            <span className="hidden sm:inline">새 프로젝트</span>
          </button>
        )}
        <div className="flex items-center gap-1 md:gap-3">
          <button className="p-2 text-slate-500 hover:text-blue-500 transition-all rounded-full hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-xl">notifications</span>
          </button>
          <button className="hidden sm:block p-2 text-slate-500 hover:text-blue-500 transition-all rounded-full hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-xl">history</span>
          </button>
        </div>
        <div className="hidden md:block w-px h-6 bg-outline-variant opacity-20"></div>
        <div className="flex items-center">
          <button className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-300 hover:ring-2 hover:ring-primary/30 transition-all">
            <span className="material-symbols-outlined text-slate-500 text-lg md:text-xl">person</span>
          </button>
        </div>
      </div>
    </header>
  );
};

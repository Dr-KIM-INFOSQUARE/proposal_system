import React from 'react';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  return (
    <header className="w-full h-16 sticky top-0 z-30 bg-[#ffffff]/90 backdrop-blur-md dark:bg-slate-950/90 flex justify-between items-center px-4 md:px-8 border-b border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-3 md:gap-4 flex-1">
        <button onClick={onToggleSidebar} className="lg:hidden p-2 -ml-2 text-outline hover:text-on-surface bg-surface-container-low rounded-lg transition-colors">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="flex items-center bg-surface-container-low px-3 md:px-4 py-2 rounded-full w-full max-w-[12rem] sm:max-w-xs md:max-w-sm lg:max-w-md">
          <span className="material-symbols-outlined text-outline mr-2 text-lg md:text-xl">search</span>
          <input className="bg-transparent border-none focus:ring-0 text-xs md:text-sm w-full placeholder:text-outline p-0" placeholder="구조, 항목 검색..." type="text" />
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-6 shrink-0">
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

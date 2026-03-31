import React from 'react';

interface ProjectListProps {
  onNewProject: () => void;
  onOpenProject: (documentId: string) => void;
  onDeleteProject: (documentId: string) => void;
  onRename?: (documentId: string, newTitle: string) => void;
  onSearch?: (keyword: string, startDate: string, endDate: string) => void;
  projects?: any[];
}

export const ProjectList: React.FC<ProjectListProps> = ({ 
  onNewProject, 
  onOpenProject, 
  onDeleteProject, 
  onRename,
  onSearch,
  projects = [] 
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [tempName, setTempName] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setTempName(currentName);
  };

  const handleRenameSubmit = (documentId: string) => {
    if (tempName.trim() && onRename) {
      onRename(documentId, tempName.trim());
    }
    setEditingId(null);
  };

  const handleSearch = () => {
    if (onSearch) {
      onSearch(keyword, startDate, endDate);
    }
  };

  const handleResetFilters = () => {
    setKeyword("");
    setStartDate("");
    setEndDate("");
    if (onSearch) {
      onSearch("", "", "");
    }
  };

  // 상태 배지 렌더링 함수
  const renderStatusBadge = (status: any) => {
    if (typeof status !== 'object') {
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">{status}</span>;
    }

    const steps = [
      { key: 'analysis', label: '분석' },
      { key: 'idea_enhance', label: '아이디어' },
      { key: 'draft_generate', label: '초안' },
      { key: 'proposal_complete', label: '완성' }
    ];

    const completedCount = steps.filter(step => status[step.key]).length;
    const progress = (completedCount / steps.length) * 100;

    return (
      <div className="flex flex-col gap-2.5 w-full min-w-[280px]">
        <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-black text-outline uppercase tracking-[0.1em]">Workflow Status</span>
            <span className="text-[10px] font-black text-primary italic">{Math.round(progress)}%</span>
        </div>
        
        {/* Progress Container - Equal Column Grid */}
        <div className="bg-surface-container/20 p-2.5 rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col gap-2">
            {/* 4-Column Bar Segments */}
            <div className="grid grid-cols-4 gap-1.5 h-1.5">
              {steps.map((step) => (
                <div 
                  key={`bar-${step.key}`} 
                  className={`h-full rounded-full transition-all duration-700 ${
                    status[step.key] 
                    ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' 
                    : 'bg-outline-variant/10'
                  }`}
                />
              ))}
            </div>

            {/* 4-Column Chip Grid (Perfect alignment with segments) */}
            <div className="grid grid-cols-4 gap-1.5">
                {steps.map(step => {
                    const isActive = status[step.key];
                    return (
                        <div 
                            key={`chip-${step.key}`} 
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[9px] font-black transition-all border leading-tight text-center ${
                                isActive 
                                ? 'bg-primary text-on-primary border-primary shadow-sm' 
                                : 'bg-surface-container-highest/40 text-outline-variant border-transparent opacity-50'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[11px] mb-0.5">
                                {isActive ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            {step.label}
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 lg:p-10 pb-32 max-w-7xl mx-auto animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl">folder_managed</span>
            </div>
            <h2 className="font-headline text-2xl lg:text-3xl font-black tracking-tight text-on-surface">내 프로젝트</h2>
          </div>
          <p className="text-sm text-outline max-w-lg leading-relaxed">
            저장된 사업 계획서 구조 분석 및 AI 기반 초안 작성 프로젝트 목록을 관리합니다.<br />
            각 단계별 진행 상황을 한눈에 확인하고 이어서 작업을 진행하세요.
          </p>
        </div>
        <button 
          onClick={onNewProject} 
          className="group px-6 py-3 bg-primary text-on-primary font-bold rounded-2xl hover:shadow-[0_8px_24px_-4px_rgba(var(--primary-rgb),0.4)] transition-all flex items-center gap-3 self-start md:self-auto"
        >
          <span className="material-symbols-outlined transition-transform group-hover:rotate-90">add_circle</span>
          <span>새 비즈니스 프로젝트</span>
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white p-5 md:p-7 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.03)] flex flex-col md:flex-row gap-5 items-center">
        <div className="flex-1 w-full relative group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">search</span>
          <input 
            type="text" 
            placeholder="프로젝트명 또는 파일명으로 검색..." 
            className="w-full pl-12 pr-4 py-3.5 bg-surface-container-lowest text-sm rounded-2xl border border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all placeholder:text-outline-variant/70 font-medium"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 p-1.5 bg-surface-container-lowest rounded-2xl border border-outline-variant w-full sm:w-auto">
            <input 
              type="date" 
              className="bg-transparent px-3 py-1.5 text-xs font-bold text-on-surface outline-none cursor-pointer"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-outline-variant font-black">~</span>
            <input 
              type="date" 
              className="bg-transparent px-3 py-1.5 text-xs font-bold text-on-surface outline-none cursor-pointer"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={handleSearch}
              className="flex-1 sm:flex-none px-6 py-3.5 bg-on-surface text-surface font-bold rounded-2xl hover:bg-on-surface-variant transition-all flex items-center justify-center gap-2"
            >
              검색
            </button>
            <button 
              onClick={handleResetFilters}
              className="px-4 py-3.5 bg-surface-container-highest text-outline font-bold rounded-2xl hover:bg-surface-container-high transition-all"
              title="필터 초기화"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-surface-container-low/50 text-outline text-[11px] font-black uppercase tracking-[0.15em] border-b border-outline-variant/10">
                <th className="px-8 py-6 w-[25%] font-black">프로젝트명</th>
                <th className="px-6 py-6 w-[18%] font-black">원본 파일</th>
                <th className="px-6 py-6 w-[32%] font-black">진행 프로세스</th>
                <th className="px-6 py-6 w-[15%] font-black">마지막 업데이트</th>
                <th className="px-8 py-6 text-center w-[10%] font-black">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {projects.length === 0 ? (
                <tr>
                   <td colSpan={5} className="p-20 text-center">
                     <span className="material-symbols-outlined text-outline-variant text-6xl mb-4 block">folder_off</span>
                     <p className="text-outline font-medium italic">검색 결과와 일치하는 프로젝트가 없습니다.</p>
                   </td>
                </tr>
              ) : (
                projects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-primary/[0.02] transition-colors group">
                    <td className="px-8 py-7">
                      <div className="flex items-start gap-4">
                        <div className="mt-1 w-12 h-12 rounded-2xl bg-gradient-to-br from-surface-container-highest to-surface-container flex items-center justify-center shadow-inner group-hover:from-primary/10 group-hover:to-primary/5 transition-all">
                          <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-2xl">description</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingId === p.document_id ? (
                            <div className="flex gap-2">
                                <input 
                                    autoFocus
                                    className="bg-white rounded-xl px-3 py-2 border-2 border-primary outline-none w-full text-sm font-bold shadow-lg"
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value)}
                                    onBlur={() => handleRenameSubmit(p.document_id)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(p.document_id)}
                                />
                            </div>
                          ) : (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2 group/title">
                                    <h3 
                                      className="text-base font-black text-on-surface truncate cursor-pointer hover:text-primary transition-colors hover:underline underline-offset-4"
                                      onClick={() => onOpenProject(p.document_id)}
                                    >
                                      {p.name || p.filename}
                                    </h3>
                                    <button 
                                      onClick={() => startEditing(p.document_id, p.name || p.filename)}
                                      className="material-symbols-outlined text-[16px] text-outline-variant opacity-0 hover:text-primary group-hover/title:opacity-100 transition-all"
                                    >
                                      edit
                                    </button>
                                </div>
                                <span className="text-[10px] text-outline-variant font-bold uppercase tracking-widest mt-1">ID: {p.document_id.split('-')[0]}...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-7">
                      <div className="flex items-center gap-2 text-outline font-medium text-xs">
                        <span className="material-symbols-outlined text-sm">attach_file</span>
                        <span className="truncate max-w-[150px]" title={p.filename}>{p.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-7">
                      {renderStatusBadge(p.status)}
                    </td>
                    <td className="px-6 py-7 text-outline font-black text-[11px] tabular-nums tracking-tighter uppercase">
                      {p.updatedAt}
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex items-center justify-center gap-2 opacity-40 group-hover:opacity-100 transition-all">
                        <button 
                            onClick={() => onOpenProject(p.document_id)} 
                            className="w-9 h-9 rounded-xl bg-surface-container-highest text-on-surface hover:bg-primary hover:text-on-primary transition-all flex items-center justify-center shadow-sm" 
                            title="편집 계속하기"
                        >
                            <span className="material-symbols-outlined text-lg">open_in_new</span>
                        </button>
                        <button 
                            onClick={() => onDeleteProject(p.document_id)} 
                            className="w-9 h-9 rounded-xl bg-surface-container-highest text-outline hover:bg-error hover:text-white transition-all flex items-center justify-center shadow-sm" 
                            title="삭제"
                        >
                            <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Table Footer / Pagination Placeholder */}
      <div className="mt-8 flex justify-center">
        <p className="text-[10px] font-black text-outline-variant uppercase tracking-[0.2em]">End of project list - Total {projects.length} files</p>
      </div>
    </div>
  );
};

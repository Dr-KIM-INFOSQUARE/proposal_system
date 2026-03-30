import React from 'react';

interface Project {
  id: string;
  name: string;
  filename: string;
  status: {
    analysis: boolean;
    idea_enhance: boolean;
    proposal_write: boolean;
  } | string;
  updatedAt: string;
}

interface ProjectListProps {
  onNewProject: () => void;
  onOpenProject: (documentId: string) => void;
  onDeleteProject: (documentId: string) => void;
  onRename?: (documentId: string, newTitle: string) => void;
  projects?: any[];
}

export const ProjectList: React.FC<ProjectListProps> = ({ 
  onNewProject, 
  onOpenProject, 
  onDeleteProject, 
  onRename,
  projects = [] 
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [tempName, setTempName] = React.useState("");

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

  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="font-headline text-xl md:text-2xl font-bold tracking-tight text-on-surface">내 프로젝트</h2>
          <p className="text-xs md:text-sm text-outline mt-1 break-keep">저장된 사업 계획서 구조 분석 및 작성 프로젝트 목록입니다.</p>
        </div>
        <button onClick={onNewProject} className="w-full sm:w-auto px-4 md:px-6 py-2 md:py-2.5 text-xs md:text-sm bg-surface-container-highest text-on-surface font-semibold rounded-lg hover:bg-surface-container transition-all flex items-center justify-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-sm md:text-base">add</span> 새 프로젝트
        </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] border border-outline-variant/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-surface-container-low text-outline text-[0.65rem] md:text-xs uppercase tracking-wider whitespace-nowrap">
                <th className="p-4 md:p-5 font-semibold border-b border-outline-variant/20 w-1/3 md:w-2/5">프로젝트명</th>
                <th className="p-4 md:p-5 font-semibold border-b border-outline-variant/20">원본 파일</th>
                <th className="p-4 md:p-5 font-semibold border-b border-outline-variant/20">상태</th>
                <th className="p-4 md:p-5 font-semibold border-b border-outline-variant/20">최종 수정일</th>
                <th className="p-4 md:p-5 font-semibold border-b border-outline-variant/20 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="text-on-surface text-xs md:text-sm">
              {projects.length === 0 ? (
                <tr>
                   <td colSpan={5} className="p-8 text-center text-outline">저장된 프로젝트가 없습니다.</td>
                </tr>
              ) : (
                projects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-surface-container-highest/50 transition-colors group border-b border-outline-variant/10 last:border-0">
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-sm md:text-base flex items-center gap-2 md:gap-3 group/name">
                        <span className="material-symbols-outlined text-primary text-lg md:text-xl shrink-0">folder_open</span>
                        {editingId === p.document_id ? (
                          <input 
                            autoFocus
                            className="bg-surface-container rounded px-2 py-1 border border-primary outline-none w-full"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={() => handleRenameSubmit(p.document_id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(p.document_id)}
                          />
                        ) : (
                          <div className="flex items-center gap-2 truncate">
                            <span 
                              className="truncate cursor-pointer hover:text-primary transition-colors"
                              onClick={() => onOpenProject(p.document_id)}
                            >
                              {p.name || p.filename}
                            </span>
                            <button 
                              onClick={() => startEditing(p.document_id, p.name || p.filename)}
                              className="material-symbols-outlined text-[16px] text-outline opacity-0 group-hover/name:opacity-100 hover:text-primary transition-all"
                            >
                              edit
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 md:p-5 text-outline truncate max-w-[150px] md:max-w-[200px]" title={p.filename}>{p.filename}</td>
                    <td className="p-4 md:p-5">
                      {typeof p.status === 'object' ? (
                        <div className="flex flex-col gap-1.5">
                           <div className={`flex items-center gap-1.5 text-[10px] md:text-xs font-bold ${p.status.analysis ? 'text-primary' : 'text-outline-variant'}`}>
                              <span className="material-symbols-outlined text-[14px]">
                                 {p.status.analysis ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                              <span>문서 구조 분석</span>
                           </div>
                           <div className={`flex items-center gap-1.5 text-[10px] md:text-xs font-bold ${p.status.idea_enhance ? 'text-primary' : 'text-outline-variant'}`}>
                              <span className="material-symbols-outlined text-[14px]">
                                 {p.status.idea_enhance ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                              <span>사업 아이디어 구축</span>
                           </div>
                           <div className={`flex items-center gap-1.5 text-[10px] md:text-xs font-bold ${p.status.proposal_write ? 'text-primary' : 'text-outline-variant'}`}>
                              <span className="material-symbols-outlined text-[14px]">
                                 {p.status.proposal_write ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                              <span>사업계획서 작성</span>
                           </div>
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-1 md:px-2.5 md:py-1 bg-surface-variant text-on-surface-variant text-[0.65rem] md:text-xs font-bold rounded-md whitespace-nowrap">{typeof p.status === 'string' ? p.status : '알 수 없음'}</span>
                      )}
                    </td>
                    <td className="p-4 md:p-5 text-outline whitespace-nowrap">{p.updatedAt}</td>
                    <td className="p-4 md:p-5 text-center whitespace-nowrap">
                      <button onClick={() => onOpenProject(p.document_id)} className="text-outline hover:text-primary transition-colors p-1" title="열기"><span className="material-symbols-outlined text-lg md:text-xl">edit_square</span></button>
                      <button onClick={() => onDeleteProject(p.document_id)} className="text-outline hover:text-error ml-1 md:ml-3 transition-colors p-1" title="삭제"><span className="material-symbols-outlined text-lg md:text-xl">delete</span></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

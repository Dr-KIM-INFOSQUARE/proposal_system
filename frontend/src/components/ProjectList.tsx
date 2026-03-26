import React from 'react';

interface Project {
  id: string;
  name: string;
  filename: string;
  status: string;
  updatedAt: string;
}

interface ProjectListProps {
  onNewProject: () => void;
  onOpenProject: (documentId: string) => void;
  onDeleteProject: (documentId: string) => void;
  projects?: Project[];
}

export const ProjectList: React.FC<ProjectListProps> = ({ onNewProject, onOpenProject, onDeleteProject, projects = [] }) => {
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
                   <td colSpan={5} className="p-8 text-center text-outline">저장된 프로젝트가 없습니다. 샘플 데이터가 렌더링됩니다.</td>
                </tr>
              ) : (
                projects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-surface-container-highest/50 transition-colors group border-b border-outline-variant/10 last:border-0">
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-sm md:text-base flex items-center gap-2 md:gap-3">
                        <span className="material-symbols-outlined text-primary text-lg md:text-xl shrink-0">folder_open</span>
                        <span className="truncate">{p.name || p.filename}</span>
                      </div>
                    </td>
                    <td className="p-4 md:p-5 text-outline truncate max-w-[150px] md:max-w-[200px]" title={p.filename}>{p.filename}</td>
                    <td className="p-4 md:p-5">
                      <span className="inline-block px-2 py-1 md:px-2.5 md:py-1 bg-primary-fixed text-primary text-[0.65rem] md:text-xs font-bold rounded-md whitespace-nowrap">{p.status}</span>
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

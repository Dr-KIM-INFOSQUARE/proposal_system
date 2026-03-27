import React, { useState, useEffect } from 'react';
import { TreeNode } from './TreeNode';
import type { DocumentNode } from '../types';
import { toggleNode, toggleContentNode, updateNodeProperty } from '../utils/treeLogic';

interface DocumentTreeProps {
  initialTreeData: DocumentNode[];
  fileName: string | null;
  fileSize: string | null;
  pdfUrl?: string | null;
  onSave: (selectedIds: (string | number)[], contentIds: (string | number)[]) => void;
  onExport: (selectedIds: (string | number)[], contentIds: (string | number)[]) => void;
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
}


export const DocumentTree: React.FC<DocumentTreeProps> = ({ 
    initialTreeData, 
    fileName, 
    fileSize, 
    pdfUrl, 
    onSave, 
    onExport,
    onReanalyze,
    isAnalyzing
}) => {
  const [treeData, setTreeData] = useState<DocumentNode[]>(initialTreeData);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);


  useEffect(() => {
    // 트리 데이터 초기 로드 시 모든 항목을 기본적으로 체크 상태로 설정
    const initializeTree = (nodes: DocumentNode[]): DocumentNode[] => {
      return nodes.map(node => {
        const hasChildren = node.children && node.children.length > 0;
        return {
          ...node,
          // 섹션 선택은 모두 기본 체크
          checked: node.checked !== undefined ? node.checked : true,
          // 컨텐츠 작상 대상은 하위 항목이 없을 때만 기본 체크
          contentChecked: node.contentChecked !== undefined 
            ? node.contentChecked 
            : !hasChildren,
          children: node.children ? initializeTree(node.children) : []
        };
      });
    };
    setTreeData(initializeTree(initialTreeData));
  }, [initialTreeData]);

  const handleToggleCheck = (id: string | number, checked: boolean) => {
    setTreeData(prev => toggleNode(prev, id, checked));
  };

  const handleToggleContentCheck = (id: string | number, checked: boolean) => {
    setTreeData(prev => toggleContentNode(prev, id, checked));
  };

  const handleUpdateProperty = (id: string | number, property: keyof DocumentNode, value: any) => {
    setTreeData(prev => updateNodeProperty(prev, id, property, value));
  };


  const handleSelectAll = (checked: boolean) => {
    const newTree = JSON.parse(JSON.stringify(treeData));
    const setAll = (nodes: DocumentNode[]) => {
      nodes.forEach(n => {
        n.checked = checked;
        n.contentChecked = checked;
        n.indeterminate = false;
        if (n.children) setAll(n.children);
      });
    };
    setAll(newTree);
    setTreeData(newTree);
  };

  const getCheckedCount = (nodes: DocumentNode[]): number => {
    return nodes.reduce((acc, node) => acc + (node.checked ? 1 : 0) + (node.children ? getCheckedCount(node.children) : 0), 0);
  };

  const checkedCount = getCheckedCount(treeData);

  const getSelectedIds = () => {
      const selectedIds: (string | number)[] = [];
      const contentIds: (string | number)[] = [];
      const collectChecked = (nodes: DocumentNode[]) => {
          nodes.forEach(n => {
              if (n.checked) {
                  // If exported, include userInstruction
                  selectedIds.push(n.id);
              }
              if (n.contentChecked) contentIds.push(n.id);
              if (n.children) collectChecked(n.children);
          });
      };

      collectChecked(treeData);
      return { selectedIds, contentIds };
  };

  const handleSaveClick = () => {
      const ids = getSelectedIds();
      onSave(ids.selectedIds, ids.contentIds);
  };

  if (!fileName || treeData.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 mt-32 h-full">
        <div className="w-20 h-20 bg-surface-container-high rounded-full flex items-center justify-center mb-6 shadow-sm">
          <span className="material-symbols-outlined text-4xl text-outline">description</span>
        </div>
        <h2 className="text-xl font-headline font-bold text-on-surface mb-2">분석할 문서가 없습니다</h2>
        <p className="text-sm text-outline mb-6 text-center break-keep">파일이 아직 업로드되지 않았습니다.<br />좌측 사이드바에서 계획서를 업로드하세요.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 sm:p-6 md:p-10 pb-48 lg:pb-32 flex-1">
        <section className="bg-surface-container-lowest rounded-xl p-5 sm:p-6 md:p-8 mb-6 md:mb-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] border border-outline-variant/10">
            <div className="flex items-start md:items-center gap-4 md:gap-6 w-full xl:w-auto">
                <div className="bg-primary-fixed/30 p-3 md:p-4 rounded-xl shrink-0">
                    <span className="material-symbols-outlined text-primary text-2xl md:text-3xl">description</span>
                </div>
                <div className="min-w-0 w-full">
                    <h2 className="font-headline text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-on-surface truncate w-full" title={fileName}>{fileName}</h2>
                    <div className="flex flex-wrap gap-y-2 gap-x-4 md:gap-6 mt-2">
                        <div className="flex items-center gap-1.5 text-outline">
                            <span className="material-symbols-outlined text-[1rem]">data_usage</span>
                            <span className="text-[0.65rem] sm:text-xs font-medium">크기: {fileSize}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-outline">
                            <span className="material-symbols-outlined text-[1rem]">article</span>
                            <span className="text-[0.65rem] sm:text-xs font-medium">형식: {fileName.split('.').pop()?.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="w-full xl:w-auto flex flex-row xl:flex-col items-center xl:items-end justify-between xl:justify-center border-t xl:border-t-0 pt-4 xl:pt-0 border-outline-variant/10">
                <div className="flex flex-col items-center xl:items-end gap-2">
                    <span className="text-[0.6875rem] font-label uppercase tracking-widest text-outline block mb-0 xl:mb-1">상태</span>
                    <div className="flex items-center gap-2 text-primary font-bold text-sm md:text-base">
                        <span className={`w-2 h-2 rounded-full bg-primary ${isAnalyzing ? 'animate-ping' : 'animate-pulse'}`}></span> 
                        {isAnalyzing ? '분석 진행 중...' : '구조 분석 완료'}
                    </div>
                    {onReanalyze && (
                        <button 
                            onClick={onReanalyze}
                            disabled={isAnalyzing}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-primary/30 text-primary text-[10px] md:text-xs font-bold rounded-lg hover:bg-primary/5 transition-all disabled:opacity-50 shadow-sm"
                        >
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            모델 다시 분석
                        </button>
                    )}
                </div>
            </div>
        </section>

        <div className="flex flex-col xl:flex-row items-start gap-6 md:gap-10">
            {/* 왼쪽: 문서 구조 트리 */}
            <section className="flex-1 w-full bg-surface-container-lowest rounded-xl p-5 md:p-8 shadow-[0_12px_32px_-4px_rgba(25,28,30,0.06)] border border-outline-variant/10 overflow-hidden flex flex-col transition-all duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-3">
                            <h3 className="font-headline text-base md:text-lg font-bold truncate">문서 구조 트리</h3>
                            {!isPreviewVisible && (
                                <button 
                                    onClick={() => setIsPreviewVisible(true)}
                                    className="px-2 py-1 text-[10px] font-bold text-primary bg-primary/10 rounded hover:bg-primary/20 transition-all flex items-center gap-1 animate-pulse"
                                >
                                    <span className="material-symbols-outlined text-xs">visibility</span> 원본 미리보기 열기
                                </button>
                            )}
                        </div>
                        <p className="text-xs md:text-sm text-outline mt-1 break-keep">작성 및 변환이 필요한 섹션을 체크하세요.</p>
                    </div>
                    <div className="flex gap-2 sm:gap-3 self-end sm:self-auto shrink-0">
                        <button onClick={() => handleSelectAll(false)} className="px-3 md:px-4 py-1.5 md:py-2 text-[0.65rem] md:text-xs font-bold text-outline hover:text-on-surface hover:bg-surface-container transition-all rounded-lg uppercase tracking-wider">전체 해제</button>
                        <button onClick={() => handleSelectAll(true)} className="px-3 md:px-4 py-1.5 md:py-2 text-[0.65rem] md:text-xs font-bold text-primary hover:bg-primary-fixed/30 transition-all rounded-lg uppercase tracking-wider bg-primary-fixed/10">전체 선택</button>
                    </div>
                </div>
 
                <div className="space-y-4">
                   {treeData.map(node => (
                     <TreeNode 
                        key={node.id} 
                        node={node} 
                        onToggleCheck={handleToggleCheck} 
                        onToggleContentCheck={handleToggleContentCheck} 
                        onUpdateProperty={handleUpdateProperty}
                        level={0} 
                     />
                   ))}
                </div>
            </section>
 
            {/* 오른쪽: PDF 미리보기 */}
            {isPreviewVisible && (
                <section className="xl:basis-[45%] w-full xl:w-[45%] bg-surface-container-low rounded-xl shadow-inner border border-outline-variant/10 overflow-hidden flex flex-col transition-all duration-300 animate-slide-in-right sticky top-[74px] h-[calc(100vh-74px-128px)] min-h-[500px]">
                    <div className="flex items-center justify-between px-5 py-3 bg-surface-container-high/50 border-b border-outline-variant/10">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
                            <span className="text-xs font-bold uppercase tracking-widest text-outline">원본 문서 미리보기</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {pdfUrl && (
                                <a 
                                    href={`http://127.0.0.1:8000${pdfUrl}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[12px]">open_in_new</span> 새 탭에서 열기
                                </a>
                            )}
                            <button 
                                onClick={() => setIsPreviewVisible(false)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-container-highest text-outline transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 bg-surface-container-lowest relative">
                        {pdfUrl ? (
                            <iframe 
                                src={`http://127.0.0.1:8000${pdfUrl}#toolbar=0`} 
                                className="w-full h-full border-none"
                                title="PDF Preview"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-outline gap-4 p-10 text-center">
                                <span className="material-symbols-outlined text-4xl opacity-20">picture_as_pdf</span>
                                <p className="text-xs font-medium">PDF 미리보기를 생성할 수 없습니다.<br/>원본 한글 파일 형식을 확인해주세요.</p>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>

      </div>


      <footer className="fixed bottom-0 left-0 lg:left-96 w-full lg:w-[calc(100%-24rem)] bg-surface-container-lowest/90 backdrop-blur-xl border-t border-outline-variant/10 p-4 md:p-6 z-40 transition-all duration-300">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center justify-center sm:justify-start w-full sm:w-auto gap-2 sm:gap-4 text-outline text-xs sm:text-sm">
                  <span className="material-symbols-outlined text-primary text-lg sm:text-xl">verified_user</span> 
                  <span>선택됨: <strong className="text-on-surface">{checkedCount}개 항목</strong> 추출 준비</span>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
                  <button onClick={() => onExport(getSelectedIds().selectedIds, getSelectedIds().contentIds)} className="w-full sm:w-auto px-4 md:px-6 py-2.5 md:py-3 text-xs md:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 shadow-teal-500/20 text-white font-bold rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm">
                      <span className="material-symbols-outlined text-base md:text-lg">file_download</span> JSON 내보내기
                  </button>
                  <button onClick={handleSaveClick} className="w-full sm:w-auto px-4 md:px-8 py-2.5 md:py-3 text-xs md:text-sm bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-lg shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-base md:text-lg">save</span> 프로젝트 저장
                  </button>
              </div>
          </div>
      </footer>
    </>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import type { DocumentNode } from '../types';

interface TreeNodeProps {
  node: DocumentNode;
  onToggleCheck: (id: string | number, checked: boolean) => void;
  onToggleContentCheck: (id: string | number, checked: boolean) => void;
  onUpdateProperty: (id: string | number, property: keyof DocumentNode, value: any) => void;
  onDeleteNode?: (id: string | number) => void;
  level?: number;
}

export const TreeNode: React.FC<TreeNodeProps> = ({ 
    node, 
    onToggleCheck, 
    onToggleContentCheck, 
    onUpdateProperty,
    onDeleteNode,
    level = 0 
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [contentHover, setContentHover] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !!node.indeterminate;
    }
  }, [node.indeterminate]);

  // 편집 시작 시 input에 포커스
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // 제목 변경사항 동기화
  useEffect(() => {
    setEditTitle(node.title);
  }, [node.title]);

  const handleEditStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleEditSave = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== node.title) {
      onUpdateProperty(node.id, 'title', trimmed);
    } else {
      setEditTitle(node.title); // 빈 값이면 원래대로 복구
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditTitle(node.title);
      setIsEditing(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const childCount = countChildren(node);
    const message = childCount > 0
      ? `"${node.title}" 노드와 하위 ${childCount}개 항목을 모두 삭제하시겠습니까?`
      : `"${node.title}" 노드를 삭제하시겠습니까?`;
    
    if (window.confirm(message)) {
      onDeleteNode?.(node.id);
    }
  };

  const countChildren = (n: DocumentNode): number => {
    if (!n.children) return 0;
    return n.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
  };

  return (
    <div className={`space-y-1.5 ${level > 0 ? 'ml-5 sm:ml-6 md:ml-8 border-l-2 border-surface-container-high pl-3 md:pl-5' : ''}`}>
      <div className="flex items-start sm:items-center gap-2 sm:gap-3 group/node mt-1.5">
        <input 
          type="checkbox" 
          ref={checkboxRef}
          checked={node.checked}
          onChange={(e) => onToggleCheck(node.id, e.target.checked)}
          className="w-4 h-4 md:w-5 md:h-5 mt-1 sm:mt-0 rounded text-primary border-outline-variant focus:ring-primary/20 cursor-pointer shrink-0" 
        />
        <div 
          onClick={() => !isEditing && setIsExpanded(!isExpanded)}
          title={node.title}
          className={`flex-1 min-w-0 flex items-center justify-between gap-3 bg-white px-3 md:px-4 py-2.5 md:py-3 rounded-lg hover:bg-primary/5 transition-all cursor-pointer border-l-4 ${level === 0 ? 'border-primary shadow-sm' : 'border-outline-variant/30 hover:border-primary/50'} ${contentHover ? 'bg-primary/5 border-primary/50' : ''} ${isExpanded ? 'bg-primary-fixed/10 ring-1 ring-primary/20' : 'border border-outline-variant/10'}`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={handleEditKeyDown}
                onClick={(e) => e.stopPropagation()}
                className={`flex-1 bg-white border-2 border-primary/40 rounded-md px-2 py-1 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all ${level === 0 ? 'font-bold text-sm md:text-base' : 'text-xs md:text-sm font-semibold'} text-on-surface`}
              />
            ) : (
              <span className={`${level === 0 ? 'font-bold text-sm md:text-base' : 'text-xs md:text-sm font-semibold'} text-on-surface truncate`} title={node.title}>
                {node.title}
              </span>
            )}
            {!isEditing && node.type === 'table' && (
              <span className="bg-primary-fixed text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-primary uppercase tracking-wider shrink-0">표</span>
            )}
            {!isEditing && node.type === 'item' && (
               <span className="bg-surface-container-highest text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-outline uppercase tracking-wider shrink-0">세부항목</span>
            )}
            {!isEditing && node.writingGuide && (
               <span className="flex items-center gap-1 text-[10px] text-primary font-bold shrink-0">
                 <span className="material-symbols-outlined text-xs">lightbulb</span> 작성요령 포함
               </span>
            )}
          </div>
          
          {/* 호버 시 수정/삭제 아이콘 */}
          <div className="flex items-center gap-1 shrink-0">
            {!isEditing && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity duration-200">
                <button
                  onClick={handleEditStart}
                  className="p-1 rounded-md hover:bg-primary/10 text-outline hover:text-primary transition-all"
                  title="노드 제목 수정"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                {onDeleteNode && (
                  <button
                    onClick={handleDelete}
                    className="p-1 rounded-md hover:bg-red-50 text-outline hover:text-red-500 transition-all"
                    title="노드 삭제"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>
            )}
            <span className={`material-symbols-outlined transition-transform duration-300 text-outline ${isExpanded ? 'rotate-180' : ''}`}>
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </div>
        {node.checked && (
          <div 
            className="flex items-center gap-1.5 md:gap-2 ml-1 pl-2 sm:pl-3 border-l-2 border-outline-variant/30 flex-shrink-0 animate-fade-in"
            onMouseEnter={() => setContentHover(true)}
            onMouseLeave={() => setContentHover(false)}
          >
              <input 
                 type="checkbox"
                 id={`content_check_${node.id}`}
                 checked={!!node.contentChecked}
                 onChange={(e) => onToggleContentCheck(node.id, e.target.checked)}
                 className="w-4 h-4 text-secondary bg-surface-container border-outline-variant focus:ring-secondary/20 rounded cursor-pointer"
              />
              <label htmlFor={`content_check_${node.id}`} className="text-[10px] sm:text-[0.7rem] font-bold text-outline md:whitespace-nowrap cursor-pointer select-none">
                  컨텐츠 작성
              </label>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4 sm:ml-5 md:ml-6 mt-1.5 p-3 md:p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-sm animate-fade-in space-y-3">
          {node.writingGuide && (
            <div className="bg-primary-fixed/5 p-4 rounded-lg border border-primary-fixed/20">
              <div className="flex items-center gap-2 text-primary mb-2">
                <span className="material-symbols-outlined text-sm">tips_and_updates</span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">AI 추출 작성요령</span>
              </div>
              <p className="text-xs sm:text-sm text-on-surface leading-relaxed break-keep">
                {node.writingGuide}
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-outline">
                <span className="material-symbols-outlined text-sm">edit_note</span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">사용자 정의 요청사항</span>
              </div>
              <span className="text-[9px] text-outline italic">AI가 사업계획서 내용을 작성할 때 최우선으로 참고합니다.</span>
            </div>
            <textarea 
              value={node.userInstruction || ''}
              onChange={(e) => onUpdateProperty(node.id, 'userInstruction', e.target.value)}
              placeholder="사업의 핵심 아이디어나 이 항목에 꼭 들어가야 할 내용을 입력하세요."
              className="w-full h-24 p-3 text-xs sm:text-sm bg-white border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none shadow-sm"
            />
          </div>
        </div>
      )}
      
      {hasChildren && (
        <div className="space-y-1.5 relative mt-1.5">
          {node.children!.map(child => (
            <TreeNode 
              key={child.id} 
              node={child} 
              onToggleCheck={onToggleCheck} 
              onToggleContentCheck={onToggleContentCheck} 
              onUpdateProperty={onUpdateProperty}
              onDeleteNode={onDeleteNode}
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import type { DocumentNode } from '../types';

interface TreeNodeProps {
  node: DocumentNode;
  onToggleCheck: (id: string | number, checked: boolean) => void;
  onToggleContentCheck: (id: string | number, checked: boolean) => void;
  onUpdateProperty: (id: string | number, property: keyof DocumentNode, value: any) => void;
  level?: number;
}

export const TreeNode: React.FC<TreeNodeProps> = ({ 
    node, 
    onToggleCheck, 
    onToggleContentCheck, 
    onUpdateProperty,
    level = 0 
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [contentHover, setContentHover] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !!node.indeterminate;
    }
  }, [node.indeterminate]);

  return (
    <div className={`space-y-3 ${level > 0 ? 'ml-7 sm:ml-9 md:ml-12 border-l-2 border-surface-container-high pl-4 md:pl-8' : ''}`}>
      <div className="flex items-start sm:items-center gap-3 sm:gap-4 group mt-3">
        <input 
          type="checkbox" 
          ref={checkboxRef}
          checked={node.checked}
          onChange={(e) => onToggleCheck(node.id, e.target.checked)}
          className="w-4 h-4 md:w-5 md:h-5 mt-1 sm:mt-0 rounded text-primary border-outline-variant focus:ring-primary/20 cursor-pointer shrink-0" 
        />
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex-1 flex items-center justify-between gap-3 bg-surface-container-low px-3 md:px-4 py-2.5 md:py-3 rounded-lg hover:bg-surface-container-high transition-all cursor-pointer border-l-4 ${level === 0 ? 'border-primary' : 'border-transparent hover:border-primary/50'} ${contentHover ? 'bg-surface-container-high border-primary/50' : ''} ${isExpanded ? 'bg-surface-container-high ring-1 ring-primary/20' : ''}`}
        >
          <div className="flex items-center gap-3">
            <span className={`${level === 0 ? 'font-bold text-sm md:text-base' : 'text-xs md:text-sm font-semibold'} text-on-surface`}>
              {node.title}
            </span>
            {node.type === 'table' && (
              <span className="bg-primary-fixed text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-primary uppercase tracking-wider">표</span>
            )}
            {node.type === 'info' && (
               <span className="bg-surface-container-highest text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-outline uppercase tracking-wider">안내</span>
            )}
            {node.writingGuide && (
               <span className="flex items-center gap-1 text-[10px] text-primary font-bold">
                 <span className="material-symbols-outlined text-xs">lightbulb</span> 작성요령 포함
               </span>
            )}
          </div>
          <span className={`material-symbols-outlined transition-transform duration-300 text-outline ${isExpanded ? 'rotate-180' : ''}`}>
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
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
        <div className="ml-8 sm:ml-9 md:ml-12 mt-2 p-4 md:p-6 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-sm animate-fade-in space-y-4">
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
              className="w-full h-24 p-3 text-xs sm:text-sm bg-surface-container border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
          </div>
        </div>
      )}
      
      {hasChildren && (
        <div className="space-y-3 relative mt-3">
          {node.children!.map(child => (
            <TreeNode 
              key={child.id} 
              node={child} 
              onToggleCheck={onToggleCheck} 
              onToggleContentCheck={onToggleContentCheck} 
              onUpdateProperty={onUpdateProperty}
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

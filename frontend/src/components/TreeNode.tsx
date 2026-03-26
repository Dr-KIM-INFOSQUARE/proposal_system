import React, { useRef, useEffect, useState } from 'react';
import type { DocumentNode } from '../types';

interface TreeNodeProps {
  node: DocumentNode;
  onToggleCheck: (id: string | number, checked: boolean) => void;
  onToggleContentCheck: (id: string | number, checked: boolean) => void;
  level?: number;
}

export const TreeNode: React.FC<TreeNodeProps> = ({ node, onToggleCheck, onToggleContentCheck, level = 0 }) => {
  const hasChildren = node.children && node.children.length > 0;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [contentHover, setContentHover] = useState(false);

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
          onClick={() => onToggleCheck(node.id, !node.checked)}
          className={`flex items-center gap-3 bg-surface-container-low px-3 md:px-4 py-2.5 md:py-3 rounded-lg w-full hover:bg-surface-container-high transition-colors cursor-pointer border-l-4 ${level === 0 ? 'border-primary' : 'border-transparent hover:border-primary/50'} ${contentHover ? 'bg-surface-container-high border-primary/50' : ''}`}
        >
          <span className={`${level === 0 ? 'font-bold text-sm md:text-base' : 'text-xs md:text-sm font-semibold'} text-on-surface`}>
            {node.title}
          </span>
          {node.type === 'table' && (
            <span className="bg-primary-fixed text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-primary uppercase tracking-wider">표</span>
          )}
          {node.type === 'info' && (
             <span className="bg-surface-container-highest text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded text-outline uppercase tracking-wider">안내</span>
          )}
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
      
      {hasChildren && (
        <div className="space-y-3 relative mt-3">
          {node.children!.map(child => (
            <TreeNode key={child.id} node={child} onToggleCheck={onToggleCheck} onToggleContentCheck={onToggleContentCheck} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

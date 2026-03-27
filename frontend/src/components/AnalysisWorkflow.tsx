import React, { useState, useRef, useEffect } from 'react';
import { DocumentTree } from './DocumentTree';
import type { DocumentTreeRef } from './DocumentTree';
import type { DocumentNode } from '../types';

interface AnalysisWorkflowProps {
  initialTreeData: DocumentNode[];
  fileName: string | null;
  fileSize: string | null;
  pdfUrl?: string | null;
  onSave: (selectedIds: (string | number)[], contentIds: (string | number)[]) => void;
  onExport: (selectedIds: (string | number)[], contentIds: (string | number)[]) => void;
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
  onFileSelect: (file: File) => void;
  onStartAnalysis: () => void;
  onCancelSelection: () => void;
  onTitleChange: (title: string) => void;
  hasSelectedFile: boolean;
}

export const AnalysisWorkflow: React.FC<AnalysisWorkflowProps> = (props) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const treeRef = useRef<DocumentTreeRef>(null);
  
  // 트리가 비어있으면(초기화/취소) 진행 상태도 초기화
  useEffect(() => {
    if (props.initialTreeData.length === 0) {
      setCompletedSteps([]);
      setActiveStep(0); // 모든 단계를 닫힘 상태로 초기화
    }
  }, [props.initialTreeData]);

  const toggleStep = (step: number) => {
    setActiveStep(activeStep === step ? 0 : step);
  };

  const isStepDisabled = (step: number) => {
    if (step === 1) return false;
    return !completedSteps.includes(step - 1);
  };

  const handleStepCompletion = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
      if (step < 3) setActiveStep(step + 1);
    }
  };

  const handleTopExport = () => {
    if (treeRef.current) {
      const { selectedIds, contentIds } = treeRef.current.getSelectedIds();
      props.onExport(selectedIds, contentIds);
    }
  };

  const handleTopSave = () => {
    if (treeRef.current) {
      const { selectedIds, contentIds } = treeRef.current.getSelectedIds();
      props.onSave(selectedIds, contentIds);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      props.onFileSelect(file);
    }
  };

  const triggerFileSelect = () => {
    if (!props.isAnalyzing) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pb-32 flex-1 max-w-[120rem] mx-auto">
      {/* 상단 파일 정보 영역 및 액션 버튼 */}
      <div className="bg-surface-container-lowest rounded-3xl p-6 mb-10 shadow-sm border border-outline-variant/10 flex flex-col md:flex-row items-center justify-between gap-8 animate-fade-in">
        <div className="flex items-center gap-6 flex-1 w-full md:w-auto">
          <div 
            onClick={triggerFileSelect}
            className={`h-20 px-6 rounded-2xl flex items-center justify-center gap-4 transition-all cursor-pointer ${props.isAnalyzing ? 'bg-primary animate-pulse min-w-[10rem]' : 'bg-primary/10 hover:bg-primary/20 hover:scale-[1.02] active:scale-95 shadow-sm border border-primary/5 min-w-[12rem]'}`}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".docx,.pdf,.hwpx" onChange={handleFileChange} />
            <span className={`material-symbols-outlined text-3xl ${props.isAnalyzing ? 'text-white' : 'text-primary'}`}>
                {props.isAnalyzing ? 'hourglass_empty' : props.fileName ? 'description' : 'cloud_upload'}
            </span>
            <div className={`flex flex-col items-start ${props.isAnalyzing ? 'text-white' : 'text-primary'}`}>
                <span className="text-xs font-black uppercase tracking-wider opacity-70">Document</span>
                <span className="text-sm font-black whitespace-nowrap">{props.isAnalyzing ? '분석 진행 중' : props.fileName ? '다른 파일 선택' : '사업계획서 양식 업로드'}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 group/title">
                <input 
                    type="text"
                    value={props.fileName || ''}
                    onChange={(e) => props.onTitleChange(e.target.value)}
                    placeholder={props.isAnalyzing ? "분석 중..." : "분석 대기 중..."}
                    className="flex-1 bg-transparent text-xl md:text-2xl font-headline font-black text-on-surface border-none focus:ring-2 focus:ring-primary/20 rounded-lg py-1 px-2 -ml-2 transition-all outline-none placeholder:text-outline/30 placeholder:italic"
                    disabled={props.isAnalyzing}
                />
                {!props.isAnalyzing && (
                    <span className="material-symbols-outlined text-outline opacity-0 group-hover/title:opacity-100 transition-opacity text-sm">edit</span>
                )}
                {props.isAnalyzing && (
                    <span className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-black rounded-full uppercase tracking-tighter border border-primary/20 animate-pulse">Analyzing</span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <p className="text-xs md:text-sm font-medium text-outline">
                    {props.fileSize ? `용량: ${props.fileSize}` : '(.hwpx, .docx, .pdf 선택 가능)'}
                </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            {/* 파일은 선택되었지만 아직 분석 시작 전인 경우 */}
            {props.hasSelectedFile && !props.isAnalyzing && (
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                        onClick={props.onCancelSelection}
                        className="flex-1 md:flex-none px-6 py-3.5 bg-surface-container-high text-on-surface text-sm font-bold rounded-2xl border border-outline-variant/20 hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-lg opacity-60">close</span>
                        취소
                    </button>
                    <button 
                        onClick={props.onStartAnalysis}
                        className="flex-[2] md:flex-none px-8 py-3.5 bg-gradient-to-r from-primary to-primary-container text-white text-sm font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 hover:shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-2 group"
                    >
                        <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                        문서 분석 시작
                    </button>
                </div>
            )}

            {/* Step 1 분석 완료 후 제공되는 액션 버튼들 */}
            {!props.hasSelectedFile && props.fileName && !props.isAnalyzing && (
                <>
                    {activeStep === 1 && (
                        <button 
                          onClick={handleTopExport}
                          className="px-5 py-3 bg-surface-container-high text-on-surface text-xs font-bold rounded-xl border border-outline-variant/20 hover:bg-surface-container-highest transition-all flex items-center gap-2 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-lg">file_download</span>
                          JSON 내보내기
                        </button>
                    )}
                    
                    <button 
                        onClick={handleTopSave}
                        className="px-8 py-3 bg-primary text-white text-sm font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">save</span>
                      프로젝트 저장
                    </button>
                </>
            )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Step 1: 문서 구조 분석 */}
        <AccordionSection 
           number={1}
           title="문서 구조 분석"
           isOpen={activeStep === 1}
           isCompleted={completedSteps.includes(1)}
           onToggle={() => toggleStep(1)}
           isDisabled={false}
        >
          <div className="mt-4">
            <DocumentTree 
                {...props} 
                ref={treeRef}
                hideHeader={true} 
                hideFooter={true} 
                onStepComplete={() => handleStepCompletion(1)}
            />
          </div>
        </AccordionSection>

        {/* Step 2: 사업 아이디어 구축 */}
        <AccordionSection 
           number={2}
           title="사업 아이디어 구축"
           isOpen={activeStep === 2}
           isCompleted={completedSteps.includes(2)}
           onToggle={() => toggleStep(2)}
           isDisabled={isStepDisabled(2)}
        >
          <div className="py-20 flex flex-col items-center justify-center text-outline gap-4">
             <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl opacity-30">lightbulb</span>
             </div>
             <p className="text-sm font-medium">아이디어 입력 준비 중입니다.</p>
             <button 
                onClick={() => handleStepCompletion(2)}
                className="mt-4 px-6 py-2 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-all"
             >
                다음 단계로 (임시)
             </button>
          </div>
        </AccordionSection>

        {/* Step 3: 사업계획서 작성 */}
        <AccordionSection 
           number={3}
           title="사업계획서 작성"
           isOpen={activeStep === 3}
           isCompleted={completedSteps.includes(3)}
           onToggle={() => toggleStep(3)}
           isDisabled={isStepDisabled(3)}
        >
          <div className="py-20 flex flex-col items-center justify-center text-outline gap-4">
             <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl opacity-30">edit_note</span>
             </div>
             <p className="text-sm font-medium">사업계획서 생성을 시작할 수 있습니다.</p>
          </div>
        </AccordionSection>
      </div>
    </div>
  );
};

interface AccordionSectionProps {
  number: number;
  title: string;
  isOpen: boolean;
  isCompleted: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({ number, title, isOpen, isCompleted, isDisabled, onToggle, children }) => {
  return (
    <div className={`bg-surface-container-lowest rounded-2xl border transition-all duration-300 ${
      isOpen ? 'border-primary/30 shadow-md ring-1 ring-primary/5 overflow-visible' : 'border-outline-variant/10 shadow-sm opacity-80 overflow-hidden'
    } ${isDisabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
      <div 
        onClick={onToggle}
        className={`px-6 py-5 flex items-center justify-between cursor-pointer group transition-colors ${isOpen ? 'bg-primary/5' : 'hover:bg-surface-container-low'}`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm transition-all ${
            isCompleted ? 'bg-emerald-500 text-white' : isOpen ? 'bg-primary text-white' : 'bg-surface-container-high text-outline'
          }`}>
            {isCompleted ? <span className="material-symbols-outlined text-lg">check</span> : number}
          </div>
          <h3 className={`text-lg font-headline font-bold transition-colors ${isOpen || isCompleted ? 'text-on-surface' : 'text-outline-variant'}`}>
            {title}
          </h3>
        </div>
        <span className={`material-symbols-outlined transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-outline-variant group-hover:text-outline'}`}>
          expand_more
        </span>
      </div>
      
      {isOpen && (
        <div className="border-t border-outline-variant/5">
          {children}
        </div>
      )}
    </div>
  );
};

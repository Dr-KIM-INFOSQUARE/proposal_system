import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { DocumentTree } from './DocumentTree';
import type { DocumentTreeRef } from './DocumentTree';
import type { DocumentNode } from '../types';

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = (props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    resize();
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      onInput={(e) => {
        resize();
        if (props.onInput) props.onInput(e);
      }}
      className={`auto-resize w-full min-h-[80px] text-sm resize-none outline-none bg-transparent text-on-surface font-mono overflow-hidden leading-[1.8] ${props.className || ''}`}
    />
  );
};

interface AnalysisWorkflowProps {
  initialTreeData: DocumentNode[];
  initialMasterBrief: string;
  documentId: string | null;
  selectedModel: string;
  fileName: string | null;
  fileSize: string | null;
  initialIdeaData?: string;
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
  uploadMessage?: string | null;
  onEnhanceStateChange?: (active: boolean, msg?: string) => void;
}

export const AnalysisWorkflow: React.FC<AnalysisWorkflowProps> = (props) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const treeRef = useRef<DocumentTreeRef>(null);

  const [ideaMode, setIdeaMode] = useState<'guide' | 'free'>('guide');
  const [guideAnswers, setGuideAnswers] = useState({
    q1: '', q2: '', q3: '', q4: '', q5: ''
  });
  const [ideaText, setIdeaText] = useState('');
  const [masterBrief, setMasterBrief] = useState('');
  const [masterBriefData, setMasterBriefData] = useState<any>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  // Step 3 UI States
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftLogs, setDraftLogs] = useState<string[]>([]);
  const [draftTree, setDraftTree] = useState<DocumentNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const [researchMode, setResearchMode] = useState<'fast' | 'deep'>('deep');

  // 초안 생성 실행 (SSE)
  const handleGenerateDraft = async () => {
    if (!props.documentId) {
      alert("프로젝트가 아직 저장되지 않았거나 ID를 찾을 수 없습니다. 다시 시도하거나 프로젝트를 저장해 주세요.");
      return;
    }
    
    // 즉각적인 UI 피드백을 위해 상태 먼저 설정
    console.log("[Workflow] Starting draft generation. Mode:", researchMode);
    setIsGeneratingDraft(true);
    setDraftTree([]);
    
    // 헤더 프로그레스 바 활성화
    if (props.onEnhanceStateChange) {
        props.onEnhanceStateChange(true, "초안 생성 초기화 중...");
    }

    try {
      const finalTree = await api.generateDraftStream(
        props.documentId, 
        props.selectedModel,
        researchMode,
        (msg) => {
          // 헤더 텍스트 실시간 업데이트
          if (props.onEnhanceStateChange) {
              props.onEnhanceStateChange(true, msg);
          }
          setDraftLogs(prev => [...prev, `> ${msg}`]);
        }
      );

      if (finalTree) {
        setDraftTree(finalTree);
        if (props.onEnhanceStateChange) {
            props.onEnhanceStateChange(false, "초안 작성이 완료되었습니다.");
        }
        const firstDraftNode = findFirstContentNode(finalTree);
        if (firstDraftNode) setSelectedNodeId(firstDraftNode.id);
      }
    } catch (err) {
      console.error("[Workflow] Draft generation failed:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (props.onEnhanceStateChange) {
          props.onEnhanceStateChange(false);
      }
      alert("초안 생성 중 오류가 발생했습니다: " + errorMsg);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // 트리에서 첫 번째 컨텐츠 노드 찾기
  const findFirstContentNode = (nodes: DocumentNode[]): DocumentNode | null => {
    for (const node of nodes) {
      if (node.content && node.draft_content) return node;
      if (node.children) {
        const found = findFirstContentNode(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // 특정 노드 찾기 및 업데이트
  const findAndUpdateNode = (nodes: DocumentNode[], id: string | number, content: string): DocumentNode[] => {
    return nodes.map(node => {
      if (node.id === id) return { ...node, draft_content: content };
      if (node.children) return { ...node, children: findAndUpdateNode(node.children, id, content) };
      return node;
    });
  };

  const selectedNode = selectedNodeId ? (function find(nodes: DocumentNode[]): DocumentNode | undefined {
    for (const n of nodes) {
      if (n.id === selectedNodeId) return n;
      if (n.children) {
        const found = find(n.children);
        if (found) return found;
      }
    }
    return undefined;
  })(draftTree) : undefined;

  // Step 4 UI States
  const [isEnhancingProposal, setIsEnhancingProposal] = useState(false);
  const [finalProposal, setFinalProposal] = useState('');
  
  // 트리가 입수되면 1단계를 자동으로 완료 처리
  useEffect(() => {
    if (props.initialTreeData.length > 0) {
      if (!completedSteps.includes(1)) {
        setCompletedSteps(prev => [...prev.filter(s => s !== 1), 1]);
        setActiveStep(1); // 분석 완료 시 1단계를 열려있는 상태로 유지
      }
    } else {
      setCompletedSteps([]);
      // 파일이 선택되어 있거나 분석 중이면 Step 1을 계속 열어둠
      if (props.hasSelectedFile || props.isAnalyzing) {
        setActiveStep(1);
      } else if (activeStep !== 1) {
        // 아무것도 없는 초기 상태에서만 닫힘
        setActiveStep(1); // 기본적으로 Step 1은 항상 열어둠
      }
    }
  }, [props.initialTreeData]); // 전체 데이터 변화 감지

  // 마스터 브리프 초기화
  useEffect(() => {
    if (props.initialMasterBrief) {
      try {
        const parsed = JSON.parse(props.initialMasterBrief);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            setMasterBriefData(parsed);
            setMasterBrief('');
        } else {
            throw new Error('Not object');
        }
      } catch (e) {
        setMasterBrief(props.initialMasterBrief);
        setMasterBriefData(null);
      }
      setCompletedSteps(prev => {
         if (!prev.includes(2)) return [...prev, 2];
         return prev;
      });
    } else {
      setMasterBrief('');
      setMasterBriefData(null);
    }
  }, [props.initialMasterBrief]);

  // 기초 아이디어 폼 초기화
  useEffect(() => {
      if (props.initialIdeaData) {
          try {
              const parsed = JSON.parse(props.initialIdeaData);
              if (parsed.mode) setIdeaMode(parsed.mode);
              if (parsed.guideAnswers) setGuideAnswers(parsed.guideAnswers);
              if (parsed.ideaText) setIdeaText(parsed.ideaText);
          } catch (e) {
              console.error("Failed to parse initialIdeaData", e);
          }
      } else {
          setIdeaMode('guide');
          setGuideAnswers({ q1: '', q2: '', q3: '', q4: '', q5: '' });
          setIdeaText('');
      }
  }, [props.initialIdeaData]);

  // 텍스트 영역 자동 높이 조절
  useEffect(() => {
     if (masterBriefData || masterBrief) {
        setTimeout(() => {
           const textareas = document.querySelectorAll('textarea.auto-resize');
           textareas.forEach((el: any) => {
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
           });
        }, 10);
     }
  }, [masterBriefData, masterBrief]);

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

  const handleReanalyze = () => {
    if (!props.onReanalyze) return;
    if (window.confirm('AI 재분석을 실행하면 기존에 수정한 트리 구조가 초기화됩니다.\n진행하시겠습니까?')) {
      props.onReanalyze();
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
          <div className="mt-4 flex flex-col gap-6">
            
            {/* 파일 업로드 영역 */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6 flex-1 w-full md:w-auto">
                    <div 
                        onClick={triggerFileSelect}
                        className={`h-20 px-6 rounded-2xl flex items-center justify-center gap-4 transition-all cursor-pointer ${props.isAnalyzing ? 'bg-surface-container cursor-not-allowed opacity-50' : 'bg-primary/10 hover:bg-primary/20 hover:scale-[1.02] active:scale-95 shadow-sm border border-primary/5'} min-w-[12rem]`}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".docx,.pdf,.hwpx" onChange={handleFileChange} />
                        <span className={`material-symbols-outlined text-3xl text-primary`}>
                            {props.fileName ? 'description' : 'cloud_upload'}
                        </span>
                        <div className="flex flex-col items-start text-primary">
                            <span className="text-xs font-black uppercase tracking-wider opacity-70">Document</span>
                            <span className="text-sm font-black whitespace-nowrap">{props.fileName ? '다른 파일 선택' : '사업계획서 양식 업로드'}</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        {props.fileName && (
                            <p className="text-lg font-bold text-on-surface truncate">{props.fileName}</p>
                        )}
                        <p className="text-xs md:text-sm font-medium text-outline mt-1">
                            {props.fileSize ? `용량: ${props.fileSize}` : '(.hwpx, .docx, .pdf 선택 가능)'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                    {/* 분석 시작 전 */}
                    {props.hasSelectedFile && !props.isAnalyzing && (
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button 
                                onClick={props.onCancelSelection}
                                className="px-5 py-3 bg-surface-container-high text-on-surface text-sm font-bold rounded-xl border border-outline-variant/20 hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg opacity-60">close</span> 취소
                            </button>
                            <button 
                                onClick={props.onStartAnalysis}
                                className="px-6 py-3 bg-gradient-to-r from-primary to-primary-container text-white text-sm font-black rounded-xl shadow-md hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 group"
                            >
                                <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                                문서 분석 시작
                            </button>
                        </div>
                    )}

                    {/* 분석 완료 후 액션 */}
                    {!props.hasSelectedFile && props.fileName && !props.isAnalyzing && (
                        <>
                            {props.onReanalyze && (
                                <button 
                                    onClick={handleReanalyze}
                                    className="px-4 py-2.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[16px]">refresh</span> AI 재분석
                                </button>
                            )}
                            <button 
                                onClick={handleTopExport}
                                className="px-4 py-2.5 bg-surface-container-high text-on-surface text-xs font-bold rounded-lg border border-outline-variant/20 hover:bg-surface-container-highest transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[16px]">file_download</span> 추출
                            </button>
                            <button 
                                onClick={handleTopSave}
                                className="px-6 py-2.5 bg-primary/10 text-primary text-sm font-black rounded-lg border border-primary/20 hover:bg-primary/20 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">save</span> 저장
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 본문 트리 영역 */}
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
          <div className="py-6 flex flex-col xl:flex-row gap-6">
            {/* 왼쪽: 기초 아이디어 입력창 (투트랙 모드) */}
            <div className="flex-1 flex flex-col gap-4 bg-surface rounded-2xl p-6 border border-outline-variant/20 shadow-sm animate-fade-in min-h-[500px]">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-2xl">lightbulb</span>
                        <h3 className="text-lg font-bold text-on-surface">기초 아이디어 입력</h3>
                    </div>
                </div>
                
                {/* 투트랙 탭 토글 */}
                <div className="inline-flex bg-surface-container p-1 rounded-xl shadow-inner self-start">
                   <button 
                     onClick={() => setIdeaMode('guide')}
                     className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${ideaMode === 'guide' ? 'bg-primary text-white shadow-md' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                   >
                      <span className="material-symbols-outlined text-[16px]">integration_instructions</span>
                      가이드 입력 모드
                   </button>
                   <button 
                     onClick={() => setIdeaMode('free')}
                     className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${ideaMode === 'free' ? 'bg-primary text-white shadow-md' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                   >
                      <span className="material-symbols-outlined text-[16px]">edit_document</span>
                      자유 입력 모드
                   </button>
                </div>
                
                <p className="text-xs text-outline mb-2">
                    <span className="text-primary font-medium">선택된 AI 모델({props.selectedModel})과 Google 웹 검색이 연동되어</span> 최신 정보 기반의 체계적인 사업계획서 기본 틀(Master Brief)로 탈바꿈해 드립니다.
                </p>

                {/* 입력 폼 영역 */}
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                   {ideaMode === 'guide' ? (
                      <div className="space-y-4">
                         <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-on-surface">1. 아이템 한 줄 요약 <span className="text-error">*</span></label>
                            <textarea value={guideAnswers.q1} onChange={(e) => setGuideAnswers(p => ({...p, q1: e.target.value}))} disabled={isEnhancing} placeholder="예: AI 기반 중고거래 사기 방지 앱" className="min-h-[50px] bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-on-surface">2. 해결하려는 문제점</label>
                            <textarea value={guideAnswers.q2} onChange={(e) => setGuideAnswers(p => ({...p, q2: e.target.value}))} disabled={isEnhancing} placeholder="예: 중고나라나 당근마켓에서 일어나는 사기로 인한 금전적 피해 완화" className="min-h-[70px] bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3 text-sm resize-y focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-on-surface">3. 핵심 기술 및 차별성</label>
                            <textarea value={guideAnswers.q3} onChange={(e) => setGuideAnswers(p => ({...p, q3: e.target.value}))} disabled={isEnhancing} placeholder="예: 실시간 계좌 검증 및 대화 내역 NLP 분석" className="min-h-[70px] bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3 text-sm resize-y focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-on-surface">4. 타겟 고객 및 시장</label>
                            <textarea value={guideAnswers.q4} onChange={(e) => setGuideAnswers(p => ({...p, q4: e.target.value}))} disabled={isEnhancing} placeholder="예: 20~30대 1인 가구, 월 1회 이상 중고거래 이용자" className="min-h-[70px] bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3 text-sm resize-y focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40" />
                         </div>
                         <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-on-surface">5. 기대 효과</label>
                            <textarea value={guideAnswers.q5} onChange={(e) => setGuideAnswers(p => ({...p, q5: e.target.value}))} disabled={isEnhancing} placeholder="예: 연간 사기 피해액 30% 감소, 안전한 P2P 거래 문화 확산" className="min-h-[70px] bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3 text-sm resize-y focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40" />
                         </div>
                      </div>
                   ) : (
                      <textarea 
                          value={ideaText}
                          onChange={(e) => setIdeaText(e.target.value)}
                          placeholder="생각나시는 사업 아이템, 타겟 고객, 해결하려는 문제점 등을 자유롭게 구서나 복사해서 붙여넣어 주세요."
                          className="flex-1 w-full h-full min-h-[250px] bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40 leading-relaxed"
                          disabled={isEnhancing}
                      />
                   )}
                </div>

                <button 
                    onClick={async () => {
                        let finalPrompt = '';
                        if (ideaMode === 'guide') {
                           if (!guideAnswers.q1.trim()) return alert("1번 '아이템 한 줄 요약'은 필수입니다.");
                           finalPrompt = `1. 아이템 한 줄 요약: ${guideAnswers.q1.trim()}
2. 해결하려는 문제점: ${guideAnswers.q2.trim()}
3. 핵심 기술 및 차별성: ${guideAnswers.q3.trim()}
4. 타겟 고객 및 시장: ${guideAnswers.q4.trim()}
5. 기대 효과: ${guideAnswers.q5.trim()}`;
                        } else {
                           if (!ideaText.trim()) return alert("자유 입력 모드에 내용을 입력해주세요.");
                           finalPrompt = ideaText.trim();
                        }

                        if (!props.documentId) return alert("프로젝트가 저장되지 않았습니다. 문서 구조 분석을 먼저 저장해주세요.");
                        
                        try {
                            const initialIdeaJsonToSave = JSON.stringify({
                                mode: ideaMode,
                                guideAnswers,
                                ideaText
                            });
                            
                            let currentMasterBrief = masterBrief;
                            if (masterBriefData) currentMasterBrief = JSON.stringify(masterBriefData);
                            
                            // 자동 저장 처리 (응답 지연을 방지하기 위해 await 하지 않거나 따로 처리)
                            api.saveMasterBrief(props.documentId, currentMasterBrief, initialIdeaJsonToSave).catch(e => console.error("Auto-save failed", e));
                            
                            if (props.onEnhanceStateChange) props.onEnhanceStateChange(true, "최신 웹 검색을 통해 시장 조사를 진행하는 중입니다...");
                            setIsEnhancing(true);
                            const res = await api.enhanceIdeaStream(props.documentId, finalPrompt, props.selectedModel, (msg) => {
                                if (props.onEnhanceStateChange) props.onEnhanceStateChange(true, msg);
                            });
                            
                            if (res && res.master_brief) {
                                if (typeof res.master_brief === 'object' && res.master_brief !== null) {
                                    setMasterBriefData(res.master_brief);
                                    setMasterBrief('');
                                } else {
                                    setMasterBrief(res.master_brief);
                                    setMasterBriefData(null);
                                }
                            }
                        } catch (err) {
                            alert("고도화 실패: " + err);
                        } finally {
                            setIsEnhancing(false);
                            if (props.onEnhanceStateChange) props.onEnhanceStateChange(false);
                        }
                    }}
                    disabled={isEnhancing || (ideaMode === 'guide' ? !guideAnswers.q1.trim() : !ideaText.trim())}
                    className="mt-4 w-full py-4 bg-primary text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-primary/90 disabled:opacity-50 disabled:hover:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                    {isEnhancing ? (
                        <div className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-xl animate-spin">refresh</span>
                            <span>AI가 아이디어를 고도화하는 중...</span>
                        </div>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-xl">auto_awesome</span>
                            ✨ 전문가 수준으로 아이디어 고도화하기
                        </>
                    )}
                </button>
            </div>

            {/* 오른쪽: 결과 및 에디터 */}
            <div className={`flex-[1.2] flex flex-col gap-4 bg-surface rounded-2xl p-6 border shadow-sm transition-all duration-500 delay-100 min-h-[500px] ${(masterBrief || masterBriefData) ? 'border-primary/40 ring-4 ring-primary/5 bg-primary/5' : 'border-outline-variant/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary text-2xl">description</span>
                    <h3 className="text-lg font-bold text-on-surface">Master Brief (마스터 브리프)</h3>
                </div>
                {(masterBrief || masterBriefData) ? (
                    <>
                        <div className="flex justify-between items-end mb-2">
                           <p className="text-xs text-outline font-medium">✨ AI가 아이디어를 분석하고 보강했습니다. (블록별로 내용을 직접 다듬을 수 있습니다)</p>
                        </div>
                        
                        {masterBriefData ? (
                            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar mb-2">
                               <div className="bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-4 shadow-sm transition-colors group/block relative">
                                  <label className="text-sm font-black text-primary mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">stars</span> 1. 핵심 컨셉 (요약)</label>
                                  <AutoResizeTextarea value={masterBriefData.core_concept || ''} onChange={(e) => setMasterBriefData({...masterBriefData, core_concept: e.target.value})} />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover/block:opacity-100 transition-opacity text-[10px] font-bold text-outline-variant"><span className="material-symbols-outlined text-[14px]">edit</span></div>
                               </div>
                               <div className="bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-4 shadow-sm transition-colors group/block relative">
                                  <label className="text-sm font-black text-primary mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">healing</span> 2. 해결하려는 문제 (Pain-point)</label>
                                  <AutoResizeTextarea value={masterBriefData.problem_statement || ''} onChange={(e) => setMasterBriefData({...masterBriefData, problem_statement: e.target.value})} />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover/block:opacity-100 transition-opacity text-[10px] font-bold text-outline-variant"><span className="material-symbols-outlined text-[14px]">edit</span></div>
                               </div>
                               <div className="bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-4 shadow-sm transition-colors group/block relative">
                                  <label className="text-sm font-black text-primary mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">lightbulb_circle</span> 3. 코어 솔루션 및 차별화 기술</label>
                                  <AutoResizeTextarea value={masterBriefData.solution_and_tech || ''} onChange={(e) => setMasterBriefData({...masterBriefData, solution_and_tech: e.target.value})} />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover/block:opacity-100 transition-opacity text-[10px] font-bold text-outline-variant"><span className="material-symbols-outlined text-[14px]">edit</span></div>
                               </div>
                               <div className="bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-4 shadow-sm transition-colors group/block relative">
                                  <label className="text-sm font-black text-primary mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">groups</span> 4. 타겟 시장 및 고객 분석</label>
                                  <AutoResizeTextarea value={masterBriefData.target_market || ''} onChange={(e) => setMasterBriefData({...masterBriefData, target_market: e.target.value})} />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover/block:opacity-100 transition-opacity text-[10px] font-bold text-outline-variant"><span className="material-symbols-outlined text-[14px]">edit</span></div>
                               </div>
                               <div className="bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-4 shadow-sm transition-colors group/block relative">
                                  <label className="text-sm font-black text-primary mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">trending_up</span> 5. 정량·정성적 기대 효과</label>
                                  <AutoResizeTextarea value={masterBriefData.expected_effect || ''} onChange={(e) => setMasterBriefData({...masterBriefData, expected_effect: e.target.value})} />
                                  <div className="absolute top-3 right-3 opacity-0 group-hover/block:opacity-100 transition-opacity text-[10px] font-bold text-outline-variant"><span className="material-symbols-outlined text-[14px]">edit</span></div>
                               </div>
                            </div>
                        ) : (
                            <div className="relative flex-1 group/editor mb-2">
                               <textarea 
                                   value={masterBrief}
                                   onChange={(e) => setMasterBrief(e.target.value)}
                                   className="absolute inset-0 w-full h-full bg-surface-container-lowest border border-primary/20 hover:border-primary/50 rounded-xl p-5 text-sm resize-none focus:ring-2 focus:ring-primary/30 outline-none font-mono leading-[1.8] text-on-surface shadow-inner transition-colors custom-scrollbar"
                                   placeholder="여기에 마스터 브리프가 생성됩니다..."
                               />
                               <div className="absolute top-3 right-3 opacity-0 group-hover/editor:opacity-100 transition-opacity bg-surface border border-outline-variant/20 px-2.5 py-1 rounded shadow-sm text-[10px] font-bold text-outline-variant flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                                  수정 모드
                               </div>
                            </div>
                        )}

                        <button 
                            onClick={async () => {
                                if (!props.documentId) return;
                                
                                let finalMasterBriefToSave = masterBrief;
                                
                                if (masterBriefData) {
                                    // 기존과 달리 마크다운으로 강제 변환하지 않고, 그대로 JSON String으로 저장합니다
                                    // 이렇게 해야 나중에 로드할 때 "불록 형태"가 유지됩니다
                                    finalMasterBriefToSave = JSON.stringify(masterBriefData);
                                }
                                
                                const initialIdeaJsonToSave = JSON.stringify({
                                    mode: ideaMode,
                                    guideAnswers,
                                    ideaText
                                });
                                
                                try {
                                    await api.saveMasterBrief(props.documentId, finalMasterBriefToSave, initialIdeaJsonToSave);
                                    
                                    // 성공 후 JSON 블록 모드를 풀지 않고 그대로 유지하여 UX 연속성 제공
                                    
                                    handleStepCompletion(2);
                                    
                                    // 스크롤 이동 (선택적) 또는 자동 열기
                                    setTimeout(() => toggleStep(3), 300);
                                } catch(err) {
                                    alert("저장 실패: " + err);
                                }
                            }}
                            className="w-full py-4 bg-secondary text-on-secondary font-black text-sm rounded-xl shadow-[0_8px_16px_-4px_rgba(56,107,245,0.3)] hover:shadow-[0_12px_24px_-4px_rgba(56,107,245,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center justify-center gap-2 transition-all mt-auto shrink-0"
                        >
                            <span className="material-symbols-outlined text-xl">save</span>
                            💾 이 아이디어로 확정 및 저장
                        </button>
                    </>
                ) : (
                    <div className="flex-1 w-full h-full bg-surface-container-lowest border border-outline-variant/30 border-dashed rounded-xl flex items-center justify-center p-8 text-center shadow-inner">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center">
                               <span className="material-symbols-outlined text-3xl opacity-40">arrow_left_alt</span>
                            </div>
                            <p className="text-sm font-bold text-outline">
                                좌측에 아이디어를 입력하고 생성 버튼을 누르면<br/>이곳에 상세한 <span className="text-primary font-black">마스터 브리프</span>가 작성됩니다.
                            </p>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </AccordionSection>

        {/* Step 3: 데이터 수집 및 초안 작성 */}
        <AccordionSection 
           number={3}
           title="데이터 수집 및 초안 작성"
           isOpen={activeStep === 3}
           isCompleted={completedSteps.includes(3)}
           onToggle={() => toggleStep(3)}
           isDisabled={isStepDisabled(3)}
        >
          <div className="flex flex-col bg-surface-container-lowest/50 min-h-[400px]">
             {/* 헤더 안내문 */}
             <div className="p-6 border-b border-outline-variant/10">
                 <h4 className="text-base font-bold text-on-surface flex items-center gap-2">
                     <span className="material-symbols-outlined text-primary">auto_stories</span>
                     NotebookLM 기반 팩트 수집 및 초안 생성
                 </h4>
                 <p className="text-xs text-outline leading-relaxed mt-1">
                     실시간 검색 데이터와 마스터 브리프를 조합하여 목차별 근거 중심 초안을 생성합니다.
                 </p>
             </div>

             {/* 메인 컨텐츠 영역 */}
             <div className="flex-1 flex flex-col">
                {draftTree.length === 0 && !isGeneratingDraft ? (
                   /* 초기 상태: 시작 버튼 */
                   <div className="flex-1 flex flex-col items-center justify-center p-12 gap-8">
                      <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center relative">
                         <span className="material-symbols-outlined text-4xl text-primary opacity-60">database</span>
                         <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping"></div>
                      </div>
                      
                      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                         <h5 className="font-bold text-on-surface">리서치 모드를 선택하세요</h5>
                         
                         <div className="grid grid-cols-2 gap-3 w-full p-2 bg-surface-container rounded-2xl border border-outline-variant/10">
                            <button 
                               onClick={() => setResearchMode('fast')}
                               className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${researchMode === 'fast' ? 'bg-white shadow-md border-primary/20 border ring-2 ring-primary/10' : 'hover:bg-surface-container-high opacity-60'}`}
                            >
                               <span className={`material-symbols-outlined text-2xl ${researchMode === 'fast' ? 'text-primary' : 'text-outline'}`}>bolt</span>
                               <div className="text-center">
                                  <div className={`text-xs font-black ${researchMode === 'fast' ? 'text-primary' : 'text-on-surface'}`}>FAST</div>
                                  <div className="text-[10px] text-outline mt-0.5">속도 중시 (~2분)</div>
                               </div>
                            </button>
                            <button 
                               onClick={() => setResearchMode('deep')}
                               className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${researchMode === 'deep' ? 'bg-white shadow-md border-primary/20 border ring-2 ring-primary/10' : 'hover:bg-surface-container-high opacity-60'}`}
                            >
                               <span className={`material-symbols-outlined text-2xl ${researchMode === 'deep' ? 'text-primary' : 'text-outline'}`}>search_insights</span>
                               <div className="text-center">
                                  <div className={`text-xs font-black ${researchMode === 'deep' ? 'text-primary' : 'text-on-surface'}`}>DEEP</div>
                                  <div className="text-[10px] text-outline mt-0.5">품질 중시 (~7분)</div>
                               </div>
                            </button>
                         </div>
                      </div>

                      <div className="text-center">
                         <p className="text-xs text-outline mt-1 italic">선택한 모드로 팩트 수집 및 초안 작성을 시작합니다.</p>
                      </div>
                      
                      <button 
                          onClick={handleGenerateDraft}
                          className="px-10 py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-[0_8px_20px_-4px_rgba(56,107,245,0.4)] hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-2"
                      >
                         <span className="material-symbols-outlined text-xl">magic_button</span>
                         ✨ {researchMode === 'deep' ? 'DEEP' : 'FAST'} 초안 생성 시작
                      </button>
                   </div>
                ) : isGeneratingDraft ? (
                   /* 생성 중 상태: 모던한 로딩 UI */
                   <div className="flex-1 flex flex-col items-center justify-center p-12 gap-6 bg-surface-container-lowest/30">
                      <div className="relative">
                         <div className="w-24 h-24 rounded-full border-4 border-primary/10 border-t-primary animate-spin"></div>
                         <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl text-primary animate-pulse">
                               {researchMode === 'deep' ? 'search_insights' : 'bolt'}
                            </span>
                         </div>
                      </div>
                      
                      <div className="text-center space-y-2">
                         <div className="flex items-center justify-center gap-2">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black rounded-full uppercase tracking-wider">
                               {researchMode} Mode Active
                            </span>
                         </div>
                         <h5 className="font-bold text-on-surface">AI가 초안을 작성하고 있습니다</h5>
                         <p className="text-xs text-outline max-w-xs mx-auto leading-relaxed">
                            실시간 리서치 데이터를 분석하여 각 섹션별 최적의 내용을 구성 중입니다. 잠시만 기다려 주세요.
                         </p>
                      </div>

                      <div className="w-full max-w-md space-y-3">
                         <div className="flex justify-between items-end px-1">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-tight">Status</span>
                            <span className="text-[10px] font-medium text-outline">
                               {draftLogs.length > 0 ? draftLogs[draftLogs.length - 1].replace('> ', '') : '초기화 중...'}
                            </span>
                         </div>
                         <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                            <div className="h-full bg-primary animate-[shimmer_2s_infinite] w-full origin-left shadow-[0_0_10px_rgba(56,107,245,0.4)]"></div>
                         </div>
                      </div>
                   </div>
                ) : (
                   /* 완료 상태: 스플릿 뷰 에디터 */
                   <div className="flex flex-col md:flex-row flex-1 min-h-[500px]">
                      {/* 좌측: 목차 트리 */}
                      <div className="w-full md:w-64 border-r border-outline-variant/10 bg-surface-container-low/30 overflow-y-auto">
                         <div className="p-4 border-b border-outline-variant/5 bg-surface-container-high/20">
                            <span className="text-[10px] font-black text-outline uppercase tracking-wider">목차 네비게이션</span>
                         </div>
                         <nav className="p-2 flex flex-col gap-1">
                            { (function renderToC(nodes: DocumentNode[], depth = 0) {
                               return nodes.map(node => (
                                  <React.Fragment key={node.id}>
                                     <button
                                        onClick={() => setSelectedNodeId(node.id)}
                                        className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-center gap-2 group
                                           ${selectedNodeId === node.id ? 'bg-primary text-white font-bold shadow-md' : 'hover:bg-surface-container-high text-on-surface/70'}
                                           ${node.draft_content ? 'opacity-100' : 'opacity-40'}
                                        `}
                                        style={{ paddingLeft: `${depth * 12 + 10}px` }}
                                     >
                                        <span className={`material-symbols-outlined text-[16px] ${selectedNodeId === node.id ? 'text-white' : 'text-primary/40'}`}>
                                           {node.children && node.children.length > 0 ? 'folder' : 'description'}
                                        </span>
                                        <span className="truncate">{node.title}</span>
                                        {node.draft_content && selectedNodeId !== node.id && (
                                           <span className="ml-auto w-1.5 h-1.5 rounded-full bg-success ring-2 ring-success/20"></span>
                                        )}
                                     </button>
                                     {node.children && renderToC(node.children, depth + 1)}
                                  </React.Fragment>
                               ));
                            })(draftTree)}
                         </nav>
                      </div>

                      {/* 우측: 에디터 영역 */}
                      <div className="flex-1 flex flex-col bg-white">
                         {selectedNode ? (
                            <>
                               <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
                                  <div className="flex items-center gap-2">
                                     <span className="text-sm font-black text-on-surface">{selectedNode.title}</span>
                                     <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-bold uppercase">Section Draft</span>
                                  </div>
                                  <div className="flex bg-surface-container-high p-0.5 rounded-lg border border-outline-variant/10">
                                     <button 
                                        onClick={() => setActiveTab('preview')}
                                        className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${activeTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                     >미리보기</button>
                                     <button 
                                        onClick={() => setActiveTab('edit')}
                                        className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${activeTab === 'edit' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                     >편집</button>
                                  </div>
                               </div>
                               
                               <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                  {activeTab === 'edit' ? (
                                     <textarea
                                        value={selectedNode.draft_content || ''}
                                        onChange={(e) => setDraftTree(prev => findAndUpdateNode(prev, selectedNode.id, e.target.value))}
                                        className="w-full h-full min-h-[400px] text-sm leading-[1.8] text-on-surface outline-none font-mono resize-none bg-transparent"
                                        placeholder="이 섹션의 내용을 입력하세요..."
                                     />
                                  ) : (
                                     <div className="prose prose-sm max-w-none text-on-surface leading-loose">
                                        <div className="whitespace-pre-wrap font-sans text-xs bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/10 italic text-outline/80 mb-6 font-medium">
                                            💡 초안은 AI에 의해 생성되었으므로, 반드시 내용을 검토하고 실정에 맞게 수정하시기 바랍니다.
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{selectedNode.draft_content || '내용이 없습니다.'}</div>
                                     </div>
                                  )}
                               </div>
                            </>
                         ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
                               <span className="material-symbols-outlined text-5xl mb-3 text-primary">format_list_bulleted</span>
                               <p className="text-sm font-bold text-on-surface">좌측 목차를 선택하여<br/>작성된 초안을 확인하고 수정하세요.</p>
                            </div>
                         )}
                      </div>
                   </div>
                )}
             </div>

             {/* 하단 툴바 */}
             {draftTree.length > 0 && !isGeneratingDraft && (
                <div className="p-4 bg-surface-container-high border-t border-outline-variant/10 flex items-center justify-between">
                   <div className="flex items-center gap-2 text-[10px] text-outline font-bold">
                      <span className="material-symbols-outlined text-sm">info</span>
                      수정 사항은 브라우저 세션에 임시 보관 중입니다.
                   </div>
                   <button 
                       onClick={async () => {
                           if (!props.documentId) return;
                           try {
                               const { selectedIds, contentIds } = treeRef.current?.getSelectedIds() || { selectedIds: [], contentIds: [] };
                               await api.saveProject(props.documentId, props.fileName || 'Unknown', selectedIds, contentIds, draftTree);
                               handleStepCompletion(3);
                               setTimeout(() => toggleStep(4), 300);
                           } catch(err) {
                               alert("저장 실패: " + err);
                           }
                       }}
                       className="px-6 py-2.5 bg-secondary text-on-secondary text-sm font-black rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                   >
                      <span className="material-symbols-outlined text-lg">check_circle</span>
                      💾 초안 확정 및 저장 후 다음 단계로
                   </button>
                </div>
             )}
          </div>
        </AccordionSection>

        {/* Step 4: 사업계획서 고도화 및 파일 생성 */}
        <AccordionSection 
           number={4}
           title="사업계획서 고도화 및 파일 생성"
           isOpen={activeStep === 4}
           isCompleted={completedSteps.includes(4)}
           onToggle={() => toggleStep(4)}
           isDisabled={isStepDisabled(4)}
        >
          <div className="p-6 md:p-8 flex flex-col gap-6 bg-surface-container-lowest/50">
             <div className="flex flex-col gap-2">
                 <h4 className="text-base font-bold text-on-surface flex items-center gap-2">
                     <span className="material-symbols-outlined text-tertiary">edit_document</span>
                     설득력 강화 및 최종 HWPX 포맷팅
                 </h4>
                 <p className="text-sm text-outline leading-relaxed break-keep">
                     NotebookLM이 정리한 초안과 근거 데이터를 Gemini를 활용하여 정부지원사업 심사위원들을 설득할 수 있는 고품질의 비즈니스 문장으로 윤문하고 최종 HWPX 파일을 변환 및 생성합니다.
                 </p>
             </div>

             {!finalProposal ? (
                 <div className="flex flex-col items-center justify-center py-10 gap-4 border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest shadow-inner">
                     <div className="w-16 h-16 bg-tertiary/5 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-3xl text-tertiary opacity-60">rocket_launch</span>
                     </div>
                     <button 
                         onClick={() => {
                             setIsEnhancingProposal(true);
                             // 임시 모의 로직 (2.5초 후 완료)
                             setTimeout(() => {
                                 setIsEnhancingProposal(false);
                                 setFinalProposal("1. 사업 개요 및 요약\\n본 과제는 '글로벌 초격차 기술을 선도하는...'\\n\\n(💡 제안서 양식에 맞추어 전문적인 어조로 윤문된 최종 텍스트 결과가 표시됩니다.)");
                                 handleStepCompletion(4);
                             }, 2500);
                         }}
                         disabled={isEnhancingProposal}
                         className="px-8 py-3.5 bg-tertiary text-on-tertiary text-sm font-black rounded-xl shadow-[0_8px_16px_-4px_rgba(155,107,245,0.3)] hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
                     >
                         {isEnhancingProposal ? (
                             <><span className="material-symbols-outlined text-xl animate-spin">refresh</span> 고도화 및 문서 생성 중...</>
                         ) : (
                             <><span className="material-symbols-outlined text-xl">rocket_launch</span> 🚀 최종 사업계획서 고도화 시작</>
                         )}
                     </button>
                 </div>
             ) : (
                 <div className="flex flex-col gap-6 animate-fade-in">
                     <div className="bg-surface border border-tertiary/20 rounded-xl p-5 shadow-sm ring-1 ring-tertiary/5">
                         <div className="text-sm font-black text-tertiary flex items-center gap-2 mb-4">
                             <span className="material-symbols-outlined text-[16px]">task_alt</span> 최종 고도화 텍스트
                         </div>
                         <textarea 
                             readOnly 
                             value={finalProposal} 
                             className="w-full min-h-[200px] bg-surface-container-lowest rounded-lg border border-outline-variant/10 p-4 text-sm resize-none outline-none font-mono text-on-surface leading-[1.8] custom-scrollbar"
                         />
                     </div>
                     
                     <div className="flex justify-end pt-2 border-t border-outline-variant/10">
                         <button className="px-6 py-3.5 bg-primary text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg hover:bg-primary/95 flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0 text-center w-full md:w-auto justify-center">
                             <span className="material-symbols-outlined text-xl">download</span>
                             최종 파일(HWPX) 다운로드
                         </button>
                     </div>
                 </div>
             )}
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

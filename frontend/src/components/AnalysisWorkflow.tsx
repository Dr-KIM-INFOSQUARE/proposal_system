import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { api } from '../services/api';
import { DocumentTree } from './DocumentTree';
import { ErrorRetryModal } from './ErrorRetryModal';
import { HwpxFormatModal } from './HwpxFormatModal';
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

interface MarkdownContentProps {
  content: string;
  className?: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className }) => {
  // \n 문자열이나 <br> 태그를 처리합니다. 중복된(2개 이상) 줄바꿈은 하나로 통일하여 정규화합니다.
  const processedContent = (content || '내용이 없습니다.')
    .replace(/\\n/g, '<br />')
    .replace(/(<br\s*\/?>\s*){2,}/gi, '<br />');
  
  return (
    <div className={`prose prose-sm max-w-none text-on-surface leading-[2] prose-headings:text-primary prose-a:text-primary prose-strong:text-primary-800 prose-p:mb-6 ${className || ''}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-xl font-black text-primary mt-8 mb-4 border-b pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-lg font-bold text-primary mt-6 mb-3" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-base font-bold text-on-surface mt-4 mb-2" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 mb-6 space-y-2 marker:text-primary/50" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 mb-6 space-y-2 marker:text-primary/50" {...props} />,
          li: ({node, ...props}) => <li className="pl-1 text-on-surface/90" {...props} />,
          p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
          strong: ({node, ...props}) => <strong className="font-black text-primary-800 bg-primary/5 px-1 rounded" {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-6 shadow-sm rounded-lg border border-outline-variant/40"><table className="min-w-full divide-y divide-outline-variant/40" {...props} /></div>,
          th: ({node, ...props}) => <th className="bg-surface-container-high px-4 py-3 text-left text-xs font-bold text-primary uppercase tracking-wider whitespace-pre-wrap border-outline-variant/40" {...props} />,
          td: ({node, ...props}) => {
            // 표 내부의 "*" 또는 "-" 글머리 기호를 처리하기 위한 커스텀 렌더러
            const renderCellContent = (children: React.ReactNode): React.ReactNode => {
              return React.Children.map(children, child => {
                if (typeof child === 'string') {
                  const lines = child.split(/(<br\s*\/?>)/gi);
                  return lines.map((line, idx) => {
                    if (line.match(/<br\s*\/?>/i)) return <br key={idx} />;
                    
                    const trimmedLine = line.trim();
                    // * 또는 - 로 시작하는 행을 글머리 기호로 인식
                    const isBullet = trimmedLine.startsWith('*') || trimmedLine.startsWith('-');
                    
                    if (isBullet) {
                      // 실제 기호 뒷부분만 추출
                      const contentText = trimmedLine.substring(1).trim();
                      return (
                        <span key={idx} className="flex items-start gap-2 my-0.5 ml-1">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-primary/50 shrink-0" />
                          <span className="flex-1 leading-normal text-on-surface/90">
                            {contentText}
                          </span>
                        </span>
                      );
                    }
                    return line;
                  });
                }
                if (React.isValidElement(child)) {
                  const element = child as React.ReactElement<{children?: React.ReactNode}>;
                  if (element.props.children) {
                    return React.cloneElement(element, {
                      children: renderCellContent(element.props.children)
                    } as any);
                  }
                }
                return child;
              });
            };

            return (
              <td className="px-4 py-3 text-xs border-t border-outline-variant/30 text-on-surface whitespace-pre-wrap align-top">
                {renderCellContent(props.children)}
              </td>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
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
  
  const [isHwpxModalOpen, setIsHwpxModalOpen] = useState<boolean>(false);

  const handleOpenHwpxModal = async () => {
    if (!props.documentId) return;
    try {
      const { selectedIds, contentIds } = treeRef.current?.getSelectedIds() || { selectedIds: [], contentIds: [] };
      await api.saveProject(props.documentId, props.fileName || "Untitled", props.fileName || "Unknown File", selectedIds, contentIds, draftTree);
      setIsHwpxModalOpen(true);
    } catch(err) {
      alert("문서 저장 중 오류가 발생했습니다: " + err);
    }
  };

  const handleGenerateHwpx = async (styleConfig: any) => {
    if (!props.documentId) return;
    try {
      const data = await api.generateHwpx(props.documentId, styleConfig);
      if (data.status === 'success' && data.download_url) {
          window.location.href = data.download_url;
      } else {
          alert("HWPX 생성 실패: " + (data.detail || "알 수 없는 오류"));
      }
    } catch (error) {
      alert("HWPX 생성 중 오류: " + error);
      throw error;
    }
  };

  const [ideaMode, setIdeaMode] = useState<'guide' | 'free'>('guide');
  const [guideAnswers, setGuideAnswers] = useState({
    q1: '', q2: '', q3: '', q4: '', q5: ''
  });
  const [ideaText, setIdeaText] = useState('');
  const [masterBrief, setMasterBrief] = useState('');
  const [masterBriefData, setMasterBriefData] = useState<any>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  // 진행 상태 창 재시작 모달 (AnalysisWorkflow 내 독립적 관리)
  const [retryModalConfig, setRetryModalConfig] = useState<{
    isOpen: boolean;
    modelName: string;
    resolve?: (retry: boolean) => void;
  } | null>(null);
  
  // Step 3 UI States
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftLogs, setDraftLogs] = useState<string[]>([]);
  const [draftTree, setDraftTree] = useState<DocumentNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const [researchMode, setResearchMode] = useState<'fast' | 'deep'>('deep');
  const [hwpxEngine, setHwpxEngine] = useState<'lxml' | 'pyhwpx'>('lxml');

  // Step 2 UI States for tabs
  const [activeIdeaTab, setActiveIdeaTab] = useState<'edit' | 'preview'>('edit');
  const [activeMasterBriefTab, setActiveMasterBriefTab] = useState<'edit' | 'preview'>('preview');

  // 초안 생성 실행 (SSE)
  const handleGenerateDraft = async () => {
    if (!props.documentId) {
      alert("프로젝트가 아직 저장되지 않았거나 ID를 찾을 수 없습니다. 다시 시도하거나 프로젝트를 저장해 주세요.");
      return;
    }
    
    const docId = props.documentId;
    const modelToUse = props.selectedModel;
    const modeToUse = researchMode;
    let success = false;
    
    console.log("[Workflow] Starting draft generation. Mode:", modeToUse);
    setIsGeneratingDraft(true);
    
    // 자동 저장: 사용자가 선택한 노드 및 콘텐츠 구조를 DB에 확실히 저장
    if (treeRef.current) {
        try {
            const { selectedIds, contentIds } = treeRef.current.getSelectedIds();
            await api.saveProject(
                docId, 
                props.fileName?.split('.')[0] || 'Draft', 
                props.fileName || 'document.hwpx', 
                selectedIds, 
                contentIds
            );
            console.log("[Workflow] Auto-saved tree selection before draft generation.");
            // UI 상태와의 동기화를 위해 부모에도 컴파일된 선택 데이터를 전달
            props.onSave(selectedIds, contentIds);
        } catch (e) {
            console.error("[Workflow] Failed to auto-save tree selection:", e);
        }
    }
    
    while (!success) {
      try {
        setDraftTree([]); // 루프 돌 때마다 초기화
        if (props.onEnhanceStateChange) {
            props.onEnhanceStateChange(true, "초안 생성 초기화 중...");
        }

        const finalTree = await api.generateDraftStream(
          docId, 
          modelToUse,
          modeToUse,
          hwpxEngine,
          (msg) => {
            if (props.onEnhanceStateChange) {
                props.onEnhanceStateChange(true, msg);
            }
            // 너무 많은 로그가 누적되지 않게 할 수도 있지만 일반적인 로깅 목적으로 추가
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
          success = true;
        }
      } catch (err) {
        console.error("[Workflow] Draft generation failed:", err);
        const modelName = modelToUse.split('/').pop() || modelToUse;
        
        if (props.onEnhanceStateChange) {
            props.onEnhanceStateChange(false);
        }
        
        const retryDecision = await new Promise<boolean>((resolve) => {
          setRetryModalConfig({ isOpen: true, modelName, resolve });
        });
        
        setRetryModalConfig(null);
        
        if (!retryDecision) {
          setDraftLogs(prev => [...prev, `> [오류] 재시작 취소됨`]);
          break; // 취소
        } else {
          setDraftLogs(prev => [...prev, `> [재시도] 다시 시작 중...`]);
          // 다음 루프에서 `props.onEnhanceStateChange(true, "초안 생성 초기화 중...")` 가 다시 트리거 됨
        }
      }
    }
    
    setIsGeneratingDraft(false);
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
  
  // [추가] 최초 프로젝트 로드 시 마지막 단계 자동 열기 트리거
  const [autoOpenTriggered, setAutoOpenTriggered] = useState(false);

  // 트리가 입수되면 1단계를 자동으로 완료 처리
  useEffect(() => {
    if (props.initialTreeData.length > 0) {
      if (!completedSteps.includes(1)) {
        setCompletedSteps(prev => {
          if (prev.includes(1)) return prev;
          return [...prev, 1];
        });
      }
    } else {
      setCompletedSteps([]);
      if (props.hasSelectedFile || props.isAnalyzing) {
        setActiveStep(1);
      }
    }
  }, [props.initialTreeData]);
  
  // 기존 초안 데이터 복원 및 3단계 완료 처리
  useEffect(() => {
    if (props.initialTreeData.length > 0) {
      const hasDraft = (nodes: DocumentNode[]): boolean => {
        for (const node of nodes) {
          if (node.draft_content) return true;
          if (node.children && hasDraft(node.children)) return true;
        }
        return false;
      };

      if (hasDraft(props.initialTreeData)) {
        console.log("[Workflow] Existing draft content found. Restoring draftTree and marking step 3 complete.");
        setDraftTree(props.initialTreeData);
        
        setCompletedSteps(prev => {
          const newSteps = [...prev];
          [1, 2, 3].forEach(s => {
            if (!newSteps.includes(s)) newSteps.push(s);
          });
          return newSteps;
        });

        const firstDraftNode = findFirstContentNode(props.initialTreeData);
        if (firstDraftNode && !selectedNodeId) {
          setSelectedNodeId(firstDraftNode.id);
        }
      }
    }
  }, [props.initialTreeData]);

  // 마스터 브리프 초기화
  useEffect(() => {
    if (props.initialMasterBrief) {
      try {
        let cleanInitJson = props.initialMasterBrief.trim();
        if (cleanInitJson.startsWith('```json')) {
            cleanInitJson = cleanInitJson.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleanInitJson.startsWith('```')) {
            cleanInitJson = cleanInitJson.replace(/^```/, '').replace(/```$/, '').trim();
        }
        
        const parsed = JSON.parse(cleanInitJson);
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

  // [추가] 초기 로딩 완료 후 가장 마지막 완료 단계 열기
  useEffect(() => {
    if (props.documentId && !autoOpenTriggered && completedSteps.length > 0) {
      const lastStep = Math.max(...completedSteps);
      const nextStep = Math.min(lastStep + 1, 4);
      console.log(`[Workflow] Auto-opening next step: ${nextStep} (last was ${lastStep})`);
      setActiveStep(nextStep);
      setAutoOpenTriggered(true);
    }
  }, [props.documentId, completedSteps, autoOpenTriggered]);

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
            <div className="flex-1 flex flex-col gap-4 bg-surface rounded-2xl p-6 border border-outline-variant/20 shadow-sm animate-fade-in min-h-[500px]">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-2xl">lightbulb</span>
                        <h3 className="text-lg font-bold text-on-surface">기초 아이디어 입력</h3>
                    </div>
                </div>
                
                <div className="flex flex-col gap-2">
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
                   
                   {ideaMode === 'free' && (
                        <div className="flex bg-surface-container-low p-1 rounded-lg self-start border border-outline-variant/20 scale-90 origin-left">
                            <button 
                                onClick={() => setActiveIdeaTab('edit')}
                                className={`px-3 py-1 text-[11px] font-bold rounded flex items-center gap-1.5 transition-all ${activeIdeaTab === 'edit' ? 'bg-white text-primary shadow-sm' : 'text-outline'}`}
                            >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                편집
                            </button>
                            <button 
                                onClick={() => setActiveIdeaTab('preview')}
                                className={`px-3 py-1 text-[11px] font-bold rounded flex items-center gap-1.5 transition-all ${activeIdeaTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-outline'}`}
                            >
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                미리보기
                            </button>
                        </div>
                   )}
                </div>
                
                <p className="text-xs text-outline mb-2">
                    <span className="text-primary font-medium">선택된 AI 모델({props.selectedModel})과 Google 웹 검색이 연동되어</span> 최신 정보 기반의 체계적인 사업계획서 기본 틀(Master Brief)로 탈바꿈해 드립니다.
                </p>

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
                      activeIdeaTab === 'edit' ? (
                        <textarea 
                            value={ideaText}
                            onChange={(e) => setIdeaText(e.target.value)}
                            placeholder="생각나시는 사업 아이템, 타겟 고객, 해결하려는 문제점 등을 자유롭게 구서나 복사해서 붙여넣어 주세요."
                            className="flex-1 w-full h-full min-h-[250px] bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-outline/40 leading-relaxed custom-scrollbar"
                            disabled={isEnhancing}
                        />
                      ) : (
                        <div className="flex-1 w-full h-full min-h-[250px] bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-4 overflow-y-auto custom-scrollbar shadow-inner">
                           <MarkdownContent content={ideaText || '*입력된 내용이 없습니다.*'} />
                        </div>
                      )
                   )}
                </div>

                <button 
                    onClick={async () => {
                        let finalPrompt = '';
                        if (ideaMode === 'guide') {
                           if (!guideAnswers.q1.trim()) return alert("1번 '아이템 한 줄 요약'은 필수입니다.");
                           finalPrompt = `1. 아이템 한 줄 요약: ${guideAnswers.q1.trim()}\n2. 해결하려는 문제점: ${guideAnswers.q2.trim()}\n3. 핵심 기술 및 차별성: ${guideAnswers.q3.trim()}\n4. 타겟 고객 및 시장: ${guideAnswers.q4.trim()}\n5. 기대 효과: ${guideAnswers.q5.trim()}`;
                        } else {
                           if (!ideaText.trim()) return alert("자유 입력 모드에 내용을 입력해주세요.");
                           finalPrompt = ideaText.trim();
                        }

                        if (!props.documentId) return alert("프로젝트가 저장되지 않았습니다. 문서 구조 분석을 먼저 저장해주세요.");
                        
                        setIsEnhancing(true);
                        let success = false;
                        
                        while (!success) {
                          try {
                              const initialIdeaJsonToSave = JSON.stringify({
                                  mode: ideaMode,
                                  guideAnswers,
                                  ideaText
                              });
                              
                              let currentMasterBrief = masterBrief;
                              if (masterBriefData) currentMasterBrief = JSON.stringify(masterBriefData);
                              
                              api.saveMasterBrief(props.documentId, currentMasterBrief, initialIdeaJsonToSave).catch(e => console.error("Auto-save failed", e));
                              
                              if (props.onEnhanceStateChange) props.onEnhanceStateChange(true, "최신 웹 검색을 통해 시장 조사를 진행하는 중입니다...");
                              
                              const res = await api.enhanceIdeaStream(props.documentId, finalPrompt, props.selectedModel, (msg) => {
                                  if (props.onEnhanceStateChange) props.onEnhanceStateChange(true, msg);
                              });
                              
                              if (res && res.master_brief) {
                                  let parsedData = null;
                                  if (typeof res.master_brief === 'object' && res.master_brief !== null) {
                                      parsedData = res.master_brief;
                                  } else if (typeof res.master_brief === 'string') {
                                      try {
                                          // Remove potential markdown JSON code block markers before parsing
                                          let cleanJsonString = res.master_brief.trim();
                                          if (cleanJsonString.startsWith('```json')) {
                                              cleanJsonString = cleanJsonString.replace(/^```json/, '').replace(/```$/, '').trim();
                                          } else if (cleanJsonString.startsWith('```')) {
                                              cleanJsonString = cleanJsonString.replace(/^```/, '').replace(/```$/, '').trim();
                                          }
                                          
                                          const parsed = JSON.parse(cleanJsonString);
                                          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                              parsedData = parsed;
                                          }
                                      } catch(e) {
                                          // Fallback to treat as plain string
                                      }
                                  }

                                  if (parsedData) {
                                      setMasterBriefData(parsedData);
                                      setMasterBrief('');
                                  } else {
                                      setMasterBrief(res.master_brief);
                                      setMasterBriefData(null);
                                  }
                              }
                              success = true;
                          } catch (err) {
                              console.error("[Workflow] enhanceIdeaStream failed:", err);
                              const modelToUse = props.selectedModel;
                              const modelName = modelToUse.split('/').pop() || modelToUse;
                              
                              if (props.onEnhanceStateChange) {
                                  props.onEnhanceStateChange(false);
                              }
                              
                              const retryDecision = await new Promise<boolean>((resolve) => {
                                  setRetryModalConfig({ isOpen: true, modelName, resolve });
                              });
                              
                              setRetryModalConfig(null);
                              
                              if (!retryDecision) {
                                  break; // 취소
                              }
                              // 재시작 시 루프가 계속됨
                          }
                        }
                        
                        setIsEnhancing(false);
                        if (props.onEnhanceStateChange) props.onEnhanceStateChange(false);
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

            <div className={`flex-[1.2] flex flex-col gap-4 bg-surface rounded-2xl p-6 border shadow-sm transition-all duration-500 delay-100 min-h-[500px] ${(masterBrief || masterBriefData) ? 'border-primary/40 ring-4 ring-primary/5 bg-primary/5' : 'border-outline-variant/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary text-2xl">description</span>
                    <h3 className="text-lg font-bold text-on-surface">Master Brief (마스터 브리프)</h3>
                </div>
                {(masterBrief || masterBriefData) ? (
                    <>
                        <div className="flex justify-between items-center mb-2">
                           <p className="text-xs text-outline font-medium">✨ AI가 아이디어를 분석하고 보강했습니다. (직접 다듬을 수 있습니다)</p>
                           
                           <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/20 scale-90 origin-right">
                                <button 
                                    onClick={() => setActiveMasterBriefTab('edit')}
                                    className={`px-3 py-1 text-[11px] font-bold rounded flex items-center gap-1.5 transition-all ${activeMasterBriefTab === 'edit' ? 'bg-white text-primary shadow-sm' : 'text-outline'}`}
                                >
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                    편집
                                </button>
                                <button 
                                    onClick={() => setActiveMasterBriefTab('preview')}
                                    className={`px-3 py-1 text-[11px] font-bold rounded flex items-center gap-1.5 transition-all ${activeMasterBriefTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-outline'}`}
                                >
                                    <span className="material-symbols-outlined text-[14px]">visibility</span>
                                    미리보기
                                </button>
                            </div>
                        </div>
                        
                        {activeMasterBriefTab === 'preview' ? (
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-2 bg-surface-container-lowest border border-primary/20 rounded-xl p-6 shadow-inner">
                                <MarkdownContent content={masterBrief || (masterBriefData ? 
                                    `# 1. 핵심 컨셉\n${masterBriefData.core_concept || ''}\n\n# 2. 해결하려는 문제\n${masterBriefData.problem_statement || ''}\n\n# 3. 코어 솔루션\n${masterBriefData.solution_and_tech || ''}\n\n# 4. 타겟 시장\n${masterBriefData.target_market || ''}\n\n# 5. 기대 효과\n${masterBriefData.expected_effect || ''}` : '')} />
                            </div>
                        ) : masterBriefData ? (
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

                        <div className="flex flex-col gap-3 mt-auto shrink-0">
                            <button 
                                onClick={() => {
                                    if (window.confirm("현재 마스터 브리프를 삭제하고 아이디어를 다시 생성할까요?\n(수동으로 수정한 내용이 있다면 모두 손실됩니다.)")) {
                                        setMasterBriefData(null);
                                        setMasterBrief('');
                                        setCompletedSteps(prev => prev.filter(s => s !== 2));
                                    }
                                }}
                                className="w-full py-2.5 bg-outline-variant/10 hover:bg-error/10 text-outline hover:text-error font-bold text-[11px] rounded-xl border border-outline-variant/20 hover:border-error/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                                title="마스터 브리프를 초기화하고 왼쪽 입력란에서 다시 생성할 수 있도록 합니다."
                            >
                                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                아이디어 마스터 브리프 다시 생성 (초기화)
                            </button>
                            
                            <button 
                                onClick={async () => {
                                    if (!props.documentId) return;
                                    let finalMasterBriefToSave = masterBrief;
                                    if (masterBriefData) finalMasterBriefToSave = JSON.stringify(masterBriefData);
                                    const initialIdeaJsonToSave = JSON.stringify({ mode: ideaMode, guideAnswers, ideaText });
                                    try {
                                        await api.saveMasterBrief(props.documentId, finalMasterBriefToSave, initialIdeaJsonToSave);
                                        handleStepCompletion(2);
                                        setTimeout(() => toggleStep(3), 300);
                                    } catch(err) {
                                        alert("저장 실패: " + err);
                                    }
                                }}
                                className="w-full py-4 bg-secondary text-on-secondary font-black text-sm rounded-xl shadow-[0_8px_16px_-4px_rgba(56,107,245,0.3)] hover:shadow-[0_12px_24px_-4px_rgba(56,107,245,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-md flex items-center justify-center gap-2 transition-all shadow-lg"
                            >
                                <span className="material-symbols-outlined text-xl">save</span>
                                💾 이 아이디어로 확정 및 저장
                            </button>
                        </div>
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
             <div className="p-6 border-b border-outline-variant/10">
                 <h4 className="text-base font-bold text-on-surface flex items-center gap-2">
                     <span className="material-symbols-outlined text-primary">auto_stories</span>
                     NotebookLM 기반 팩트 수집 및 초안 생성
                 </h4>
                 <p className="text-xs text-outline leading-relaxed mt-1">
                     실시간 검색 데이터와 마스터 브리프를 조합하여 목차별 근거 중심 초안을 생성합니다.
                 </p>
             </div>

             <div className="flex-1 w-full">
                {draftTree.length === 0 && !isGeneratingDraft ? (
                   <div className="flex flex-col items-center justify-center p-12 gap-8 min-h-[400px]">
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
                   <div className="flex flex-col items-center justify-center p-12 gap-6 bg-surface-container-lowest/30 min-h-[400px]">
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
                   <div className="flex flex-col md:flex-row items-start gap-6 p-6 relative">
                      <div className="flex-1 min-w-0 bg-surface rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
                         <div className="p-4 border-b border-outline-variant/5 bg-surface-container-high/20">
                            <span className="text-xs font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                               <span className="material-symbols-outlined text-[18px] text-primary">account_tree</span>
                               목차 네비게이션
                            </span>
                         </div>
                         <nav className="p-3 flex flex-col gap-1.5 bg-white">
                            { (function renderToC(nodes: DocumentNode[], depth = 0) {
                                return nodes.map(node => (
                                   <React.Fragment key={node.id}>
                                      <button
                                         onClick={() => setSelectedNodeId(node.id)}
                                         className={`w-full text-left p-3 rounded-xl text-xs transition-all flex items-center gap-2 group
                                            ${selectedNodeId === node.id ? 'bg-primary text-white font-bold shadow-md ring-4 ring-primary/10' : 'hover:bg-surface-container-high text-on-surface/70'}
                                            ${node.draft_content ? 'opacity-100' : 'opacity-40'}
                                         `}
                                         style={{ paddingLeft: `${depth * 16 + 12}px` }}
                                      >
                                         <span className={`material-symbols-outlined text-[18px] ${selectedNodeId === node.id ? 'text-white' : 'text-primary/40'}`}>
                                            {node.children && node.children.length > 0 ? 'folder' : 'description'}
                                         </span>
                                         <span className="truncate">{node.title}</span>
                                         {node.draft_content && (
                                            <span className={`ml-auto flex items-center justify-center w-5 h-5 rounded-full ${selectedNodeId === node.id ? 'bg-white/20 text-white' : 'bg-green-100 text-green-600'} shadow-sm`}>
                                               <span className="material-symbols-outlined text-[14px] font-black">check</span>
                                            </span>
                                         )}
                                      </button>
                                      {node.children && renderToC(node.children, depth + 1)}
                                   </React.Fragment>
                                ));
                             })(draftTree)}
                         </nav>
                      </div>

                      <div className="w-full md:w-[600px] lg:w-[950px] sticky top-24 shrink-0 flex flex-col bg-white rounded-2xl border border-primary/20 shadow-2xl overflow-hidden z-20 animate-slide-up">
                         {selectedNode ? (
                            <>
                               <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between bg-primary/5">
                                  <div className="flex items-center gap-2 min-w-0">
                                     <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
                                     <span className="text-sm font-black text-on-surface truncate">{selectedNode.title}</span>
                                  </div>
                                  <div className="flex bg-surface-container-high p-1 rounded-xl border border-outline-variant/10 shrink-0">
                                     <button 
                                        onClick={() => setActiveTab('preview')}
                                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${activeTab === 'preview' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                     >미리보기</button>
                                     <button 
                                        onClick={() => setActiveTab('edit')}
                                        className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${activeTab === 'edit' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                     >편집</button>
                                  </div>
                               </div>
                               
                               <div className="h-[700px] overflow-y-auto p-8 custom-scrollbar bg-surface-container-lowest">
                                  {activeTab === 'edit' ? (
                                     <textarea
                                        value={selectedNode.draft_content || ''}
                                        onChange={(e) => setDraftTree(prev => findAndUpdateNode(prev, selectedNode.id, e.target.value))}
                                        className="w-full h-full min-h-[700px] text-sm leading-[2] text-on-surface outline-none font-mono resize-none bg-transparent"
                                        placeholder="이 섹션의 내용을 입력하세요..."
                                     />
                                  ) : (
                                     <div className="markdown-preview max-w-none text-on-surface">
                                        <div className="mb-8 p-5 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                                            <span className="material-symbols-outlined text-primary text-[22px] mt-0.5">info</span>
                                            <p className="text-sm text-primary/80 leading-relaxed font-medium">
                                                AI 초안을 바탕으로 내용을 검토하고 실정에 맞게 보완해 주세요. 마크다운 형식이 자동 적용됩니다.
                                            </p>
                                        </div>
                                        <MarkdownContent content={selectedNode.draft_content || ''} />
                                     </div>
                                  )}
                               </div>
                            </>
                         ) : (
                            <div className="h-[800px] flex flex-col items-center justify-center p-12 text-center bg-surface-container-low/20">
                               <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                                  <span className="material-symbols-outlined text-4xl text-primary/30">touch_app</span>
                               </div>
                               <h5 className="font-bold text-on-surface mb-2">섹션을 선택해 주세요</h5>
                               <p className="text-xs text-outline leading-relaxed max-w-[200px]">
                                  좌측 목차에서 내용을 확인하거나 수정할 섹션을 클릭하세요.
                                </p>
                            </div>
                         )}
                      </div>
                   </div>
                )}
             </div>

             {!isGeneratingDraft && (
                <div className="p-4 bg-surface-container-high border-t border-outline-variant/10 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                       <div className="flex items-center gap-2 text-[10px] text-outline font-bold">
                          <span className="material-symbols-outlined text-sm">info</span>
                          진행에 문제가 있다면 상태를 초기화하세요.
                       </div>
                       <button 
                           onClick={async () => {
                               if (!props.documentId) return;
                               if (window.confirm("진행 중인 '초안 작성' 단계의 모든 상태(노트북 ID, 리서치 기록 등)를 완전히 초기화하시겠습니까?\n서버에 저장된 이전 기록이 삭제되어 처음부터 모든 과정을 새로 시작하게 됩니다.")) {
                                   try {
                                       await api.saveProjectDraftReset(props.documentId);
                                       setDraftTree([]);
                                       setCompletedSteps(prev => (prev || []).filter(s => s !== 3));
                                       alert("서버 상태가 초기화되었습니다.");
                                   } catch(err) {
                                       alert("초기화 실패");
                                   }
                               }
                           }}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 hover:bg-error/20 text-[11px] font-bold text-error rounded-lg transition-all border border-error/20 cursor-pointer"
                       >
                           <span className="material-symbols-outlined text-[16px]">refresh</span>
                           진행 상태 완전 리셋(서버)
                       </button>
                       <button 
                           onClick={() => {
                               if (window.confirm("현재 화면의 내용을 비울까요?")) {
                                   setDraftTree([]);
                               }
                           }}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-outline-variant/10 hover:bg-surface-container-highest text-[11px] font-bold text-outline rounded-lg transition-all border border-outline-variant/20 cursor-pointer"
                       >
                           <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                           화면만 초기화
                       </button>
                   </div>
                   
                   {draftTree.length > 0 && (
                       <div className="flex items-center gap-2">
                           <button 
                               onClick={async () => {
                                   if (!props.documentId) return;
                                   try {
                                       const { selectedIds, contentIds } = treeRef.current?.getSelectedIds() || { selectedIds: [], contentIds: [] };
                                       await api.saveProject(props.documentId, props.fileName || 'Untitled', props.fileName || 'Unknown File', selectedIds, contentIds, draftTree);
                                       handleStepCompletion(3);
                                       setTimeout(() => toggleStep(4), 300);
                                   } catch(err) {
                                       alert("저장 실패: " + err);
                                   }
                               }}
                               className="px-6 py-2.5 bg-secondary text-on-secondary text-sm font-black rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                           >
                              <span className="material-symbols-outlined text-lg">check_circle</span>
                              💾 초안 확정 및 저장
                           </button>

                           <div className="flex items-center bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 shadow-inner ml-4">
                               <button 
                                   onClick={() => setHwpxEngine('lxml')}
                                   className={`px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all ${hwpxEngine === 'lxml' ? 'bg-white text-primary shadow-sm ring-1 ring-primary/10' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                               >
                                   LXML
                               </button>
                               <button 
                                   onClick={() => setHwpxEngine('pyhwpx')}
                                   className={`px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all ${hwpxEngine === 'pyhwpx' ? 'bg-white text-primary shadow-sm ring-1 ring-primary/10' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                               >
                                   PyHWPX
                               </button>
                           </div>
                           <button 
                                onClick={handleOpenHwpxModal}
                                className="px-5 py-2.5 bg-primary/10 text-primary text-sm font-black rounded-xl border border-primary/20 hover:bg-primary/20 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">file_download</span>
                                HWPX 생성
                            </button>
                       </div>
                   )}
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
                             setTimeout(() => {
                                 setIsEnhancingProposal(false);
                                 setFinalProposal("1. 사업 개요 및 요약\n본 과제는 '글로벌 초격차 기술을 선도하는...' \n\n(💡 제안서 양식에 맞추어 전문적인 어조로 윤문된 최종 텍스트 결과가 표시됩니다.)");
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
                         <button 
                             onClick={handleOpenHwpxModal}
                             className="px-6 py-3.5 bg-primary text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg hover:bg-primary/95 flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0 text-center w-full md:w-auto justify-center"
                         >
                             <span className="material-symbols-outlined text-xl">download</span>
                             최종 파일(HWPX) 다운로드
                         </button>
                     </div>
                 </div>
             )}
          </div>
        </AccordionSection>
      </div>
      
      {retryModalConfig && (
        <ErrorRetryModal 
          isOpen={retryModalConfig.isOpen}
          modelName={retryModalConfig.modelName}
          onRetry={() => retryModalConfig.resolve && retryModalConfig.resolve(true)}
          onCancel={() => retryModalConfig.resolve && retryModalConfig.resolve(false)}
        />
      )}
      <HwpxFormatModal 
        isOpen={isHwpxModalOpen}
        onClose={() => setIsHwpxModalOpen(false)}
        documentId={props.documentId}
        onGenerate={handleGenerateHwpx}
      />
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

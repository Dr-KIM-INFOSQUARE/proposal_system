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
  onSave: (selectedIds: (string | number)[], contentIds: (string | number)[], treeData?: DocumentNode[]) => void;
  onExport: (selectedIds: (string | number)[], contentIds: (string | number)[], treeData?: DocumentNode[]) => void;
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
  onFileSelect: (file: File) => void;
  onStartAnalysis: () => void;
  onCancelSelection: () => void;
  onTitleChange: (title: string) => void;
  hasSelectedFile: boolean;
  uploadMessage?: string | null;
  onEnhanceStateChange?: (active: boolean, msg?: string) => void;
  onSetTreeData?: (tree: DocumentNode[]) => void;
}

export const AnalysisWorkflow: React.FC<AnalysisWorkflowProps> = (props) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const treeRef = useRef<DocumentTreeRef>(null);
  const cancelDraftRef = useRef<boolean>(false);
  
  const [isHwpxModalOpen, setIsHwpxModalOpen] = useState<boolean>(false);
  const [hwpxMode, setHwpxMode] = useState<'draft' | 'enhanced'>('draft');
  const [detectedLevels, setDetectedLevels] = useState<{paragraph: string[], table: string[]}>({paragraph: [], table: []});

  // [신규] 문서 내용을 분석하여 사용된 단계를 추출하는 함수
  const analyzeContentLevels = (nodes: DocumentNode[], mode: 'draft' | 'enhanced') => {
    const pLevels = new Set<string>();
    const tLevels = new Set<string>();

    const traverse = (n: DocumentNode) => {
      const content = mode === 'draft' ? n.draft_content : n.extended_content;
      if (content) {
        const lines = content.split('\n');
        let isInTable = false;
        for (const line of lines) {
          const trimmed = line.trim();
          // 마크다운 표 시작 확인 (| 로 시작)
          if (trimmed.startsWith('|')) {
            isInTable = true;
          } else if (trimmed === '') {
            isInTable = false;
          }

          const matches = line.match(/\[L\d+\]/g);
          if (matches) {
            matches.forEach(m => {
              if (isInTable) tLevels.add(m);
              else pLevels.add(m);
            });
          }
        }
      }
      if (n.children) n.children.forEach(traverse);
    };

    nodes.forEach(traverse);
    
    return {
      paragraph: Array.from(pLevels).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})),
      table: Array.from(tLevels).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
    };
  };

  const handleOpenHwpxModal = async (mode: 'draft' | 'enhanced' = 'draft') => {
    if (!props.documentId) return;
    try {
      const { selectedIds, contentIds } = treeRef.current?.getSelectedIds() || { selectedIds: [], contentIds: [] };
      const treeData = treeRef.current?.getTreeData() || [];
      
      // 선택된 것이 하나도 없는데 트리는 있다면 저장을 건너뜁니다 (데이터 보호)
      if (selectedIds.length === 0 && treeData.length > 0) {
        console.warn("[Workflow] Skipping auto-save in HwpxModal: No nodes selected.");
      } else {
        await api.saveProject(props.documentId, props.fileName || "Untitled", props.fileName || "Unknown File", selectedIds, contentIds, draftTree);
      }
      
      // [추가] 단계 자동 분석 실행
      const levels = analyzeContentLevels(draftTree, mode);
      setDetectedLevels(levels);

      setHwpxMode(mode);
      setIsHwpxModalOpen(true);
    } catch(err) {
      alert("문서 저장 중 오류가 발생했습니다: " + err);
    }
  };

  const handleGenerateHwpx = async (styleConfig: any) => {
    if (!props.documentId) return;
    setIsGeneratingHwpx(true);
    setHwpxLogs(['HWPX 파일 생성 준비 중...']);
    
    try {
      const data = await api.generateHwpxStream(
        props.documentId, 
        styleConfig, 
        hwpxMode,
        (msg) => {
          setHwpxLogs(prev => {
            // 마지막 로그와 동일하면 중복 추가 방지
            if (prev.length > 0 && prev[prev.length - 1] === msg) return prev;
            return [...prev.slice(-99), msg]; // 최근 100개 유지
          });
        }
      );
      
      if (data && data.download_url) {
          setHwpxLogs(prev => [...prev, '✅ 생성 완료! 다운로드를 시작합니다.']);
          window.location.href = data.download_url;
          // 다운로드 완료 후 모달 닫기 1초
          setTimeout(() => {
            setIsHwpxModalOpen(false);
          }, 1000);
      } else {
          setHwpxLogs(prev => [...prev, '❌ 생성에 실패했습니다.']);
      }
    } catch (error) {
      console.error("HWPX stream error:", error);
      setHwpxLogs(prev => [...prev, '🚨 오류 발생: ' + error]);
    } finally {
      setTimeout(() => {
        setIsGeneratingHwpx(false);
        // 로그 초기화는 하지 않음 (사용자가 마지막으로 볼 수 있게)
      }, 5000);
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

  // Step 4 UI States
  const [isEnhancingProposal, setIsEnhancingProposal] = useState(false);
  const [enhancementStatus, setEnhancementStatus] = useState<string>('');
  const [isGeneratingHwpx, setIsGeneratingHwpx] = useState(false);
  const [hwpxLogs, setHwpxLogs] = useState<string[]>([]);
  const [runDeepResearch, setRunDeepResearch] = useState(false);
  const [viewMode, setViewMode] = useState<'draft' | 'enhanced'>('enhanced');

  // Step 2 UI States for tabs
  const [activeIdeaTab, setActiveIdeaTab] = useState<'edit' | 'preview'>('edit');
  const [activeMasterBriefTab, setActiveMasterBriefTab] = useState<'edit' | 'preview'>('preview');

  // [신규] 초안 생성 중단 핸들러
  const handleCancelDraft = async () => {
    if (!props.documentId) return;
    if (!window.confirm("정말 초안 작성을 중단하시겠습니까? 작업을 중단하면 지금까지 작성된 초안 내용은 모두 초기화됩니다.")) return;
    
    cancelDraftRef.current = true;
    try {
        const res = await api.cancelDraft(props.documentId);
        if (res.status === 'success') {
            console.log("[Workflow] Draft generation cancelled by user. Resetting data...");
            
            // [추가] 취소 시 데이터 초기화 로직 실행
            const resetRes = await api.saveProjectDraftReset(props.documentId);
            const freshTree = resetRes.tree || [];
            
            setDraftTree(freshTree);
            if (props.onSetTreeData) props.onSetTreeData(freshTree);
            
            setDraftLogs(prev => [...prev, "> 사용자가 작업을 중단하고 데이터를 초기화했습니다."]);
            setIsGeneratingDraft(false);
            
            if (props.onEnhanceStateChange) {
                props.onEnhanceStateChange(false);
            }
        }
    } catch (e) {
        console.error("[Workflow] Failed to cancel draft:", e);
    } finally {
        // 잠시 후 플래그 해제 (현재 루프가 정리될 시간 확보)
        setTimeout(() => { cancelDraftRef.current = false; }, 1000);
    }
  };

  // 초안 생성 실행 (SSE)
  const handleGenerateDraft = async () => {
    if (!props.documentId) {
      alert("프로젝트가 아직 저장되지 않았거나 ID를 찾을 수 없습니다. 다시 시도하거나 프로젝트를 저장해 주세요.");
      return;
    }
    
    // 이미 진행 중이면 중복 실행 방지
    if (isGeneratingDraft) return;

    const docId = props.documentId;
    const modelToUse = props.selectedModel;
    const modeToUse = researchMode;
    let success = false;
    
    console.log("[Workflow] Starting draft generation. Mode:", modeToUse);
    setIsGeneratingDraft(true);
    
    // [수정] 초안 생성 전 자동 저장 제거 (사용자가 1단계에서 직접 '저장' 버튼을 누른 데이터만 사용함)
    console.log("[Workflow] Starting draft generation with existing tree selection.");
    
    while (!success) {
      try {
        // [수정] 최신 트리를 props에서 가져오되, 만약 금방 리셋했다면 props가 아직 반영 안되었을 수 있으므로
        // 로컬 draftTree가 있다면 그것을 우선시 (초안 리셋 시 []가 됨)
        const currentTree = draftTree.length > 0 ? draftTree : props.initialTreeData;
        if (currentTree && currentTree.length > 0) {
            setDraftTree(currentTree);
        }

        if (props.onEnhanceStateChange) {
            props.onEnhanceStateChange(true, "초안 생성 초기화 중...");
        }

        const finalTree = await api.generateDraftStream(
          docId, 
          modelToUse,
          modeToUse,
          (msg) => {
            if (props.onEnhanceStateChange) {
                props.onEnhanceStateChange(true, msg);
            }
            setDraftLogs(prev => [...prev, `> ${msg}`]);
          },
          (nodeId, content) => {
            console.log(`[Workflow] Real-time update received for node ${nodeId}`);
            setDraftTree(prev => {
                const updatedTree = findAndUpdateNode(prev, nodeId, content);
                return [...updatedTree]; 
            });
            // [삭제] setSelectedNodeId(nodeId); -> 강제 이동 제거
          }
        );

        if (finalTree) {
          setDraftTree(finalTree);
          if (props.onEnhanceStateChange) {
              props.onEnhanceStateChange(false, "초안 작성이 완료되었습니다.");
          }
          // [삭제] setSelectedNodeId(firstDraftNode.id); -> 완료 시 자동 이동 제거
          success = true;
          setIsGeneratingDraft(false);
        }
      } catch (err) {
        console.error("[Workflow] Draft generation failed:", err);
        const modelName = modelToUse.split('/').pop() || modelToUse;
        
        if (props.onEnhanceStateChange) {
            props.onEnhanceStateChange(false);
        }
        
        // [추가] 사용자가 직접 취소한 경우 재시도 모달을 띄우지 않고 즉시 종료
        if (cancelDraftRef.current) {
            console.log("[Workflow] Manual cancellation detected in loop. Stopping.");
            setIsGeneratingDraft(false);
            break;
        }

        const retryDecision = await new Promise<boolean>((resolve) => {
          setRetryModalConfig({ isOpen: true, modelName, resolve });
        });
        
        setRetryModalConfig(null);
        
        if (!retryDecision) {
          setDraftLogs(prev => [...prev, `> [오류] 재시작 취소됨`]);
          setIsGeneratingDraft(false);
          break; 
        } else {
          setDraftLogs(prev => [...prev, `> [재시도] 다시 시작 중...`]);
        }
      }
    }
    setIsGeneratingDraft(false);
  };

  // [신규] 컴포넌트 마운트 시 백그라운드 상태 체크 및 자동 재연결
  useEffect(() => {
    if (activeStep === 3 && !isGeneratingDraft && props.documentId) {
        const checkStatus = async () => {
            try {
                const status = await api.getDraftStatus(props.documentId!);
                if (status.is_running) {
                    console.log("[Workflow] Found ongoing background task. Re-connecting...");
                    setDraftLogs(prev => [...prev, "> 진행 중인 작업을 발견했습니다. 연결 중..."]);
                    handleGenerateDraft(); 
                }
            } catch (e) {
                console.error("[Workflow] Status check failed:", e);
            }
        };
        checkStatus();
    }
  }, [activeStep, props.documentId]);

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

  // --- Step 4 Enhancing Handlers ---
  const handleCancelEnhance = async () => {
    if (!props.documentId) return;
    try {
        await api.cancelEnhance(props.documentId);
        setIsEnhancingProposal(false);
        setEnhancementStatus('사용자에 의해 중단되었습니다.');
    } catch (err) {
        console.error("Cancel failed:", err);
    }
  };

  const handleGenerateEnhance = async () => {
    if (!props.documentId) return;
    
    if (runDeepResearch && !window.confirm("심층 리서치(Deep Research)를 포함하면 약 5~10분이 소요될 수 있습니다. 계속하시겠습니까?")) {
        return;
    }

    setIsEnhancingProposal(true);
    setEnhancementStatus('고도화 작업 준비 중...');
    setViewMode('enhanced');

    try {
        await api.enhanceDraftStream(
            props.documentId,
            runDeepResearch,
            (msg) => setEnhancementStatus(msg),
            (nodeId, content) => {
                setDraftTree(prev => findAndUpdateEnhancedNode(prev, nodeId, content));
            }
        );
        setEnhancementStatus('고도화가 완료되었습니다.');
        handleStepCompletion(4);
    } catch (err) {
        console.error("Enhancement failed:", err);
        setEnhancementStatus(`오류 발생: ${err}`);
    } finally {
        setIsEnhancingProposal(false);
    }
  };

  // 고도화 노드 업데이트 헬퍼
  const findAndUpdateEnhancedNode = (nodes: DocumentNode[], id: string | number, content: string): DocumentNode[] => {
    return nodes.map(node => {
        if (node.id === id) {
            return { ...node, extended_content: content };
        }
        if (node.children) {
            return { ...node, children: findAndUpdateEnhancedNode(node.children, id, content) };
        }
        return node;
    });
  };

  // 고도화 상태 복구를 위한 useEffect (Step 4 진입 시)
  useEffect(() => {
    if (activeStep === 4 && !isEnhancingProposal && props.documentId) {
        const checkEnhanceStatus = async () => {
            try {
                const status = await api.getEnhanceStatus(props.documentId!);
                if (status.is_running) {
                    console.log("[Workflow] Found ongoing enhancement task. Re-connecting...");
                    setEnhancementStatus(status.last_message || "> 진행 중인 작업을 발견했습니다. 연결 중...");
                    handleGenerateEnhance(); 
                }
            } catch (e) {
                console.error("[Workflow] Enhancement status check failed:", e);
            }
        };
        checkEnhanceStatus();
    }
  }, [activeStep, props.documentId]);

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
      const hasDraftContent = (nodes: DocumentNode[]): boolean => {
        for (const node of nodes) {
          if (node.draft_content) return true;
          if (node.children && hasDraftContent(node.children)) return true;
        }
        return false;
      };

      const hasEnhancedContent = (nodes: DocumentNode[]): boolean => {
        for (const node of nodes) {
          if (node.extended_content) return true;
          if (node.children && hasEnhancedContent(node.children)) return true;
        }
        return false;
      };

      if (hasDraftContent(props.initialTreeData)) {
        console.log("[Workflow] Existing draft/enhanced content found. Restoring draftTree.");
        setDraftTree(props.initialTreeData);
        
        setCompletedSteps(prev => {
          const newSteps = [...prev];
          [1, 2, 3].forEach(s => {
            if (!newSteps.includes(s)) newSteps.push(s);
          });
          // 고도화 내용(extended_content)이 있으면 4단계도 완료 처리
          if (hasEnhancedContent(props.initialTreeData) && !newSteps.includes(4)) {
            newSteps.push(4);
          }
          return newSteps;
        });

        const firstDraftNode = findFirstContentNode(props.initialTreeData);
        if (firstDraftNode && !selectedNodeId) {
          setSelectedNodeId(firstDraftNode.id);
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

  // [수정] 최초 로딩 시 마지막 단계 자동 열기 제거 (사용자가 직접 선택하도록 변경)
  useEffect(() => {
    if (props.documentId && !autoOpenTriggered && completedSteps.length > 0) {
      // setActiveStep(nextStep) 로직 제거
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

  // HWPX 로그 자동 스크롤
  useEffect(() => {
    if (isGeneratingHwpx) {
      const el = document.getElementById('hwpx-log-end');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hwpxLogs, isGeneratingHwpx]);

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
      // [삭제] setActiveStep(step + 1); -> 자동 다음 단계 이동 기능을 제거함 (UX 피드백 반영)
    }
  };

  const handleTopExport = () => {
    if (treeRef.current) {
      const { selectedIds, contentIds } = treeRef.current.getSelectedIds();
      const treeData = treeRef.current.getTreeData();
      props.onExport(selectedIds, contentIds, treeData);
    }
  };

  const handleTopSave = () => {
    if (treeRef.current) {
      const { selectedIds, contentIds } = treeRef.current.getSelectedIds();
      const treeData = treeRef.current.getTreeData();
      props.onSave(selectedIds, contentIds, treeData);
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
           title="아이디어 고도화"
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
                                        alert("아이디어 마스터 브리프가 성공적으로 저장되었습니다!");
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
           title="사업계획서 초안 작성"
           isOpen={activeStep === 3}
           isCompleted={completedSteps.includes(3)}
           onToggle={() => toggleStep(3)}
           isDisabled={isStepDisabled(3)}
        >
          <div className="flex flex-col bg-surface-container-lowest/50 min-h-[400px]">
              <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
                  <div>
                      <h4 className="text-base font-bold text-on-surface flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">auto_stories</span>
                          NotebookLM 기반 팩트 수집 및 초안 생성
                      </h4>
                      <p className="text-xs text-outline leading-relaxed mt-1">
                          실시간 검색 데이터와 마스터 브리프를 조합하여 목차별 근거 중심 초안을 생성합니다.
                      </p>
                  </div>

                  {/* [신규] 상단 인라인 상태 바 (Global Status) */}
                  {isGeneratingDraft && (
                    <div className="flex items-center gap-4 bg-primary/5 px-4 py-2.5 rounded-2xl border border-primary/10 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[14px] text-primary animate-pulse">sync</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-primary uppercase tracking-wider">AI Drafting...</span>
                          </div>
                          <p className="text-[11px] text-on-surface font-bold truncate max-w-[300px]">
                            {draftLogs.length > 0 ? draftLogs[draftLogs.length - 1].replace('> ', '') : '작업 준비 중...'}
                          </p>
                        </div>
                      </div>

                      {/* [신규] 취소 버튼 */}
                      <button 
                        onClick={handleCancelDraft}
                        className="ml-2 p-1.5 hover:bg-error/10 text-error rounded-lg transition-colors group relative"
                        title="작업 취소"
                      >
                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-on-surface text-surface text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                          작업 중단
                        </span>
                      </button>
                    </div>
                  )}
              </div>

             {/* 초안 내용이 하나도 없는지 확인하는 헬퍼 함수 */}
             { (function() {
                const hasAnyDraft = (nodes: DocumentNode[]): boolean => {
                    for (const n of nodes) {
                        if (n.draft_content && n.draft_content.trim().length > 0) return true;
                        if (n.children && hasAnyDraft(n.children)) return true;
                    }
                    return false;
                };
                const isDraftEmpty = !hasAnyDraft(draftTree);

                return (
                  <div className="flex-1 w-full">
                    {isDraftEmpty && !isGeneratingDraft ? (
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
                ) : (
                   <div className="flex flex-col md:flex-row items-start gap-6 p-6 relative">
                      {/* [삭제] 기존의 absolute 상단 바를 제거함 */}

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
                               
                                <div className="h-[700px] overflow-y-auto p-8 custom-scrollbar bg-surface-container-lowest relative">
                                   {isGeneratingDraft && (!selectedNode.draft_content || selectedNode.draft_content.trim() === '') && (
                                       <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/20 backdrop-blur-[4px] animate-in fade-in duration-700">
                                           <div className="bg-white/90 p-8 rounded-3xl shadow-xl border border-primary/10 flex flex-col items-center gap-4 max-w-xs text-center transform scale-110">
                                               <div className="relative">
                                                  <div className="w-16 h-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin"></div>
                                                  <div className="absolute inset-0 flex items-center justify-center">
                                                     <span className="material-symbols-outlined text-2xl text-primary animate-pulse">edit_note</span>
                                                  </div>
                                               </div>
                                               <div>
                                                  <p className="text-sm font-black text-on-surface">본문을 작성하고 있습니다</p>
                                                  <p className="text-[11px] text-outline mt-1 leading-relaxed">AI가 리서치 데이터를 바탕으로 최적의 초안을 구성 중입니다.</p>
                                               </div>
                                               <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden mt-2">
                                                  <div className="h-full bg-primary animate-[shimmer_2s_infinite] w-full origin-left"></div>
                                               </div>
                                           </div>
                                       </div>
                                   )}
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
             )
             })() }

             {!isGeneratingDraft && (
                <div className="p-4 bg-surface-container-high border-t border-outline-variant/10 flex items-center justify-between relative z-30">
                   <div className="flex items-center gap-4">
                       <div className="flex items-center gap-2 text-[10px] text-outline font-bold">
                          <span className="material-symbols-outlined text-sm">info</span>
                          새로운 초안을 작성하려면 상태를 초기화하세요.
                       </div>
                       <button 
                           type="button"
                           onClick={async (e) => {
                               e.stopPropagation(); // 이벤트 전파 방지
                               if (!props.documentId) return;
                               if (window.confirm("진행 중인 '초안 작성' 및 '고도화' 단계의 모든 데이터(노트북 ID, 리서치 기록 등)를 완전히 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
                                   try {
                                       const res = await api.saveProjectDraftReset(props.documentId);
                                       const freshTree = res.tree || [];
                                       setDraftTree(freshTree);
                                       if (props.onSetTreeData) props.onSetTreeData(freshTree);
                                       
                                       // Step 3와 Step 4 모두 완료 목록에서 제거
                                       setCompletedSteps(prev => (prev || []).filter(s => s !== 3 && s !== 4));
                                       alert("모든 진행 상태가 초기화되었습니다.");
                                   } catch(err) {
                                       console.error("Reset failed:", err);
                                       alert("초기화 실패");
                                   }
                               }
                           }}
                           className="px-4 py-2 bg-error/10 text-error hover:bg-error hover:text-white text-[12px] font-black rounded-lg transition-all border border-error/20 shadow-sm hover:shadow-md cursor-pointer flex items-center gap-2 group"
                       >
                           <span className="material-symbols-outlined text-[16px] group-hover:rotate-180 transition-transform">refresh</span>
                           초안 리셋
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
                                       alert("초안 내용이 성공적으로 저장되었습니다!");
                                   } catch(err) {
                                       alert("저장 실패: " + err);
                                   }
                               }}
                               className="px-6 py-2.5 bg-secondary text-on-secondary text-sm font-black rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                           >
                              <span className="material-symbols-outlined text-lg">check_circle</span>
                              💾 초안 확정 및 저장
                           </button>

                           <button 
                                onClick={() => handleOpenHwpxModal('draft')}
                                className="px-6 py-2.5 ml-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-black rounded-xl border border-transparent shadow-[0_4px_12px_rgba(167,139,250,0.4)] hover:shadow-[0_6px_16px_rgba(167,139,250,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all flex items-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-lg">description</span>
                                ✨ HWPX 생성(초안)
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
           title="사업계획서 고도화"
           isOpen={activeStep === 4}
           isCompleted={completedSteps.includes(4)}
           onToggle={() => toggleStep(4)}
           isDisabled={isStepDisabled(4)}
        >
          <div className="p-0 flex flex-col bg-surface-container-lowest/50">
             {/* 상태 알림 바 */}
             {(isEnhancingProposal || enhancementStatus) && (
                <div className="px-6 py-3 bg-tertiary/10 border-b border-tertiary/20 flex items-center justify-between animate-fade-in">
                   <div className="flex items-center gap-3">
                      {isEnhancingProposal ? (
                         <div className="w-4 h-4 rounded-full border-2 border-tertiary/20 border-t-tertiary animate-spin"></div>
                      ) : (
                         <span className="material-symbols-outlined text-tertiary text-lg">info</span>
                      )}
                      <span className="text-xs font-black text-tertiary">{enhancementStatus || (isEnhancingProposal ? '고도화 진행 중...' : '준비 완료')}</span>
                   </div>
                   {isEnhancingProposal && (
                      <button 
                         onClick={handleCancelEnhance}
                         className="px-3 py-1 bg-white border border-tertiary/30 text-tertiary text-[10px] font-black rounded-lg hover:bg-tertiary hover:text-white transition-all shadow-sm flex items-center gap-1"
                      >
                         <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                         중단하기
                      </button>
                   )}
                </div>
             )}

             <div className="min-h-[600px] flex flex-col">
                {(!isEnhancingProposal && !draftTree.some(n => n.extended_content || (n.children && n.children.some((c: any) => c.extended_content)))) ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 gap-8">
                       <div className="text-center max-w-lg">
                          <h4 className="text-xl font-black text-on-surface mb-3 flex items-center justify-center gap-2">
                             <span className="material-symbols-outlined text-tertiary text-2xl">auto_awesome</span>
                             전문가 수준의 고도화 시작
                          </h4>
                          <p className="text-sm text-outline leading-relaxed break-keep">
                             확정된 초안을 바탕으로 NotebookLM의 지식을 재동기화하여 설득력을 극대화합니다.<br/>
                             정부지원사업 심사위원들이 선호하는 전문 용어 사용 및 풍성한 근거를 보강합니다.
                          </p>
                       </div>

                       <div className="w-full max-w-md p-6 bg-white rounded-3xl border border-tertiary/10 shadow-xl flex flex-col gap-5">
                          <div className="flex items-center justify-between p-4 bg-tertiary/5 rounded-2xl border border-tertiary/10">
                             <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-tertiary p-2 bg-white rounded-xl shadow-sm">search_insights</span>
                                <div>
                                   <p className="text-xs font-black text-tertiary">심층 리서치 추가 수행</p>
                                   <p className="text-[10px] text-outline">최신 트렌드 및 정책 데이터를 추가로 리서치합니다 (+5~10분)</p>
                                </div>
                             </div>
                             <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={runDeepResearch} onChange={(e) => setRunDeepResearch(e.target.checked)} />
                                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-tertiary shadow-inner"></div>
                             </label>
                          </div>

                          <button 
                              onClick={handleGenerateEnhance}
                              className="w-full py-4 bg-tertiary text-on-tertiary text-sm font-black rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group"
                          >
                             <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">rocket_launch</span>
                             고도화 엔진 가동 시작
                          </button>
                       </div>
                    </div>
                ) : (
                    <div className="flex flex-col md:flex-row items-start gap-6 p-6 relative">
                       {/* 트리 네비게이션 */}
                       <div className="flex-1 min-w-0 bg-surface rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
                          <div className="p-4 border-b border-outline-variant/5 bg-tertiary/5">
                             <span className="text-xs font-black text-tertiary uppercase tracking-wider flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">account_tree</span>
                                고도화 목차
                             </span>
                          </div>
                          <nav className="p-3 flex flex-col gap-1.5 bg-white">
                             { (function renderEnhanceToC(nodes: DocumentNode[], depth = 0) {
                                 return nodes.map(node => (
                                    <React.Fragment key={node.id}>
                                       <button
                                          onClick={() => setSelectedNodeId(node.id)}
                                          className={`w-full text-left p-3 rounded-xl text-xs transition-all flex items-center gap-2 group
                                             ${selectedNodeId === node.id ? 'bg-tertiary text-white font-bold shadow-md ring-4 ring-tertiary/10' : 'hover:bg-tertiary/5 text-on-surface/70'}
                                             ${node.extended_content ? 'opacity-100' : 'opacity-40'}
                                          `}
                                          style={{ paddingLeft: `${depth * 16 + 12}px` }}
                                       >
                                          <span className={`material-symbols-outlined text-[18px] ${selectedNodeId === node.id ? 'text-white' : 'text-tertiary/40'}`}>
                                             {node.children && node.children.length > 0 ? 'folder' : 'description'}
                                          </span>
                                          <span className="truncate">{node.title}</span>
                                          {node.extended_content && (
                                             <span className={`ml-auto flex items-center justify-center w-5 h-5 rounded-full ${selectedNodeId === node.id ? 'bg-white/20 text-white' : 'bg-tertiary-container text-tertiary'} shadow-sm`}>
                                                <span className="material-symbols-outlined text-[14px] font-black">check</span>
                                             </span>
                                          )}
                                       </button>
                                       {node.children && renderEnhanceToC(node.children, depth + 1)}
                                    </React.Fragment>
                                 ));
                              })(draftTree)}
                          </nav>
                       </div>

                       {/* 본문 에디터/뷰어 */}
                       <div className="w-full md:w-[600px] lg:w-[950px] sticky top-24 shrink-0 flex flex-col bg-white rounded-2xl border border-tertiary/20 shadow-2xl overflow-hidden z-20 animate-slide-up">
                          {selectedNode ? (
                             <>
                                <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between bg-tertiary/5">
                                   <div className="flex items-center gap-2 min-w-0">
                                      <span className="material-symbols-outlined text-tertiary text-[20px]">auto_fix_high</span>
                                      <span className="text-sm font-black text-on-surface truncate">{selectedNode.title}</span>
                                   </div>
                                   <div className="flex bg-surface-container-high p-1 rounded-xl border border-outline-variant/10 shrink-0">
                                      <button 
                                         onClick={() => setViewMode('draft')}
                                         className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${viewMode === 'draft' ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                      >초안</button>
                                      <button 
                                         onClick={() => setViewMode('enhanced')}
                                         className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${viewMode === 'enhanced' ? 'bg-tertiary text-white shadow-sm' : 'text-outline hover:text-on-surface'}`}
                                      >고도화본</button>
                                   </div>
                                </div>
                                
                                <div className="h-[700px] overflow-y-auto p-8 custom-scrollbar bg-surface-container-lowest relative">
                                   {isEnhancingProposal && (!selectedNode.extended_content || selectedNode.extended_content.trim() === '') && viewMode === 'enhanced' && (
                                       <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/20 backdrop-blur-[4px] animate-in fade-in duration-700">
                                           <div className="bg-white/90 p-8 rounded-3xl shadow-xl border border-tertiary/10 flex flex-col items-center gap-4 max-w-xs text-center transform scale-110">
                                               <div className="relative">
                                                  <div className="w-16 h-16 rounded-full border-4 border-tertiary/10 border-t-tertiary animate-spin"></div>
                                                  <div className="absolute inset-0 flex items-center justify-center">
                                                     <span className="material-symbols-outlined text-2xl text-tertiary animate-pulse">auto_awesome</span>
                                                  </div>
                                               </div>
                                               <div>
                                                  <p className="text-sm font-black text-on-surface">고도화 중입니다</p>
                                                  <p className="text-[11px] text-outline mt-1 leading-relaxed">최고의 설득력을 갖춘 전문 문장으로 윤문하고 있습니다.</p>
                                               </div>
                                           </div>
                                       </div>
                                   )}
                                   <div className="markdown-preview max-w-none text-on-surface">
                                      {viewMode === 'draft' ? (
                                         <>
                                            <div className="mb-8 p-5 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                                                <span className="material-symbols-outlined text-primary text-[22px] mt-0.5">history</span>
                                                <p className="text-sm text-primary/80 leading-relaxed font-medium">
                                                    기존에 작성된 초안 내용입니다. 고도화본과 비교하여 검토해 보세요.
                                                </p>
                                            </div>
                                            <MarkdownContent content={selectedNode.draft_content || '내용이 없습니다.'} />
                                         </>
                                      ) : (
                                         <>
                                            {!selectedNode.extended_content && !isEnhancingProposal && (
                                                <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                                                   <span className="material-symbols-outlined text-6xl mb-4">bolt</span>
                                                   <p className="text-sm font-bold">아직 고도화되지 않은 항목입니다.</p>
                                                </div>
                                            )}
                                            <MarkdownContent content={selectedNode.extended_content || ''} />
                                         </>
                                      )}
                                   </div>
                                </div>
                             </>
                          ) : (
                             <div className="h-[800px] flex flex-col items-center justify-center p-12 text-center bg-surface-container-low/20">
                                <div className="w-20 h-20 bg-tertiary/5 rounded-full flex items-center justify-center mb-6">
                                   <span className="material-symbols-outlined text-4xl text-tertiary/30">auto_fix_high</span>
                                </div>
                                <h5 className="font-bold text-on-surface mb-2">항목을 선택해 주세요</h5>
                                <p className="text-xs text-outline leading-relaxed max-w-[200px]">
                                   좌측 목차에서 고도화된 내용을 확인할 섹션을 클릭하세요.
                                 </p>
                             </div>
                          )}
                       </div>
                    </div>
                )}
             </div>

             {completedSteps.includes(4) && !isEnhancingProposal && (
                 <div className="p-6 bg-surface-container-high border-t border-outline-variant/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-[10px] text-outline font-bold">
                           <span className="material-symbols-outlined text-sm">info</span>
                           고도화된 내용만 초기화하고 다시 시작할 수 있습니다.
                        </div>
                        <button 
                            type="button"
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!props.documentId) return;
                                if (window.confirm("현재 고도화된 내용(extended_content)만 완전히 초기화하시겠습니까?\n기존 초안(draft_content)은 유지됩니다.")) {
                                    try {
                                        await api.resetEnhance(props.documentId);
                                        // 트리 로컬 상태 업데이트
                                        setDraftTree(prev => {
                                            const resetNodes = (nodes: DocumentNode[]): DocumentNode[] => {
                                                return nodes.map(n => ({
                                                    ...n,
                                                    extended_content: undefined,
                                                    children: n.children ? resetNodes(n.children) : undefined
                                                }));
                                            };
                                            return resetNodes(prev);
                                        });
                                        // Step 4 완료 목록에서 제거
                                        setCompletedSteps(prev => (prev || []).filter(s => s !== 4));
                                        alert("고도화 데이터가 초기화되었습니다.");
                                    } catch(err) {
                                        console.error("Reset failed:", err);
                                        alert("초기화 실패");
                                    }
                                }
                            }}
                            className="px-4 py-2 bg-error/10 text-error hover:bg-error hover:text-white text-[12px] font-black rounded-lg transition-all border border-error/20 shadow-sm hover:shadow-md cursor-pointer flex items-center gap-2 group"
                        >
                            <span className="material-symbols-outlined text-[16px] group-hover:rotate-180 transition-transform">restart_alt</span>
                            고도화 리셋
                        </button>
                    </div>

                    <button 
                       onClick={() => handleOpenHwpxModal('enhanced')}
                       className="px-8 py-3.5 bg-gradient-to-r from-tertiary to-[#6366f1] text-white text-sm font-black rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-2"
                    >
                       <span className="material-symbols-outlined text-xl">download</span>
                       고도화 버전 HWPX 다운로드
                    </button>
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

      {/* HWPX 생성 진행 상태 오버레이 */}
      {isGeneratingHwpx && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center p-6 animate-fade-in pointer-events-none">
          <div className="bg-surface-container-high border-2 border-primary/50 rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] p-8 flex flex-col gap-6 w-full max-w-md backdrop-blur-xl pointer-events-auto ring-1 ring-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-3xl animate-pulse">description</span>
                </div>
                <div>
                  <h4 className="text-lg font-black text-on-surface">HWPX 문서 조립 중</h4>
                  <p className="text-xs text-outline font-medium">실시간 진행 로그를 확인하세요.</p>
                </div>
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-4 border-primary/10 border-t-primary animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-black text-primary uppercase">OP</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 p-5 bg-black/5 rounded-2xl border border-outline-variant/10 max-h-[220px] overflow-y-auto custom-scrollbar shadow-inner font-mono">
              {hwpxLogs.map((log, i) => (
                <p key={i} className={`text-[11px] leading-relaxed flex items-start gap-2 ${i === hwpxLogs.length - 1 ? 'text-primary font-black animate-pulse' : 'text-outline-variant/70'}`}>
                  <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-current opacity-40"></span>
                  {log}
                </p>
              ))}
              <div id="hwpx-log-end"></div>
            </div>
            
            <div className="flex items-center gap-2 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-ping"></span>
                <p className="text-[11px] font-black text-primary/60 tracking-tight">완료 시 자동으로 다운로드가 시작됩니다.</p>
            </div>
          </div>
        </div>
      )}

      <HwpxFormatModal 
          isOpen={isHwpxModalOpen}
          onClose={() => setIsHwpxModalOpen(false)}
          documentId={props.documentId}
          onGenerate={handleGenerateHwpx}
          isGeneratingExternal={isGeneratingHwpx}
          detectedParagraphLevels={detectedLevels.paragraph}
          detectedTableLevels={detectedLevels.table}
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

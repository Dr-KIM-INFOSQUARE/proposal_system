const fs = require('fs');

const path = "d:\\Desktop\\proposal_system\\frontend\\src\\components\\AnalysisWorkflow.tsx";
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('value={selectedNode.draft_con')) {
        startIdx = i - 1;
    }
    if (startIdx !== -1 && lines[i].includes('화면만 초기화')) {
        endIdx = i + 2;
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    const newBlockLines = `                                     <textarea
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
                               if (window.confirm("진행 중인 '초안 작성' 단계의 모든 상태(노트북 ID, 리서치 기록 등)를 완전히 초기화하시겠습니까?\\\\n서버에 저장된 이전 기록이 삭제되어 처음부터 모든 과정을 새로 시작하게 됩니다.")) {
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
                           className="px-4 py-2 bg-error/10 text-error hover:bg-error hover:text-white text-[12px] font-black rounded-lg transition-all border border-error/20 shadow-sm hover:shadow-md cursor-pointer flex items-center gap-2 group"
                       >
                           <span className="material-symbols-outlined text-[16px] group-hover:rotate-180 transition-transform">refresh</span>
                           진행 상태 완전 리셋(서버)
                       </button>
                   </div>`.split('\n');

    const newLines = [...lines.slice(0, startIdx), ...newBlockLines, ...lines.slice(endIdx)];
    fs.writeFileSync(path, newLines.join('\n'));
    console.log("TSX patched successfully.");
} else {
    console.log("Could not find targets.", startIdx, endIdx);
}

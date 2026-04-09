import React, { useState } from 'react';

export interface StyleConfig {
  bullets: Record<string, { symbol: string; spaces: number }>;
}

interface HwpxFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  onGenerate: (config: StyleConfig) => Promise<void>;
}

export const HwpxFormatModal: React.FC<HwpxFormatModalProps> = ({
  isOpen,
  onClose,
  documentId,
  onGenerate,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [bullets, setBullets] = useState<Record<string, { symbol: string; spaces: number }>>({
    '[L1]': { symbol: '○', spaces: 2 },
    '[L2]': { symbol: '▪', spaces: 4 },
    '[L3]': { symbol: '-', spaces: 6 },
  });

  if (!isOpen || !documentId) return null;

  const handleLevelChange = (level: string, key: 'symbol' | 'spaces', value: string | number) => {
    setBullets((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [key]: value,
      },
    }));
  };

  const handleAddLevel = () => {
    const nextLevelNum = Object.keys(bullets).length + 1;
    const newLevelKey = `[L${nextLevelNum}]`;
    setBullets((prev) => ({
      ...prev,
      [newLevelKey]: { symbol: '-', spaces: nextLevelNum * 2 },
    }));
  };

  const handleRemoveLevel = (levelKey: string) => {
    setBullets((prev) => {
      const newObj = { ...prev };
      delete newObj[levelKey];
      return newObj;
    });
  };

  const handleSubmit = async () => {
    try {
      setIsGenerating(true);
      const payload: StyleConfig = {
        bullets,
      };
      await onGenerate(payload);
    } catch (error) {
      console.error('HWPX 생성 중 오류가 발생했습니다:', error);
    } finally {
      setIsGenerating(false);
      onClose(); // 성공적으로 완료된 후 모달 닫기
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all animate-in fade-in duration-300">
      <div className="relative w-full max-w-[680px] bg-white rounded-[24px] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-black/5">
        
        {/* Header */}
        <div className="px-7 py-6 border-b border-outline-variant/10 flex justify-between items-center bg-white relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-primary to-fuchsia-500"></div>
          <h2 className="text-[22px] font-black text-on-surface flex items-center gap-2.5">
            <span className="material-symbols-outlined text-transparent bg-clip-text bg-gradient-to-br from-violet-600 to-fuchsia-600 text-[26px]">draw</span>
            HWPX 고품질 서식 생성
          </h2>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="w-8 h-8 flex items-center justify-center rounded-full text-outline hover:bg-surface-container-high hover:text-on-surface transition-all disabled:opacity-50 text-[20px]"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Read-only Default Format Settings */}
          <div className="bg-gradient-to-br from-violet-50/80 to-blue-50/50 rounded-[18px] p-5 border border-violet-100/60 shadow-[inset_0_2px_10px_rgba(255,255,255,1)] flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-violet-100 flex items-center justify-center shrink-0 text-violet-600">
               <span className="material-symbols-outlined text-[20px]">tips_and_updates</span>
            </div>
            <div>
              <h3 className="text-[14px] font-black text-violet-900 mb-1.5 tracking-wide text-center sm:text-left">
                기본 문서 서식 안내
              </h3>
              <p className="text-[13px] text-violet-900/80 leading-relaxed font-semibold text-center sm:text-left">
                본 문서의 기본 서식은 <span className="font-bold bg-white px-2 py-0.5 rounded text-violet-800 shadow-sm border border-violet-100/50 inline-block mt-1 mx-0.5">줄간격: 160%</span>
                <span className="font-bold bg-white px-2 py-0.5 rounded text-violet-800 shadow-sm border border-violet-100/50 inline-block mt-1 mx-0.5">정렬: 양쪽 정렬</span>
                <span className="font-bold bg-white px-2 py-0.5 rounded text-violet-800 shadow-sm border border-violet-100/50 inline-block mt-1 mx-0.5">여백/간격: 0pt</span>
                <span className="font-bold bg-white px-2 py-0.5 rounded text-violet-800 shadow-sm border border-violet-100/50 inline-block mt-1 mx-0.5">글꼴: 휴먼명조 12pt</span> 
                으로 자동 적용되며, 목록 서식만 하단에서 조정할 수 있습니다.
              </p>
            </div>
          </div>

          {/* Dynamic Bullets Settings */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center mb-1 px-1 mt-2">
              <h3 className="text-[15px] font-black text-on-surface">단계별 기호 및 들여쓰기 설정</h3>
              <button
                onClick={handleAddLevel}
                disabled={isGenerating}
                className="text-[12px] font-bold text-white bg-primary px-3.5 py-1.5 rounded-full hover:bg-primary-dark hover:shadow-md hover:-translate-y-0.5 flex items-center gap-1 disabled:opacity-50 transition-all active:translate-y-0 active:shadow-sm"
              >
                <span className="material-symbols-outlined text-[15px] font-bold">add</span>
                하위 단계 추가
              </button>
            </div>
            
            <div className="space-y-4">
              {Object.entries(bullets).map(([level, config]) => (
                <div key={level} className="group flex flex-col sm:flex-row items-center gap-4 bg-white border border-outline-variant/20 rounded-2xl p-4 transition-all hover:border-violet-300 hover:shadow-[0_4px_20px_rgba(139,92,246,0.08)] relative">
                  <div className="bg-surface-container-low border border-outline-variant/10 shadow-sm rounded-xl px-4 py-2 text-[15px] font-black text-on-surface min-w-[60px] text-center flex items-center justify-center">
                    {level}
                  </div>
                  
                  <div className="flex-1 flex flex-wrap gap-5 items-center w-full sm:-ml-2 sm:pl-4 sm:border-l border-outline-variant/10">
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] uppercase tracking-wider text-outline font-black whitespace-nowrap">글머리 기호</label>
                      <select
                        value={config.symbol}
                        disabled={isGenerating}
                        onChange={(e) => handleLevelChange(level, 'symbol', e.target.value)}
                        className="text-[14px] font-medium text-on-surface border-outline-variant/30 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-500 focus:ring focus:ring-violet-500/20 py-2 pl-4 pr-10 bg-white disabled:bg-surface-container disabled:text-outline transition-all cursor-pointer hover:border-outline outline-none"
                      >
                        <option value="○">○ (원형)</option>
                        <option value="□">□ (사각형)</option>
                        <option value="▪">▪ (작은 꽉찬 사각형)</option>
                        <option value="-">- (하이픈)</option>
                        <option value="·">· (가운뎃점)</option>
                        <option value="Ⅰ">Ⅰ (로마자 1)</option>
                        <option value="①">① (원숫자 1)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-[11px] uppercase tracking-wider text-outline font-black whitespace-nowrap">들여쓰기 공간</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        disabled={isGenerating}
                        value={config.spaces}
                        onChange={(e) => handleLevelChange(level, 'spaces', parseInt(e.target.value) || 0)}
                        className="w-[72px] text-[15px] font-mono font-bold text-on-surface border-outline-variant/30 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-500 focus:ring focus:ring-violet-500/20 py-2 px-3 disabled:bg-surface-container disabled:text-outline transition-all text-center hover:border-outline outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveLevel(level)}
                    disabled={isGenerating || Object.keys(bullets).length <= 1}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-error/5 text-error/60 hover:bg-error hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none sm:opacity-0 group-hover:opacity-100 absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto"
                    title="해당 단계 삭제"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
            
            <p className="text-[12px] font-bold text-outline mt-5 flex items-center gap-1.5 px-2">
              <span className="material-symbols-outlined text-[16px] text-secondary">lightbulb</span>
              들여쓰기 1칸은 스페이스바 1번 공간을 의미합니다. 계층이 깊어질수록 2칸씩 띄우는 것이 좋습니다.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-end gap-3 pb-8">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-6 py-2.5 text-[14px] font-black text-on-surface bg-white border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors disabled:opacity-50 active:scale-95"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isGenerating}
            className="flex items-center gap-2 px-8 py-2.5 text-[15px] font-black text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl hover:shadow-[0_8px_20px_rgba(167,139,250,0.5)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                HWPX 파일 조합 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                초안으로 HWPX 파일 생성하기
              </>
            )}
          </button>
        </div>
        
      </div>
    </div>
  );
};

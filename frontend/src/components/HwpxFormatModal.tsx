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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">description</span>
            HWPX 서식 설정 및 생성
          </h2>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Read-only Default Format Settings */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">info</span>
              기본 문서 서식 안내
            </h3>
            <p className="text-sm text-blue-700/80 leading-relaxed">
              본 문서의 기본 서식은 <span className="font-medium bg-blue-100/50 px-1 py-0.5 rounded text-blue-800">줄간격: 160%</span>, <span className="font-medium bg-blue-100/50 px-1 py-0.5 rounded text-blue-800">정렬: 양쪽 정렬</span>, <span className="font-medium bg-blue-100/50 px-1 py-0.5 rounded text-blue-800">여백/간격: 0pt</span>, <span className="font-medium bg-blue-100/50 px-1 py-0.5 rounded text-blue-800">글꼴: 휴먼명조 12pt 기본</span>으로 자동 초기화됩니다.
            </p>
          </div>

          {/* Dynamic Bullets Settings */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-gray-800">단계별 기호 및 들여쓰기 설정</h3>
              <button
                onClick={handleAddLevel}
                disabled={isGenerating}
                className="text-xs font-medium text-primary hover:text-primary-dark flex items-center gap-1 disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                단계 추가
              </button>
            </div>
            
            <div className="space-y-3">
              {Object.entries(bullets).map(([level, config]) => (
                <div key={level} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3 transition-colors hover:border-gray-300">
                  <div className="bg-white border border-gray-200 shadow-sm rounded-md px-3 py-1.5 text-sm font-semibold text-gray-700 min-w-[50px] text-center">
                    {level}
                  </div>
                  
                  <div className="flex-1 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium">기호</label>
                      <select
                        value={config.symbol}
                        disabled={isGenerating}
                        onChange={(e) => handleLevelChange(level, 'symbol', e.target.value)}
                        className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 py-1.5 pl-3 pr-8 bg-white disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
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

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium">띄어쓰기 횟수</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        disabled={isGenerating}
                        value={config.spaces}
                        onChange={(e) => handleLevelChange(level, 'spaces', parseInt(e.target.value) || 0)}
                        className="w-16 text-sm border-gray-300 rounded-md shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 py-1.5 px-3 disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveLevel(level)}
                    disabled={isGenerating || Object.keys(bullets).length <= 1}
                    className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:hover:text-gray-400 p-1"
                    title="해당 단계 삭제"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              ))}
            </div>
            
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">lightbulb</span>
              미리보기: 띄어쓰기 횟수는 스페이스바 입력 횟수를 의미합니다 (2칸 = 영문 2자리).
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                생성 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">magic_button</span>
                생성 시작
              </>
            )}
          </button>
        </div>
        
      </div>
    </div>
  );
};

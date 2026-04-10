import React, { useState } from 'react';

export interface BaseStyle {
  font_family: string;
  line_spacing: number;
  alignment: 'Justify' | 'Left' | 'Center' | 'Right';
}

export interface BulletStyle {
  symbol: string;
  spaces: number;
  font_size: number;
}

export interface StyleConfig {
  paragraph_base_style: BaseStyle;
  table_base_style: BaseStyle;
  paragraph_bullets: Record<string, BulletStyle>;
  table_bullets: Record<string, BulletStyle>;
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
  const [activeTab, setActiveTab] = useState<'paragraph' | 'table'>('paragraph');

  const [paragraphBaseStyle, setParagraphBaseStyle] = useState<BaseStyle>({
    font_family: '휴먼명조',
    line_spacing: 160,
    alignment: 'Justify'
  });

  const [tableBaseStyle, setTableBaseStyle] = useState<BaseStyle>({
    font_family: '맑은 고딕',
    line_spacing: 160,
    alignment: 'Center'
  });

  const [paragraphBullets, setParagraphBullets] = useState<Record<string, BulletStyle>>({
    '[L1]': { symbol: '274D', spaces: 2, font_size: 12 }, // 그림자 원
    '[L2]': { symbol: '2022', spaces: 4, font_size: 12 }, // 작은 검은색 원
    '[L3]': { symbol: '2578', spaces: 6, font_size: 12 }, // 하이픈
  });

  const [tableBullets, setTableBullets] = useState<Record<string, BulletStyle>>({
    '일반': { symbol: '', spaces: 0, font_size: 11 },
    '[L1]': { symbol: '2022', spaces: 0, font_size: 11 }, // 작은 검은색 원
    '[L2]': { symbol: '2578', spaces: 2, font_size: 11 }, // 하이픈
  });

  if (!isOpen || !documentId) return null;

  const currentBaseStyle = activeTab === 'paragraph' ? paragraphBaseStyle : tableBaseStyle;
  const setBaseStyle = activeTab === 'paragraph' ? setParagraphBaseStyle : setTableBaseStyle;

  const handleBaseStyleChange = (key: keyof BaseStyle, value: any) => {
    setBaseStyle(prev => ({ ...prev, [key]: value }));
  };

  const currentBullets = activeTab === 'paragraph' ? paragraphBullets : tableBullets;
  const setCurrentBullets = activeTab === 'paragraph' ? setParagraphBullets : setTableBullets;

  const handleLevelChange = (level: string, key: 'symbol' | 'spaces' | 'font_size', value: string | number) => {
    setCurrentBullets((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [key]: value,
      },
    }));
  };

  const handleAddLevel = () => {
    const levelCount = Object.keys(currentBullets).filter(k => k.startsWith('[L')).length;
    const newLevelKey = `[L${levelCount + 1}]`;
    setCurrentBullets((prev) => ({
      ...prev,
      [newLevelKey]: { symbol: '2578', spaces: (levelCount + 1) * 2, font_size: 12 },
    }));
  };

  const handleRemoveLevel = (levelKey: string) => {
    if (levelKey === '일반') return; // 기본 텍스트는 삭제 불가
    setCurrentBullets((prev) => {
      const newObj = { ...prev };
      delete newObj[levelKey];
      return newObj;
    });
  };

  const handleSubmit = async () => {
    try {
      setIsGenerating(true);
      const payload: StyleConfig = {
        paragraph_base_style: paragraphBaseStyle,
        table_base_style: tableBaseStyle,
        paragraph_bullets: paragraphBullets,
        table_bullets: tableBullets,
      };
      await onGenerate(payload);
    } catch (error) {
      console.error('HWPX 생성 중 오류가 발생했습니다:', error);
    } finally {
      setIsGenerating(false);
      onClose();
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
        <div className="p-6 overflow-y-auto flex-1 space-y-7 custom-scrollbar">
          
          {/* Base Format Settings */}
          <div className="bg-gradient-to-br from-violet-50/80 to-blue-50/50 rounded-[18px] p-5 border border-violet-100/60 shadow-[inset_0_2px_10px_rgba(255,255,255,1)] flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white shadow-sm border border-violet-100 flex items-center justify-center shrink-0 text-violet-600">
                   <span className="material-symbols-outlined text-[16px]">{activeTab === 'paragraph' ? 'subject' : 'table'}</span>
                </div>
                <h3 className="text-[14px] font-black text-violet-900 tracking-wide">
                  {activeTab === 'paragraph' ? '본문 서식 설정' : '표 서식 설정'}
                </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
               <div className="flex flex-col gap-1.5">
                 <label className="text-[11px] font-bold text-violet-800/70 pl-1 uppercase">글꼴 (Font)</label>
                 <select 
                   value={currentBaseStyle.font_family}
                   onChange={(e) => handleBaseStyleChange('font_family', e.target.value)}
                   disabled={isGenerating}
                   className="text-[13px] font-bold text-violet-900 border border-violet-200/60 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-400 focus:ring focus:ring-violet-400/20 py-2 pl-3 bg-white hover:border-violet-300 transition-colors cursor-pointer outline-none"
                 >
                   <option value="휴먼명조">휴먼명조</option>
                   <option value="함초롬바탕">함초롬바탕</option>
                   <option value="맑은 고딕">맑은 고딕</option>
                   <option value="굴림">굴림</option>
                 </select>
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[11px] font-bold text-violet-800/70 pl-1 uppercase">줄간격 (%)</label>
                 <input 
                   type="number"
                   value={currentBaseStyle.line_spacing}
                   onChange={(e) => handleBaseStyleChange('line_spacing', parseInt(e.target.value) || 160)}
                   disabled={isGenerating}
                   className="text-[13px] font-bold text-violet-900 border border-violet-200/60 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-400 focus:ring focus:ring-violet-400/20 py-2 px-3 bg-white hover:border-violet-300 transition-colors outline-none"
                 />
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[11px] font-bold text-violet-800/70 pl-1 uppercase">문단 정렬</label>
                 <select 
                   value={currentBaseStyle.alignment}
                   onChange={(e) => handleBaseStyleChange('alignment', e.target.value)}
                   disabled={isGenerating}
                   className="text-[13px] font-bold text-violet-900 border border-violet-200/60 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-400 focus:ring focus:ring-violet-400/20 py-2 pl-3 bg-white hover:border-violet-300 transition-colors cursor-pointer outline-none"
                 >
                   <option value="Justify">양쪽 정렬</option>
                   <option value="Left">왼쪽 정렬</option>
                   <option value="Center">가운데 정렬</option>
                   <option value="Right">오른쪽 정렬</option>
                 </select>
               </div>
            </div>
          </div>

          {/* Dynamic Bullets Settings with Tabs */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-end mb-2 px-1">
              <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl">
                 <button 
                   onClick={() => setActiveTab('paragraph')}
                   className={`px-4 py-1.5 rounded-lg text-[13px] font-black transition-all ${activeTab === 'paragraph' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] text-primary' : 'text-outline hover:text-on-surface'}`}
                 >
                   본문 설정
                 </button>
                 <button 
                   onClick={() => setActiveTab('table')}
                   className={`px-4 py-1.5 rounded-lg text-[13px] font-black transition-all ${activeTab === 'table' ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] text-primary' : 'text-outline hover:text-on-surface'}`}
                 >
                   표 설정
                 </button>
              </div>

              <button
                onClick={handleAddLevel}
                disabled={isGenerating}
                className="text-[12px] font-bold text-white bg-primary px-3.5 py-1.5 rounded-full hover:bg-primary-dark hover:shadow-md hover:-translate-y-0.5 flex items-center gap-1 disabled:opacity-50 transition-all active:translate-y-0 active:shadow-sm"
              >
                <span className="material-symbols-outlined text-[15px] font-bold">add</span>
                단계 추가
              </button>
            </div>
            
            <div className="space-y-4 animate-in fade-in duration-200" key={activeTab}>
              {Object.entries(currentBullets).map(([level, config]) => (
                <div key={level} className="group flex flex-col sm:flex-row items-center gap-4 bg-white border border-outline-variant/20 rounded-2xl p-4 transition-all hover:border-violet-300 hover:shadow-[0_4px_20px_rgba(139,92,246,0.08)] relative">
                  <div className={`rounded-xl px-4 py-2 text-[14px] font-black min-w-[70px] text-center flex items-center justify-center shadow-sm border ${level === '일반' ? 'bg-gradient-to-br from-fuchsia-50 to-pink-50 border-fuchsia-200/60 text-fuchsia-800' : 'bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-200/60 text-violet-800'}`}>
                    {level}
                  </div>
                  
                  <div className="flex-1 flex flex-wrap gap-5 items-center w-full sm:-ml-2 sm:pl-4 sm:border-l border-outline-variant/10">
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] uppercase tracking-wider text-outline font-black whitespace-nowrap">글자 크기 (pt)</label>
                      <input
                        type="number"
                        min="1"
                        max="72"
                        disabled={isGenerating}
                        value={config.font_size}
                        onChange={(e) => handleLevelChange(level, 'font_size', parseInt(e.target.value) || 12)}
                        className="w-[60px] text-[15px] font-mono font-bold text-on-surface border border-outline-variant/30 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-500 focus:ring focus:ring-violet-500/20 py-2 px-3 disabled:bg-surface-container disabled:text-outline transition-all text-center hover:border-outline outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-[11px] uppercase tracking-wider text-outline font-black whitespace-nowrap">글머리 기호</label>
                      <select
                        value={config.symbol}
                        disabled={isGenerating || level === '일반'}
                        onChange={(e) => handleLevelChange(level, 'symbol', e.target.value)}
                        className="text-[14px] font-medium text-on-surface border border-outline-variant/30 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-500 focus:ring focus:ring-violet-500/20 py-2 pl-4 pr-10 bg-white disabled:bg-surface-container disabled:text-outline transition-all cursor-pointer hover:border-outline outline-none"
                      >
                        <option value="">없음</option>
                        <option value="274D">❍ (그림자 원)</option>
                        <option value="2751">❑ (그림자 네모)</option>
                        <option value="F06C">● (검은색 원)</option>
                        <option value="F06E">■ (검은색 네모)</option>
                        <option value="2022">• (작은 검은색 원)</option>
                        <option value="25AA">▪ (작은 검은색 네모)</option>
                        <option value="25E6">◦ (작은 투명 원)</option>
                        <option value="25AB">▫ (작은 투명 네모)</option>
                        <option value="2578">⁃ (하이픈)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-[11px] uppercase tracking-wider text-outline font-black whitespace-nowrap">들여쓰기 횟수</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        disabled={isGenerating}
                        value={config.spaces}
                        onChange={(e) => handleLevelChange(level, 'spaces', parseInt(e.target.value) || 0)}
                        className="w-[72px] text-[15px] font-mono font-bold text-on-surface border border-outline-variant/30 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.02)] focus:border-violet-500 focus:ring focus:ring-violet-500/20 py-2 px-3 disabled:bg-surface-container disabled:text-outline transition-all text-center hover:border-outline outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveLevel(level)}
                    disabled={isGenerating || level === '일반'}
                    className={`w-9 h-9 flex items-center justify-center rounded-xl bg-error/5 text-error/60 hover:bg-error hover:text-white transition-all sm:opacity-0 group-hover:opacity-100 absolute top-2 right-2 sm:relative sm:top-auto sm:right-auto ${level === '일반' ? 'hidden' : ''}`}
                    title="해당 단계 삭제"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
            
            <p className="text-[12px] font-bold text-outline mt-3 flex items-center gap-1.5 px-2">
              <span className="material-symbols-outlined text-[16px] text-secondary">lightbulb</span>
              미리보기: 들여쓰기 1은 스페이스바 1칸을 의미합니다. (표 내부는 가로폭이 좁아 적은 들여쓰기를 권장합니다.)
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

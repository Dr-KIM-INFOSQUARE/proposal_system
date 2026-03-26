import React, { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible }) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    "문서 포맷 확인 및 텍스트 추출 중...", // 0~5s
    "표 및 이미지 요소 분리 중...",              // 5~20s
    "AI가 문서의 계층 구조를 추론하고 있습니다...", // 20~40s
    "최종 트리 데이터를 생성 중입니다..."      // 40s~
  ];

  useEffect(() => {
    if (!isVisible) {
      setMessageIndex(0);
      return;
    }

    const start = Date.now();
    const timers = [
      setTimeout(() => setMessageIndex(1), 5000),
      setTimeout(() => setMessageIndex(2), 20000),
      setTimeout(() => setMessageIndex(3), 40000),
    ];

    return () => timers.forEach(t => clearTimeout(t));
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface/80 backdrop-blur-md transition-all duration-500">
      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          50% { transform: translateY(80px); }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
      `}</style>
      
      <div className="bg-surface-container-lowest p-10 rounded-3xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)] flex flex-col items-center max-w-md w-full border border-outline-variant/20 mx-4 relative overflow-hidden">
        {/* 장식용 배경 광원 */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-secondary/5 rounded-full blur-3xl"></div>

        {/* 스캐닝 애니메이션 영역 */}
        <div className="relative w-24 h-24 mb-10 group">
          {/* 문서 아이콘 */}
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container-high rounded-2xl border border-outline-variant/30 shadow-inner overflow-hidden">
            <span className="material-symbols-outlined text-5xl text-primary/40 select-none">description</span>
            
            {/* 스캔 라인 */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_rgba(var(--primary-rgb),0.8)] animate-scan z-10"></div>
            
            {/* 내부 장식 줄무늬 */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 4px, currentColor 4px, currentColor 5px)' }}></div>
          </div>
          
          {/* 외곽 회전 링 */}
          <div className="absolute -inset-3 border-2 border-dashed border-primary/20 rounded-3xl animate-[spin_20s_linear_infinite]"></div>
        </div>
        
        <div className="text-center space-y-3 relative z-10">
          <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight">AI 엔진 분석 중</h3>
          <div className="h-6 flex items-center justify-center">
            <p className="text-sm font-medium text-primary animate-pulse transition-all duration-500 ease-in-out">
              {messages[messageIndex]}
            </p>
          </div>
          <p className="text-[11px] text-outline mt-4 uppercase tracking-[0.2em] font-bold opacity-60">
            Generating intelligent structure
          </p>
        </div>

        {/* 하단 점진적 로딩 바 (장식용) */}
        <div className="w-full mt-8 h-1 bg-surface-container rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-[loading_2s_infinite_ease-in-out]" style={{ width: '30%' }}></div>
        </div>
        
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    </div>
  );
};

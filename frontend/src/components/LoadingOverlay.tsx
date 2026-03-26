import React, { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isVisible) {
      setProgress(0);
      // 실제 소요시간(약 30~45초)을 반영하여 95%까지 서서히 차오르도록 시뮬레이션
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          // 구간별 증가 폭: 예상 대기 시간에 맞춰 대폭 하향 조정
          const increment = prev < 60 ? 2 : prev < 85 ? 0.8 : 0.3;
          return prev + increment;
        });
      }, 500);
    } else {
      // When invisible, jump to 100
      setProgress(100);
    }
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full border border-outline-variant/20 mx-4">
        <div className="relative w-16 h-16 mb-6">
          <svg className="animate-spin w-full h-full text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25 text-primary-fixed" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-primary font-bold text-sm">
            AI
          </div>
        </div>
        
        <h3 className="text-xl font-headline font-bold text-on-surface mb-2">문서 구조 분석 중</h3>
        <p className="text-sm text-outline text-center mb-6">
          Gemini AI가 업로드된 양식의 복잡한 표와 계층 구조를<br />
          꼼꼼하게 파싱하고 있습니다. 잠시만 기다려주세요...
        </p>
        
        <div className="w-full bg-surface-container-high rounded-full h-2.5 mb-2 overflow-hidden">
          <div 
            className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="w-full flex justify-between text-xs text-outline font-medium">
          <span>진행률</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
};

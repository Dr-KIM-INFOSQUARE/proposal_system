import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { 
  ComposedChart,
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Brush,
  Legend
} from 'recharts';

interface UsageSummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost_usd: number;
  by_task?: {
    [key: string]: {
      input_tokens: number;
      output_tokens: number;
      usd: number;
      calls: number;
    }
  };
}

interface UsageLog {
  id: number;
  document_id: string;
  model_id: string;
  task_type?: string;
  input_tokens: number;
  output_tokens: number;
  cost: {
    usd: number;
    input_usd: number;
    output_usd: number;
    unit: string;
  };
  timestamp: string;
}

type TimeUnit = 'hour' | 'day' | 'month' | 'quarter' | 'year';

export const BillingView: React.FC = () => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState<'USD' | 'KRW'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1504.72); // 최신 고시 환율 반영
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState<string>("1504.72");

  // 레이아웃 제어 (접기/펼치기)
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [isTableOpen, setIsTableOpen] = useState(true);
  
  // 기간 필터
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // 그래프 시간 단위
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('day');

  useEffect(() => {
    loadUsageData();
    fetchExchangeRate();
  }, []);

  const fetchExchangeRate = async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.rates && data.rates.KRW) {
        setExchangeRate(data.rates.KRW);
        setTempRate(data.rates.KRW.toString());
      }
    } catch (err) {
      console.error("Failed to fetch exchange rate", err);
    }
  };

  const handleRateUpdate = () => {
    const newRate = parseFloat(tempRate);
    if (!isNaN(newRate) && newRate > 0) {
      setExchangeRate(newRate);
      setIsEditingRate(false);
    }
  };

  const loadUsageData = async () => {
    try {
      setIsLoading(true);
      const res = await api.getUsage();
      setSummary(res.summary);
      setLogs(res.logs);
    } catch (err) {
      console.error("Failed to load usage data", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLog = async (id: number) => {
    if (!window.confirm("해당 분석 이력을 삭제하시겠습니까?")) return;
    try {
      await api.deleteUsageLog(id);
      loadUsageData();
    } catch (err) {
      alert("삭제 실패: " + err);
    }
  };

  const formatPriceValue = (usd: number) => {
    if (currency === 'KRW') {
      return usd * exchangeRate;
    }
    return usd;
  };

  const formatPrice = (usd: number) => {
    const val = formatPriceValue(usd);
    if (currency === 'KRW') {
      return `₩${Math.round(val).toLocaleString()}`;
    }
    return `$${val.toFixed(val < 0.01 ? 6 : 4)}`;
  };

  const getTaskTypeName = (type: string | undefined) => {
    if (type === 'analysis') return '문서 구조 분석';
    if (type === 'idea_enhance') return '사업 아이디어 구축';
    if (type === 'proposal_write') return '사업계획서 작성';
    return type || '알 수 없음';
  };

  // 필터링된 로그
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const logDate = log.timestamp.split(' ')[0];
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;
      return true;
    });
  }, [logs, startDate, endDate]);

  // 차트 데이터 가공 (빈 시간대 채우기 및 연속성 확보)
  const chartData = useMemo(() => {
    if (logs.length === 0) return [];

    const groups: Record<string, { name: string; cost: number; calls: number; inCost: number; outCost: number }> = {};
    
    // 1. 실제 데이터 집계
    filteredLogs.forEach(log => {
      let key = "";
      const date = new Date(log.timestamp.replace(' ', 'T'));
      if (isNaN(date.getTime())) return;

      switch(timeUnit) {
        case 'hour': key = log.timestamp.substring(0, 13) + ":00"; break;
        case 'day': key = log.timestamp.substring(0, 10); break;
        case 'month': key = log.timestamp.substring(0, 7); break;
        case 'quarter': 
          const q = Math.floor(date.getMonth() / 3) + 1;
          key = `${date.getFullYear()} Q${q}`;
          break;
        case 'year': key = `${date.getFullYear()}`; break;
      }
      
      const inCost = formatPriceValue(log.cost.input_usd);
      const outCost = formatPriceValue(log.cost.output_usd);

      if (!groups[key]) {
        groups[key] = { name: key, cost: 0, calls: 0, inCost: 0, outCost: 0 };
      }
      groups[key].inCost += inCost;
      groups[key].outCost += outCost;
      groups[key].cost += (inCost + outCost);
      groups[key].calls += 1;
    });

    // 2. 빈 기간 채우기 (연속성 확보 및 고정 범위 설정)
    const sortedLogsByTime = [...logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sortedLogsByTime.length === 0) return [];

    const firstLogTime = new Date(sortedLogsByTime[0].timestamp.replace(' ', 'T'));
    
    let startTime = startDate ? new Date(startDate) : new Date(firstLogTime);
    let endTime = endDate ? new Date(endDate) : new Date();

    // 보기 편하게 기간 보정 (단 한 개만 나오지 않도록)
    if (!startDate && !endDate) {
       switch(timeUnit) {
         case 'hour': // 최근 24시간
           startTime = new Date();
           startTime.setHours(startTime.getHours() - 24);
           break;
         case 'day': // 최근 14일
           startTime = new Date();
           startTime.setDate(startTime.getDate() - 14);
           break;
         case 'month': // 올해 전체
           startTime = new Date(new Date().getFullYear(), 0, 1);
           endTime = new Date(new Date().getFullYear(), 11, 31);
           break;
         case 'quarter': // 최근 2년
           startTime = new Date();
           startTime.setFullYear(startTime.getFullYear() - 2);
           break;
       }
    }
    
    // 시작 알맞게 조정
    if (timeUnit === 'hour') startTime.setMinutes(0,0,0);
    else startTime.setHours(0,0,0,0);

    const result: { name: string; cost: number; calls: number; inCost: number; outCost: number }[] = [];
    const current = new Date(startTime);

    // 루프 안전 장치 (만기일 또는 최대 2000개 데이터 포인트)
    const safetyLimitDate = new Date(endTime);
    safetyLimitDate.setDate(safetyLimitDate.getDate() + 1);

    while (current <= safetyLimitDate) {
      let key = "";
      let label = "";
      
      switch(timeUnit) {
        case 'hour':
          key = current.toISOString().substring(0, 13).replace('T', ' ') + ":00";
          label = `${current.getHours()}시`;
          current.setHours(current.getHours() + 1);
          break;
        case 'day':
          key = current.toISOString().substring(0, 10);
          label = `${current.getMonth()+1}/${current.getDate()}`;
          current.setDate(current.getDate() + 1);
          break;
        case 'month':
          key = current.toISOString().substring(0, 7);
          label = `${current.getMonth()+1}월`;
          current.setMonth(current.getMonth() + 1);
          break;
        case 'quarter':
          const q = Math.floor(current.getMonth() / 3) + 1;
          key = `${current.getFullYear()} Q${q}`;
          label = `${current.getFullYear()} Q${q}`;
          current.setMonth(current.getMonth() + 3);
          break;
        case 'year':
          key = `${current.getFullYear()}`;
          label = `${current.getFullYear()}년`;
          current.setFullYear(current.getFullYear() + 1);
          break;
      }

      result.push({
        name: label,
        inCost: groups[key] ? groups[key].inCost : 0,
        outCost: groups[key] ? groups[key].outCost : 0,
        cost: groups[key] ? groups[key].cost : 0,
        calls: groups[key] ? groups[key].calls : 0
      });

      if (result.length > 2000) break;
    }

    return result;
  }, [logs, filteredLogs, timeUnit, currency, exchangeRate, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-fade-in pb-32">
      <header className="mb-10 flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <h2 className="text-3xl font-headline font-bold text-on-surface mb-2 tracking-tight">API 사용량 및 비용 관리</h2>
          <div className="flex flex-wrap items-center gap-3">
             <p className="text-outline-variant font-medium text-sm">Gemini AI 모델별 토큰 사용량과 예상 청구 금액을 확인하세요.</p>
             <div className="h-4 w-[1px] bg-outline-variant/30 hidden md:block"></div>
             
             <div className="flex items-center gap-2">
                {isEditingRate ? (
                   <div className="flex items-center gap-1 animate-scale-in">
                      <input 
                         type="text" 
                         value={tempRate} 
                         onChange={(e) => setTempRate(e.target.value)}
                         className="w-20 px-2 py-1 text-xs font-bold bg-surface border border-primary rounded-lg focus:outline-none"
                         autoFocus
                      />
                      <button onClick={handleRateUpdate} className="p-1 text-primary hover:bg-primary/10 rounded">
                         <span className="material-symbols-outlined text-xs">check</span>
                      </button>
                      <button onClick={() => setIsEditingRate(false)} className="p-1 text-outline hover:bg-surface-container rounded">
                         <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                   </div>
                ) : (
                   <div className="flex items-center gap-1">
                      <div 
                          onClick={() => { setIsEditingRate(true); setTempRate(exchangeRate.toString()); }}
                          className="bg-surface-container-high/50 px-3 py-1 rounded-full border border-outline-variant/20 flex items-center gap-2 cursor-pointer hover:bg-primary/5 transition-colors group shadow-sm"
                      >
                          <span className="text-[10px] font-bold text-outline uppercase tracking-wider">적용 환율:</span>
                          <span className="text-xs font-black text-primary">1 USD = {exchangeRate.toLocaleString()} KRW</span>
                          <span className="material-symbols-outlined text-[10px] text-outline group-hover:text-primary transition-colors">edit</span>
                      </div>
                      <button onClick={fetchExchangeRate} className="p-1 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-all">
                        <span className="material-symbols-outlined text-sm">sync</span>
                      </button>
                   </div>
                )}
             </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* 기간 필터 섹션 */}
            <div className="flex items-center bg-surface-container-low px-4 py-2 rounded-2xl border border-outline-variant/15 gap-4 shadow-sm hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-2">
                   <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-lg">calendar_month</span>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-outline-variant uppercase tracking-tighter leading-none mb-1">시작일</span>
                      <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-xs font-bold text-on-surface focus:outline-none appearance-none cursor-pointer"
                      />
                   </div>
                </div>
                
                <div className="h-6 w-[1px] bg-outline-variant/30"></div>
                
                <div className="flex flex-col">
                   <span className="text-[9px] font-black text-outline-variant uppercase tracking-tighter leading-none mb-1">종료일</span>
                   <input 
                     type="date" 
                     value={endDate} 
                     onChange={(e) => setEndDate(e.target.value)}
                     className="bg-transparent text-xs font-bold text-on-surface focus:outline-none appearance-none cursor-pointer"
                   />
                </div>

                {(startDate || endDate) && (
                   <button 
                      onClick={() => {setStartDate(""); setEndDate("");}} 
                      className="ml-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-error/10 text-outline-variant hover:text-error transition-all"
                      title="필터 초기화"
                   >
                      <span className="material-symbols-outlined text-sm">close</span>
                   </button>
                )}
            </div>

            {/* 컨트롤 그룹 */}
            <div className="flex items-center gap-3">
               {/* 통화 전환 */}
               <div className="bg-surface-container-low p-1 rounded-2xl border border-outline-variant/15 flex shadow-sm">
                   <button 
                      onClick={() => setCurrency('USD')} 
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${currency === 'USD' ? 'bg-primary text-white shadow-md' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                   >
                      USD
                   </button>
                   <button 
                      onClick={() => setCurrency('KRW')} 
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${currency === 'KRW' ? 'bg-primary text-white shadow-md' : 'text-outline hover:text-on-surface hover:bg-surface-container-high'}`}
                   >
                      KRW
                   </button>
               </div>

               <button 
                  onClick={loadUsageData} 
                  className="flex items-center justify-center w-12 h-12 bg-primary text-white rounded-2xl hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-90 group relative"
                  title="데이터 새로고침"
               >
                  <span className="material-symbols-outlined group-hover:rotate-180 transition-transform duration-500">refresh</span>
               </button>
            </div>
        </div>
      </header>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5 opacity-80">누적 예상 비용</p>
          <p className="text-4xl font-headline font-black text-primary tracking-tighter">
            {formatPrice(summary?.total_estimated_cost_usd || 0)}
          </p>
          <p className="text-[10px] text-primary/60 mt-2 font-medium">전체 기간 누적 합계</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant/10 p-6 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-1.5">선택 기간 분석 횟수</p>
          <p className="text-3xl font-headline font-bold text-on-surface">{filteredLogs.length}회</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant/10 p-6 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-1.5">선택 기간 총 입력</p>
          <p className="text-2xl font-headline font-bold text-on-surface">
            {filteredLogs.reduce((acc, log) => acc + log.input_tokens, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant/10 p-6 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-outline uppercase tracking-widest mb-1.5">선택 기간 총 출력</p>
          <p className="text-2xl font-headline font-bold text-on-surface">
            {filteredLogs.reduce((acc, log) => acc + log.output_tokens, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* 작업별 집계 (Summary) */}
      {summary?.by_task && (
        <div className="mb-12">
           <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary">pie_chart</span>
              <h3 className="text-lg font-bold text-on-surface">작업별 누적 비용 현황</h3>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {Object.entries(summary.by_task).map(([taskType, data]) => (
                <div key={taskType} className="bg-surface-container-low border border-outline-variant/10 p-5 rounded-2xl shadow-sm hover:border-primary/30 transition-colors">
                   <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                         <span className="material-symbols-outlined text-sm">
                            {taskType === 'analysis' ? 'document_scanner' : taskType === 'idea_enhance' ? 'lightbulb' : 'edit_document'}
                         </span>
                      </div>
                      <h4 className="font-bold text-on-surface text-sm">{getTaskTypeName(taskType)}</h4>
                   </div>
                   <div className="space-y-2">
                       <div className="flex justify-between items-end">
                          <span className="text-xs text-outline font-medium">비용</span>
                          <span className="text-xl font-headline font-black text-secondary tracking-tight">{formatPrice(data.usd)}</span>
                       </div>
                       <div className="flex justify-between items-center pt-2 border-t border-outline-variant/10">
                          <span className="text-[10px] text-outline uppercase font-bold tracking-widest">호출 횟수</span>
                          <span className="text-xs font-bold text-on-surface">{data.calls.toLocaleString()}회</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] text-outline uppercase font-bold tracking-widest">총 토큰</span>
                          <span className="text-xs font-bold text-on-surface">{(data.input_tokens + data.output_tokens).toLocaleString()}</span>
                       </div>
                   </div>
                </div>
             ))}
           </div>
        </div>
      )}

      {/* 차트 영역 */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">bar_chart</span>
              <h3 className="text-lg font-bold text-on-surface">사용량 트렌드 분석</h3>
              <div className="flex bg-surface-container px-2 py-1 rounded-lg gap-1">
                 {(['hour', 'day', 'month', 'quarter', 'year'] as TimeUnit[]).map(unit => (
                    <button 
                      key={unit}
                      onClick={() => setTimeUnit(unit)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${timeUnit === unit ? 'bg-white shadow-sm text-primary' : 'text-outline-variant hover:text-outline'}`}
                    >
                      {unit === 'hour' ? '시간별' : unit === 'day' ? '일별' : unit === 'month' ? '월별' : unit === 'quarter' ? '분기별' : '연도별'}
                    </button>
                 ))}
              </div>
           </div>
           <button 
              onClick={() => setIsChartOpen(!isChartOpen)}
              className="w-8 h-8 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-container-highest transition-all"
           >
              <span className={`material-symbols-outlined text-outline transition-transform duration-300 ${isChartOpen ? 'rotate-180' : ''}`}>expand_more</span>
           </button>
        </div>
        
        {isChartOpen && (
           <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10 h-[400px] shadow-sm animate-expand-vertical origin-top overflow-hidden">
             {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                       <defs>
                          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#386BF5" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#386BF5" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.1}/>
                          </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                       <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#8C9199', fontSize: 10, fontWeight: 600 }}
                          dy={10}
                          minTickGap={20}
                       />
                       {/* 비용 Y축 (좌측) */}
                       <YAxis 
                          yAxisId="left"
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#8C9199', fontSize: 10, fontWeight: 600 }}
                          tickFormatter={(val) => {
                             if (currency === 'KRW') {
                                return `₩${Math.round(val).toLocaleString()}`;
                             }
                             return `$${val.toFixed(2)}`;
                          }}
                       />
                       {/* 분석 횟수 Y축 (우측) */}
                       <YAxis 
                          yAxisId="right"
                          orientation="right"
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#386BF5', fontSize: 10, fontWeight: 700 }}
                          tickFormatter={(val) => `${val}회`}
                       />
                       <Tooltip 
                          cursor={{ fill: 'rgba(56, 107, 245, 0.05)', radius: 8 }}
                          contentStyle={{ backgroundColor: '#191C1E', border: 'none', borderRadius: '12px', padding: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                          labelStyle={{ color: '#E1E2E5', fontSize: '13px', fontWeight: 900, marginBottom: '8px' }}
                          itemStyle={{ fontSize: '11px', fontWeight: 700, padding: '2px 0' }}
                           formatter={(value: any, name: any) => {
                              if (String(name).includes('비용')) return [formatPrice(Number(value)), name];
                              return [`${value}회`, name];
                           }}
                       />
                       <Legend 
                          verticalAlign="top" 
                          align="right" 
                          height={36} 
                          iconType="circle"
                          wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '10px' }}
                       />
                       <Bar 
                          yAxisId="left"
                          name="입력(Input) 비용"
                          dataKey="inCost" 
                          stackId="cost"
                          fill="url(#colorIn)"
                          maxBarSize={40}
                          radius={[0, 0, 0, 0]}
                       />
                       <Bar 
                          yAxisId="left"
                          name="출력(Output) 비용"
                          dataKey="outCost" 
                          stackId="cost"
                          fill="url(#colorOut)"
                          maxBarSize={40}
                          radius={[6, 6, 0, 0]}
                       />
                       <Line 
                          yAxisId="right"
                          name="분석 빈도(Calls)"
                          type="monotone" 
                          dataKey="calls" 
                          stroke="#386BF5" 
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#386BF5', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                       />
                       {chartData.length > 10 && (
                        <Brush 
                          dataKey="name" 
                          height={20} 
                          stroke="#386BF5" 
                          fill="#191C1E"
                          travellerWidth={10}
                          startIndex={Math.max(0, chartData.length - 30)}
                        />
                      )}
                    </ComposedChart>
                </ResponsiveContainer>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-outline-variant gap-4">
                   <div className="w-16 h-16 bg-surface-container-highest/30 rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl opacity-20">analytics</span>
                   </div>
                   <p className="text-xs font-semibold uppercase tracking-widest">데이터가 부족합니다</p>
                </div>
             )}
           </div>
        )}
      </div>

      {/* 사용 이력 테이블 */}
      <div>
        <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">history</span>
                <h3 className="text-lg font-bold text-on-surface">최근 분석 상세 보고서</h3>
                <div className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                    전체 {filteredLogs.length}건
                </div>
             </div>
             <button 
                onClick={() => setIsTableOpen(!isTableOpen)}
                className="w-8 h-8 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-container-highest transition-all"
             >
                <span className={`material-symbols-outlined text-outline transition-transform duration-300 ${isTableOpen ? 'rotate-180' : ''}`}>expand_more</span>
             </button>
        </div>

        {isTableOpen && (
           <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm animate-expand-vertical origin-top">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm table-fixed min-w-[1000px]">
                  <thead>
                    <tr className="bg-surface-container-high/30 text-outline uppercase text-[10px] font-bold tracking-wider">
                      <th className="px-6 py-4 w-44">일시</th>
                      <th className="px-6 py-4 w-44 whitespace-nowrap">분석 단계</th>
                      <th className="px-6 py-4">사용 모델</th>
                      <th className="px-6 py-4 w-28 whitespace-nowrap">입력 토큰</th>
                      <th className="px-6 py-4 w-28 whitespace-nowrap">출력 토큰</th>
                      <th className="px-6 py-4 w-52">예상 비용 (단위: {currency})</th>
                      <th className="px-4 py-4 w-16 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {filteredLogs.length > 0 ? filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4 text-on-surface-variant font-medium text-xs whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="px-6 py-4 text-[10px] font-bold text-primary uppercase tracking-wide whitespace-nowrap">
                          {getTaskTypeName(log.task_type)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-surface-container-highest text-primary text-[10px] font-bold rounded-lg border border-primary/10">
                            {log.model_id.replace('models/', '')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-outline font-medium">{log.input_tokens.toLocaleString()}</td>
                        <td className="px-6 py-4 text-outline font-medium">{log.output_tokens.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                              <span className="text-secondary font-black tracking-tight text-base">{formatPrice(log.cost.usd)}</span>
                              <span className="text-[9px] text-outline-variant font-medium opacity-70">
                                  In: {formatPrice(log.cost.input_usd)} | Out: {formatPrice(log.cost.output_usd)}
                              </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            title="로그 삭제"
                            onClick={() => handleDeleteLog(log.id)}
                            className="w-8 h-8 flex items-center justify-center text-error opacity-50 hover:opacity-100 hover:bg-error/10 rounded-full transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                         <td colSpan={7} className="px-6 py-20 text-center text-outline">
                            조건에 맞는 분석 이력이 없습니다.
                         </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, Settings, RefreshCw, Heart, AlertCircle } from 'lucide-react';

/**
 * 가우스 함수 (Gaussian Function)
 * 특정 시간 t에서의 파형 높이를 반환합니다.
 * @param {number} t - 현재 시간
 * @param {number} center - 파형의 중심 시간 (offset)
 * @param {number} amp - 파형의 진폭 (Amplitude)
 * @param {number} width - 파형의 너비 (Standard Deviation)
 */
const gaussian = (t, center, amp, width) => {
  if (width === 0) return 0;
  return amp * Math.exp(-Math.pow(t - center, 2) / (2 * width * width));
};

// 문서 내용을 바탕으로 한 프리셋 설정
const PRESETS = {
  NORMAL: {
    label: "정상 동성 리듬 (Normal Sinus Rhythm)",
    description: "규칙적인 P-QRS-T 파형. 심박수 60-100bpm.",
    params: { bpm: 75, pAmp: 0.15, pWidth: 0.04, qAmp: -0.15, rAmp: 1.2, sAmp: -0.25, tAmp: 0.3, tWidth: 0.08, uAmp: 0, noise: 0.02, irregularity: 0, stElevation: 0 }
  },
  TACHYCARDIA: {
    label: "동성 빈맥 (Sinus Tachycardia)",
    description: "정상 파형이나 심박수가 100bpm 이상으로 빠름.",
    params: { bpm: 130, pAmp: 0.15, pWidth: 0.03, qAmp: -0.15, rAmp: 1.2, sAmp: -0.25, tAmp: 0.3, tWidth: 0.06, uAmp: 0, noise: 0.02, irregularity: 0, stElevation: 0 }
  },
  BRADYCARDIA: {
    label: "동성 서맥 (Sinus Bradycardia)",
    description: "정상 파형이나 심박수가 60bpm 미만으로 느림.",
    params: { bpm: 45, pAmp: 0.15, pWidth: 0.04, qAmp: -0.15, rAmp: 1.2, sAmp: -0.25, tAmp: 0.3, tWidth: 0.08, uAmp: 0, noise: 0.02, irregularity: 0, stElevation: 0 }
  },
  AFIB: {
    label: "심방 세동 (Atrial Fibrillation)",
    description: "P파가 없고 불규칙한 기저선 떨림. RR 간격이 불규칙함.",
    params: { bpm: 90, pAmp: 0, pWidth: 0, qAmp: -0.1, rAmp: 1.0, sAmp: -0.2, tAmp: 0.2, tWidth: 0.08, uAmp: 0, noise: 0.15, irregularity: 0.8, stElevation: 0 }
  },
  PVC: {
    label: "심실 조기 수축 (PVC)",
    description: "조기 박동 발생, P파 소실, 넓은 QRS. (시뮬레이션상 불규칙성으로 표현)",
    params: { bpm: 80, pAmp: 0.1, pWidth: 0.04, qAmp: -0.2, rAmp: 1.3, sAmp: -0.4, tAmp: 0.4, tWidth: 0.1, uAmp: 0, noise: 0.05, irregularity: 0.4, stElevation: 0 }
  },
  VTACH: {
    label: "심실 빈맥 (Ventricular Tachycardia)",
    description: "매우 빠르고 넓은 QRS 복합체. P파와 T파 구분이 어려움.",
    params: { bpm: 180, pAmp: 0, pWidth: 0, qAmp: 0, rAmp: 1.5, sAmp: -0.5, tAmp: 0, tWidth: 0, uAmp: 0, noise: 0.05, irregularity: 0.05, stElevation: 0, qrsWidthScale: 3.0 }
  },
  VFIB: {
    label: "심실 세동 (Ventricular Fibrillation)",
    description: "무질서하고 불규칙한 파형. 심정지 직전 단계.",
    params: { bpm: 0, pAmp: 0, pWidth: 0, qAmp: 0, rAmp: 0, sAmp: 0, tAmp: 0, tWidth: 0, uAmp: 0, noise: 0.4, irregularity: 1.0, stElevation: 0 }
  },
  HYPERKALEMIA: {
    label: "고칼륨혈증 (Hyperkalemia)",
    description: "뾰족하고 높은 T파(Tall T), P파 소실 또는 평탄화.",
    params: { bpm: 70, pAmp: 0.05, pWidth: 0.04, qAmp: -0.15, rAmp: 1.0, sAmp: -0.25, tAmp: 0.9, tWidth: 0.06, uAmp: 0, noise: 0.02, irregularity: 0, stElevation: 0 }
  },
  HYPOKALEMIA: {
    label: "저칼륨혈증 (Hypokalemia)",
    description: "T파 평탄화 및 U파 출현.",
    params: { bpm: 70, pAmp: 0.15, pWidth: 0.04, qAmp: -0.15, rAmp: 1.2, sAmp: -0.25, tAmp: 0.1, tWidth: 0.08, uAmp: 0.15, noise: 0.02, irregularity: 0, stElevation: 0 }
  },
  STEMI: {
    label: "심근경색 (ST Elevation)",
    description: "ST 분절의 상승 (J-point 상승).",
    params: { bpm: 80, pAmp: 0.15, pWidth: 0.04, qAmp: -0.3, rAmp: 1.0, sAmp: -0.1, tAmp: 0.4, tWidth: 0.08, uAmp: 0, noise: 0.02, irregularity: 0, stElevation: 0.3 }
  },
  ASYSTOLE: {
    label: "심장 무수축 (Asystole)",
    description: "거의 평탄한 선 (약간의 노이즈).",
    params: { bpm: 0, pAmp: 0, pWidth: 0, qAmp: 0, rAmp: 0, sAmp: 0, tAmp: 0, tWidth: 0, uAmp: 0, noise: 0.03, irregularity: 0, stElevation: 0 }
  }
};

export default function ECGSimulator() {
  const [selectedPreset, setSelectedPreset] = useState('NORMAL');
  const [params, setParams] = useState(PRESETS.NORMAL.params);
  const [data, setData] = useState([]);
  const [duration] = useState(4); // 4초 동안의 데이터

  // 프리셋 변경 시 파라미터 업데이트
  useEffect(() => {
    setParams(PRESETS[selectedPreset].params);
  }, [selectedPreset]);

  // 파라미터 변경 핸들러
  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  // ECG 데이터 생성 로직
  useEffect(() => {
    const generateData = () => {
      const samplingRate = 100; // Hz
      const totalPoints = duration * samplingRate;
      const newData = [];
      
      // 심박수(BPM)를 기반으로 비트 간격 계산 (초 단위)
      // 불규칙성(irregularity)이 있으면 간격이 랜덤하게 변함
      const baseInterval = params.bpm > 0 ? 60 / params.bpm : Infinity;
      
      let beatTimes = [];
      let currentTime = 0.2; // 첫 비트 시작점
      
      // 비트 발생 시간 미리 계산
      while (currentTime < duration + 1) { // 여유분 1초
        beatTimes.push(currentTime);
        
        // 다음 비트까지의 간격 계산
        let nextInterval = baseInterval;
        if (params.irregularity > 0) {
          // 불규칙성 추가 (심방세동 등)
          const variance = (Math.random() - 0.5) * 2 * params.irregularity * baseInterval * 0.5;
          nextInterval += variance;
        }
        currentTime += Math.max(0.2, nextInterval); // 최소 간격 0.2초
      }

      // 각 샘플링 포인트에 대해 전압 계산
      for (let i = 0; i < totalPoints; i++) {
        const t = i / samplingRate;
        let voltage = 0;

        // V-Fib이나 Asystole 같은 특수 상황 처리
        if (selectedPreset === 'VFIB') {
           // 불규칙한 사인파들의 합으로 세동 표현
           voltage = Math.sin(t * 30) * 0.2 + Math.sin(t * 45) * 0.15 + (Math.random() - 0.5) * params.noise;
        } else if (selectedPreset === 'ASYSTOLE') {
           voltage = (Math.random() - 0.5) * params.noise;
        } else {
          // 일반적인 리듬 (P-QRS-T 모델)
          // 현재 시간 t에 영향을 주는 모든 비트의 파형을 합산
          beatTimes.forEach(beatTime => {
            const dt = t - beatTime;
            
            // 유효 범위 내의 비트만 계산 (최적화)
            if (dt > -0.5 && dt < 1.0) {
              const qrsWidthMult = params.qrsWidthScale || 1.0;

              // P Wave (심방 탈분극) - R파보다 약 0.16초 전
              voltage += gaussian(dt, -0.16, params.pAmp, params.pWidth);
              
              // Q Wave (심실 중격 탈분극) - R파 직전
              voltage += gaussian(dt, -0.04 * qrsWidthMult, params.qAmp, 0.02 * qrsWidthMult);
              
              // R Wave (주 심실 탈분극) - 기준점 0
              voltage += gaussian(dt, 0, params.rAmp, 0.03 * qrsWidthMult);
              
              // S Wave (심실 기저부 탈분극) - R파 직후
              voltage += gaussian(dt, 0.04 * qrsWidthMult, params.sAmp, 0.03 * qrsWidthMult);
              
              // ST Segment & T Wave (심실 재분극)
              // ST Elevation 구현을 위해 S파 이후 T파 이전 구간을 들어올림
              if (params.stElevation !== 0 && dt > 0.08 && dt < 0.25) {
                 // 부드러운 ST 상승 곡선
                 const stShape = Math.exp(-Math.pow(dt - 0.15, 2) / (2 * 0.1 * 0.1));
                 voltage += params.stElevation * stShape;
              }

              // T Wave - R파보다 약 0.25초 후
              voltage += gaussian(dt, 0.25, params.tAmp, params.tWidth);

              // U Wave - T파 후 (저칼륨혈증 등)
              if (params.uAmp !== 0) {
                voltage += gaussian(dt, 0.45, params.uAmp, 0.06);
              }
            }
          });

          // 기본 노이즈 및 기저선 변동 추가
          voltage += (Math.random() - 0.5) * params.noise;
          
          // 심방세동(AFIB)의 경우 기저선이 심하게 떨림 (f-waves)
          if (selectedPreset === 'AFIB') {
             voltage += Math.sin(t * 50) * 0.05;
          }
        }

        newData.push({ time: t.toFixed(2), voltage: voltage });
      }
      setData(newData);
    };

    generateData();
  }, [params, duration, selectedPreset]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-white rounded-xl shadow-lg border border-gray-200">
      <div className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Activity className="text-red-500" />
          심전도(ECG) 수학적 시뮬레이터
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          문서 "심전도 - 나무위키"를 기반으로 파형을 수학적으로 생성합니다.
        </p>
      </div>

      {/* 그래프 영역 */}
      <div className="bg-gray-900 rounded-lg p-4 mb-6 relative h-80 border border-gray-700">
        {/* 모눈종이 효과 */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{ 
               backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)', 
               backgroundSize: '20px 20px' 
             }}>
        </div>
        
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="time" type="number" domain={[0, duration]} hide />
            <YAxis domain={[-1.5, 2.5]} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', color: '#fff' }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value) => [value.toFixed(3) + ' mV', 'Voltage']}
            />
            <Line 
              type="monotone" 
              dataKey="voltage" 
              stroke="#00ff00" 
              strokeWidth={2} 
              dot={false} 
              isAnimationActive={false} // 실시간 갱신을 위해 애니메이션 끔
            />
          </LineChart>
        </ResponsiveContainer>
        
        <div className="absolute top-4 right-4 text-green-500 font-mono text-sm flex flex-col items-end">
          <span>HR: {params.bpm} BPM</span>
          <span>SPEED: 25 mm/s</span>
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 왼쪽: 프리셋 선택 */}
        <div className="md:col-span-1 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-gray-700">
            <Heart className="w-5 h-5" />
            리듬 유형 선택
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setSelectedPreset(key)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-all border ${
                  selectedPreset === key 
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="font-bold text-gray-800">{preset.label}</div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-2">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 오른쪽: 파라미터 미세 조정 */}
        <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 font-semibold text-gray-700">
              <Settings className="w-5 h-5" />
              파라미터 미세 조정
            </div>
            <button 
              onClick={() => setParams(PRESETS[selectedPreset].params)}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
            >
              <RefreshCw className="w-3 h-3" />
              초기화
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {/* 심박수 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">심박수 (BPM): {params.bpm}</label>
              <input 
                type="range" min="0" max="250" step="1" 
                value={params.bpm} 
                onChange={(e) => handleParamChange('bpm', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* 불규칙성 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">불규칙성 (Arrhythmia): {params.irregularity}</label>
              <input 
                type="range" min="0" max="1" step="0.1" 
                value={params.irregularity} 
                onChange={(e) => handleParamChange('irregularity', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* P파 진폭 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">P파 높이 (Atrial): {params.pAmp}</label>
              <input 
                type="range" min="0" max="0.5" step="0.05" 
                value={params.pAmp} 
                onChange={(e) => handleParamChange('pAmp', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* T파 진폭 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">T파 높이 (Repolarization): {params.tAmp}</label>
              <input 
                type="range" min="-0.5" max="1.5" step="0.1" 
                value={params.tAmp} 
                onChange={(e) => handleParamChange('tAmp', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

             {/* U파 진폭 */}
             <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">U파 높이 (Hypokalemia): {params.uAmp}</label>
              <input 
                type="range" min="0" max="0.5" step="0.05" 
                value={params.uAmp} 
                onChange={(e) => handleParamChange('uAmp', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* ST 분절 상승 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ST 분절 상승 (Ischemia): {params.stElevation}</label>
              <input 
                type="range" min="-0.5" max="1.0" step="0.1" 
                value={params.stElevation} 
                onChange={(e) => handleParamChange('stElevation', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            
            {/* 노이즈 레벨 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">노이즈 (Artifacts): {params.noise}</label>
              <input 
                type="range" min="0" max="0.5" step="0.01" 
                value={params.noise} 
                onChange={(e) => handleParamChange('noise', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              이 시뮬레이터는 문서 내용을 바탕으로 한 수학적 모델입니다. 실제 의료 진단용으로 사용할 수 없습니다.
              파라미터를 조절하여 문서에 설명된 'R on T', '고칼륨혈증(Tall T)', '저칼륨혈증(U wave)' 등을 재현해볼 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useCallback } from 'react';
import { Image as ImageIcon, Sliders, Cpu, HelpCircle, Eye, Info, Maximize2, Minimize2 } from 'lucide-react';
import { CameraStream } from './components/CameraStream';
import { SnapshotUpload } from './components/SnapshotUpload';
import { SentenceBuilder } from './components/SentenceBuilder';
import { MetricsPanel } from './components/MetricsPanel';
import { ModelTrainingModal } from './components/ModelTrainingModal';
import { ASLGuideModal } from './components/ASLGuideModal';

export const App: React.FC = () => {
  // App Mode: Live Camera vs Snapshot / Upload
  const [appMode, setAppMode] = useState<'live' | 'snapshot'>('live');

  // Layout View Mode (Theater vs Split)
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);

  // Detection Parameters
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.75); // 75%
  const [debounceFrames, setDebounceFrames] = useState<number>(12); // 12 frames
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);

  // Sentence State
  const [sentence, setSentence] = useState<string>('');
  const [lastAddedChar, setLastAddedChar] = useState<string | null>(null);

  // Metrics State
  const [detectedChar, setDetectedChar] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [top3, setTop3] = useState<{ char: string; confidence: number }[]>([]);
  const [fps, setFps] = useState<number>(30);
  const [holdCount, setHoldCount] = useState<number>(0);

  // Modals
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);

  // Handle character append from debounced live camera or snapshot
  const handleSentenceAppend = useCallback((char: string) => {
    setSentence((prev) => prev + char);
    setLastAddedChar(char);
    setTimeout(() => setLastAddedChar(null), 1500);
  }, []);

  const handleGestureDetected = useCallback(
    (char: string | null, conf: number, topCandidates: { char: string; confidence: number }[]) => {
      setDetectedChar(char);
      setConfidence(conf);
      setTop3(topCandidates);
    },
    []
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* ---------------- Sidebar Controls ---------------- */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 p-5 flex flex-col justify-between flex-shrink-0 shadow-sm">
        <div className="space-y-6">
          {/* Logo & Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <img
              src="https://img.icons8.com/color/96/sign-language.png"
              alt="ASL Logo"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="font-extrabold text-slate-900 text-lg leading-tight">ASL Translator</h1>
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                Gesture Recognition
              </p>
            </div>
          </div>

          {/* Mode Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Select Mode
            </label>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setAppMode('live')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  appMode === 'live'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span>🔴 Live Camera Stream</span>
              </button>

              <button
                type="button"
                onClick={() => setAppMode('snapshot')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  appMode === 'snapshot'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <ImageIcon className="w-4 h-4 text-slate-500" />
                <span>📸 Snapshot / Upload Test</span>
              </button>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Layout Size / View Toggle */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Camera Viewport Size
            </label>
            <button
              type="button"
              onClick={() => setIsTheaterMode(!isTheaterMode)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                isTheaterMode
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2">
                {isTheaterMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                <span>{isTheaterMode ? 'Theater View (Full Width)' : 'Standard Split View'}</span>
              </span>
              <span className="text-[10px] font-normal uppercase bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {isTheaterMode ? 'Expanded' : 'Split'}
              </span>
            </button>
          </div>

          <hr className="border-slate-200" />

          {/* Detection Parameters */}
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Detection Parameters</span>
            </div>

            {/* Confidence Threshold Slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-medium text-slate-600">Confidence Threshold (%)</span>
                <span className="font-mono font-bold text-blue-700">
                  {(confidenceThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="99"
                step="5"
                value={Math.round(confidenceThreshold * 100)}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>40%</span>
                <span>99%</span>
              </div>
            </div>

            {/* Sentence Debounce Slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-medium text-slate-600">Sentence Debounce</span>
                <span className="font-mono font-bold text-blue-700">{debounceFrames} frames</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={debounceFrames}
                onChange={(e) => setDebounceFrames(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Number of consecutive frames a gesture must be held to register.
              </p>
            </div>

            {/* Show Hand Mesh Checkbox */}
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={showLandmarks}
                onChange={(e) => setShowLandmarks(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>Show Hand Mesh & Landmarks</span>
              </span>
            </label>
          </div>

          <hr className="border-slate-200" />

          {/* Quick Actions / Model Lab */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsTrainingModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-colors"
            >
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>🚀 Train Model with Dataset</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>📖 ASL Alphabet Guide</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer Info */}
        <div className="pt-6 border-t border-slate-100 text-[11px] text-slate-400">
          <p className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            <span>Wrist-Relative Scale Normalization</span>
          </p>
          <p className="mt-0.5">21 3D Landmarks • 63 Features</p>
        </div>
      </aside>

      {/* ---------------- Main Dashboard View ---------------- */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1700px] mx-auto w-full">
        {/* Main Header */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-blue-700 tracking-tight flex items-center gap-2">
              <span>🤟 Real-Time ASL Translation Engine</span>
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 font-normal">
              American Sign Language gesture recognition powered by MediaPipe, PyTorch MLP, and OpenCV.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm transition-all"
          >
            {isTheaterMode ? (
              <>
                <Minimize2 className="w-4 h-4 text-slate-500" />
                <span>Split View</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 text-blue-600" />
                <span>Expand Camera (Theater Mode)</span>
              </>
            )}
          </button>
        </div>

        {/* Debounced Sentence Builder Box */}
        <SentenceBuilder
          sentence={sentence}
          onSentenceChange={setSentence}
          lastAddedChar={lastAddedChar}
        />

        {/* Dynamic Layout: Theater Mode (Full Width Camera) vs Standard Split Mode (Large Camera + Side Metrics) */}
        {isTheaterMode ? (
          <div className="space-y-6">
            {/* Expanded Full-Width Camera Section */}
            <div className="w-full">
              {appMode === 'live' ? (
                <CameraStream
                  confidenceThreshold={confidenceThreshold}
                  debounceFrames={debounceFrames}
                  showLandmarks={showLandmarks}
                  onGestureDetected={handleGestureDetected}
                  onSentenceAppend={handleSentenceAppend}
                  onFpsUpdate={setFps}
                  onHoldCountUpdate={setHoldCount}
                  isTheaterMode={isTheaterMode}
                  onToggleTheaterMode={() => setIsTheaterMode(!isTheaterMode)}
                />
              ) : (
                <SnapshotUpload
                  onAddToSentence={handleSentenceAppend}
                  showLandmarks={showLandmarks}
                />
              )}
            </div>

            {/* Metrics Dashboard Below in Wide Multi-Column Card */}
            <div className="w-full">
              <MetricsPanel
                detectedChar={detectedChar}
                confidence={confidence}
                top3={top3}
                fps={fps}
                holdCount={holdCount}
                debounceFrames={debounceFrames}
                confidenceThreshold={confidenceThreshold}
                onOpenGuide={() => setIsGuideModalOpen(true)}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Camera Takes 8/12 Columns (Spacious & Large) */}
            <div className="lg:col-span-8 xl:col-span-8">
              {appMode === 'live' ? (
                <CameraStream
                  confidenceThreshold={confidenceThreshold}
                  debounceFrames={debounceFrames}
                  showLandmarks={showLandmarks}
                  onGestureDetected={handleGestureDetected}
                  onSentenceAppend={handleSentenceAppend}
                  onFpsUpdate={setFps}
                  onHoldCountUpdate={setHoldCount}
                  isTheaterMode={isTheaterMode}
                  onToggleTheaterMode={() => setIsTheaterMode(!isTheaterMode)}
                />
              ) : (
                <SnapshotUpload
                  onAddToSentence={handleSentenceAppend}
                  showLandmarks={showLandmarks}
                />
              )}
            </div>

            {/* Classification Metrics Dashboard in 4/12 Columns */}
            <div className="lg:col-span-4 xl:col-span-4">
              <MetricsPanel
                detectedChar={detectedChar}
                confidence={confidence}
                top3={top3}
                fps={fps}
                holdCount={holdCount}
                debounceFrames={debounceFrames}
                confidenceThreshold={confidenceThreshold}
                onOpenGuide={() => setIsGuideModalOpen(true)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ModelTrainingModal
        isOpen={isTrainingModalOpen}
        onClose={() => setIsTrainingModalOpen(false)}
      />

      <ASLGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
};

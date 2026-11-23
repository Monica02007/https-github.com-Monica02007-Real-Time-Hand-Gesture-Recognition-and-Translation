import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  FlipHorizontal,
  AlertCircle,
  RefreshCw,
  Play,
  Square,
  Maximize2,
  Minimize2,
  Expand,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { drawHandLandmarks, Landmark3D } from '../utils/landmarks';
import {
  classifyGesture,
  GesturePrediction,
  ASLClass,
  ASL_LETTERS,
  ASL_WORDS,
  formatSignForSentence,
  synthesizeHandSkeleton,
} from '../utils/model';

interface CameraStreamProps {
  confidenceThreshold: number;
  debounceFrames: number;
  showLandmarks: boolean;
  onGestureDetected: (
    char: string | null,
    confidence: number,
    top3: { char: string; confidence: number }[]
  ) => void;
  onSentenceAppend: (char: string) => void;
  onFpsUpdate: (fps: number) => void;
  onHoldCountUpdate: (count: number) => void;
  isTheaterMode?: boolean;
  onToggleTheaterMode?: () => void;
}

export const CameraStream: React.FC<CameraStreamProps> = ({
  confidenceThreshold,
  debounceFrames,
  showLandmarks,
  onGestureDetected,
  onSentenceAppend,
  onFpsUpdate,
  onHoldCountUpdate,
  isTheaterMode = false,
  onToggleTheaterMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [hasStartedOnce, setHasStartedOnce] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirror, setMirror] = useState<boolean>(true);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulatedSign, setSimulatedSign] = useState<ASLClass>('L');
  const [mediaPipeStatus, setMediaPipeStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  // Debounce & loop state refs
  const candidateCharRef = useRef<string | null>(null);
  const holdCountRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const handsInstanceRef = useRef<any>(null);
  const isSendingRef = useRef<boolean>(false);
  const lastLandmarksRef = useRef<Landmark3D[] | null>(null);
  const lastPredictionRef = useRef<GesturePrediction | null>(null);

  // Debounce sentence building logic
  const handleDebouncedChar = useCallback(
    (char: string, conf: number) => {
      if (conf < confidenceThreshold) {
        candidateCharRef.current = null;
        holdCountRef.current = 0;
        onHoldCountUpdate(0);
        return;
      }

      if (char === candidateCharRef.current) {
        holdCountRef.current += 1;
      } else {
        candidateCharRef.current = char;
        holdCountRef.current = 1;
      }

      onHoldCountUpdate(holdCountRef.current);

      if (holdCountRef.current === debounceFrames) {
        onSentenceAppend(formatSignForSentence(char));
      }
    },
    [confidenceThreshold, debounceFrames, onHoldCountUpdate, onSentenceAppend]
  );

  // Initialize MediaPipe Hands with retry & fallback
  useEffect(() => {
    let hands: any = null;
    let isMounted = true;

    function initHands() {
      try {
        const HandsClass = (window as any).Hands;
        if (HandsClass) {
          hands = new HandsClass({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
          });

          hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });

          // Single onResults listener bound once
          hands.onResults((results: any) => {
            if (!isMounted) return;

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
              const rawLandmarks: Landmark3D[] = results.multiHandLandmarks[0];
              lastLandmarksRef.current = rawLandmarks;

              const prediction = classifyGesture(rawLandmarks);
              lastPredictionRef.current = prediction;

              onGestureDetected(prediction.topChar, prediction.topConfidence, prediction.top3);
              handleDebouncedChar(prediction.topChar, prediction.topConfidence);
            } else {
              lastLandmarksRef.current = null;
              lastPredictionRef.current = null;
              onGestureDetected(null, 0, []);
              candidateCharRef.current = null;
              holdCountRef.current = 0;
              onHoldCountUpdate(0);
            }
          });

          handsInstanceRef.current = hands;
          setMediaPipeStatus('ready');
          return true;
        }
      } catch (e) {
        console.warn('MediaPipe hands load error:', e);
      }
      return false;
    }

    if (!initHands()) {
      // Retry in 500ms if script is still loading from CDN
      const timer = setTimeout(() => {
        if (isMounted && !initHands()) {
          setMediaPipeStatus('fallback');
        }
      }, 800);
      return () => clearTimeout(timer);
    }

    return () => {
      isMounted = false;
      if (handsInstanceRef.current && typeof handsInstanceRef.current.close === 'function') {
        try {
          handsInstanceRef.current.close();
        } catch {}
      }
    };
  }, [handleDebouncedChar, onGestureDetected, onHoldCountUpdate]);

  const activeStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef<number>(0);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    setIsStreaming(false);
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  // Start webcam video stream with robust error recovery
  const startCamera = useCallback(async () => {
    const requestId = ++cameraRequestIdRef.current;
    setCameraError(null);
    setIsStreaming(true);
    setHasStartedOnce(true);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setIsStreaming(false);
      setCameraError(
        'Camera API is unavailable in this browser context (requires HTTPS or localhost). You can test live recognition with the Virtual Gesture Simulator.'
      );
      return;
    }

    try {
      // Release existing stream
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((t) => t.stop());
        activeStreamRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
      };

      if (selectedDeviceId && selectedDeviceId.trim() !== '') {
        videoConstraints.deviceId = { ideal: selectedDeviceId };
      } else {
        videoConstraints.facingMode = 'user';
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (constraintErr: any) {
        if (
          constraintErr?.name === 'NotAllowedError' ||
          constraintErr?.name === 'PermissionDeniedError' ||
          constraintErr?.name === 'NotFoundError' ||
          constraintErr?.name === 'DevicesNotFoundError'
        ) {
          throw constraintErr;
        }
        console.warn('Initial video constraints rejected, falling back to basic video:', constraintErr);
        // Fallback: minimal constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // If unmounted or superseded by a newer request, immediately release stream
      if (requestId !== cameraRequestIdRef.current) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (videoRef.current && stream) {
        activeStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          if (requestId !== cameraRequestIdRef.current) return;
          try {
            await videoRef.current?.play();
          } catch (playErr) {
            console.warn('Video play prevented by browser policy:', playErr);
          }
        };

        // Query available devices once permission is granted
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (requestId !== cameraRequestIdRef.current) return;
            const videoInputs = devices.filter((d) => d.kind === 'videoinput');
            setAvailableDevices(videoInputs);
          } catch {
            // Ignore device enumeration errors
          }
        }
      } else if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err: any) {
      if (requestId !== cameraRequestIdRef.current) return;
      console.warn('Camera stream unavailable:', err?.name || err?.message || err);
      setIsStreaming(false);
      let message = 'Unable to access your webcam.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        message =
          'Camera permission was denied in your browser. Please click the camera/lock icon in your address bar to allow camera access, or use the Virtual Gesture Simulator below.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        message =
          'No camera device found on this system. You can use the built-in Virtual Gesture Simulator.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        message =
          'Your webcam is currently locked or in use by another program (e.g., Zoom, Teams, or another tab). Close other camera apps and click Retry.';
      } else if (err?.name === 'OverconstrainedError') {
        message = 'Camera resolution constraints not supported by your hardware.';
      }
      setCameraError(message);
    }
  }, [selectedDeviceId]);

  // Mount effect to start camera cleanly
  useEffect(() => {
    let isActive = true;

    async function initCameraOnMount() {
      if (isSimulating) {
        stopCamera();
        return;
      }

      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (!isActive) return;
          if (status.state === 'denied') {
            setIsStreaming(false);
            setCameraError(
              'Camera permission is currently blocked in your browser. Please allow camera access in site settings and click Retry, or use the Virtual Gesture Simulator.'
            );
            return;
          }
        } catch {
          // Permissions API query for 'camera' may not be supported in all browsers; proceed to getUserMedia
        }
      }

      if (isActive) {
        startCamera();
      }
    }

    initCameraOnMount();

    return () => {
      isActive = false;
      stopCamera();
    };
  }, [isSimulating, selectedDeviceId, startCamera, stopCamera]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Main rendering & tracking loop
  useEffect(() => {
    let active = true;

    const renderLoop = async () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Update FPS calculation
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsTimeRef.current >= 500) {
        const fps = (frameCountRef.current / (now - lastFpsTimeRef.current)) * 1000;
        onFpsUpdate(fps);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      // 1. Virtual Simulator Mode
      if (isSimulating) {
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = canvas.parentElement?.clientWidth || 800;
            canvas.height = canvas.parentElement?.clientHeight || 600;

            // Draw dark background for simulator
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle grid overlay
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 48) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, canvas.height);
              ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 48) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(canvas.width, y);
              ctx.stroke();
            }

            // Synthesize landmarks for simulated sign
            const rawLandmarks = synthesizeHandSkeleton(simulatedSign, 0.012);
            const prediction = classifyGesture(rawLandmarks);

            if (showLandmarks) {
              drawHandLandmarks(ctx, rawLandmarks, canvas.width, canvas.height, {
                showBones: true,
                showJoints: true,
                showBBox: true,
                label: prediction.topChar,
                confidence: prediction.topConfidence,
                color: prediction.topConfidence >= confidenceThreshold ? '#22c55e' : '#f59e0b',
              });
            }

            onGestureDetected(prediction.topChar, prediction.topConfidence, prediction.top3);
            handleDebouncedChar(prediction.topChar, prediction.topConfidence);
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      // 2. Real Camera Stream Mode
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 480;

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          // Clear transparent canvas overlay
          ctx.clearRect(0, 0, w, h);

          // Draw hand landmarks overlay if available
          if (showLandmarks && lastLandmarksRef.current && lastPredictionRef.current) {
            const rawLm = lastLandmarksRef.current;
            const pred = lastPredictionRef.current;

            // Invert x coordinate if video is visually mirrored
            const displayLandmarks: Landmark3D[] = rawLm.map((lm) => ({
              x: mirror ? 1.0 - lm.x : lm.x,
              y: lm.y,
              z: lm.z,
            }));

            drawHandLandmarks(ctx, displayLandmarks, w, h, {
              showBones: true,
              showJoints: true,
              showBBox: true,
              label: pred.topChar,
              confidence: pred.topConfidence,
              color: pred.topConfidence >= confidenceThreshold ? '#22c55e' : '#f59e0b',
            });
          }

          // Send next frame to MediaPipe if not already processing
          if (handsInstanceRef.current && !isSendingRef.current && isStreaming) {
            isSendingRef.current = true;
            handsInstanceRef.current
              .send({ image: video })
              .catch(() => {})
              .finally(() => {
                isSendingRef.current = false;
              });
          }
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [
    isStreaming,
    isSimulating,
    simulatedSign,
    mirror,
    showLandmarks,
    confidenceThreshold,
    onFpsUpdate,
    onGestureDetected,
    handleDebouncedChar,
  ]);

  return (
    <div
      ref={containerRef}
      className={`bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* Top Header / Video Controls Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-3 h-3 rounded-full ${
              isStreaming && !cameraError && !isSimulating
                ? 'bg-red-500 animate-pulse ring-4 ring-red-500/30'
                : isSimulating
                ? 'bg-indigo-400 ring-4 ring-indigo-400/30'
                : 'bg-slate-500'
            }`}
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-wide text-slate-100">
              {isSimulating ? 'Virtual Landmark Simulator' : 'Live Camera Feed'}
            </span>
            <span className="text-[10px] text-slate-400">
              {isSimulating
                ? 'Synthesized 21 3D Landmarks • Real-Time Pipeline'
                : mediaPipeStatus === 'ready'
                ? 'MediaPipe Hands Active • 63 Feature Dimensions'
                : 'Initializing Camera Engine...'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Camera device selector */}
          {availableDevices.length > 1 && !isSimulating && (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            >
              {availableDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

          {/* Mirror Flip Toggle */}
          <button
            type="button"
            onClick={() => setMirror(!mirror)}
            title="Mirror Camera View"
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              mirror ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mirror</span>
          </button>

          {/* Start / Stop Camera Toggle */}
          {!isSimulating && (
            <button
              type="button"
              onClick={isStreaming ? stopCamera : startCamera}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm ${
                isStreaming
                  ? 'bg-rose-600/90 hover:bg-rose-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
              }`}
            >
              {isStreaming ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Turn ON Camera</span>
                </>
              )}
            </button>
          )}

          {/* Toggle Virtual Simulator */}
          <button
            type="button"
            onClick={() => {
              setIsSimulating(!isSimulating);
              setCameraError(null);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              isSimulating
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                : 'bg-slate-800 text-indigo-300 hover:bg-indigo-950/60 border border-indigo-900/50'
            }`}
          >
            <span>{isSimulating ? 'Switch to Webcam' : 'Virtual Simulator'}</span>
          </button>

          {/* Theater Mode Toggle */}
          {onToggleTheaterMode && (
            <button
              type="button"
              onClick={onToggleTheaterMode}
              title={isTheaterMode ? 'Standard Layout' : 'Theater / Expanded Layout'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {isTheaterMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Camera'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <Expand className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Expansive Video Screen Container (Substantially Bigger: min-h-[500px] to min-h-[640px]) */}
      <div
        className={`relative w-full bg-slate-950 flex items-center justify-center overflow-hidden select-none ${
          isFullscreen
            ? 'h-[calc(100vh-60px)]'
            : isTheaterMode
            ? 'h-[620px] lg:h-[700px]'
            : 'h-[500px] lg:h-[600px] xl:h-[640px]'
        }`}
      >
        {/* Real Live Video Element (Directly Rendered - Never Hidden!) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-contain transition-transform duration-150 ${
            isSimulating ? 'hidden' : 'block'
          }`}
          style={{
            transform: mirror ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Overlay Canvas for Landmark Meshes, Joints, Bounding Boxes */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Overlay Banner when camera is paused */}
        {!isStreaming && !isSimulating && !cameraError && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white z-10">
            <CameraOff className="w-16 h-16 text-slate-500 mb-3" />
            <h4 className="text-lg font-bold mb-1">Camera is Currently Paused</h4>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              Click the button below to resume your live real-time webcam translation.
            </p>
            <button
              type="button"
              onClick={startCamera}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Camera Stream</span>
            </button>
          </div>
        )}

        {/* Camera Permission / Error Fallback Notice */}
        {cameraError && !isSimulating && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-20 overflow-y-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-extrabold mb-1.5 text-white">Camera Access Needed</h4>
            <p className="text-xs text-slate-300 max-w-lg mb-4 leading-relaxed bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
              {cameraError}
            </p>

            <div className="flex flex-wrap gap-2.5 justify-center mb-4">
              <button
                type="button"
                onClick={startCamera}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition-all inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Camera Permission</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSimulating(true);
                  setCameraError(null);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition-all inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Use Virtual Gesture Simulator</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors inline-flex items-center gap-1.5"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Troubleshoot Tips</span>
              </button>
            </div>

            {/* Troubleshooting Guide Box */}
            {showTroubleshoot && (
              <div className="text-left text-xs bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-md text-slate-300 space-y-2 mt-2">
                <p className="font-bold text-white text-xs uppercase tracking-wide">
                  Quick Camera Fixes:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-300">
                  <li>
                    Look at the browser address bar (top of screen). Click the camera or lock icon and choose &quot;Always allow&quot;.
                  </li>
                  <li>
                    Ensure other video software (Zoom, Google Meet, Teams, Discord) is not holding exclusive access to your webcam.
                  </li>
                  <li>
                    If using an external USB webcam, select it from the camera dropdown above.
                  </li>
                  <li>
                    You can also test gesture translation anytime using the &quot;Virtual Simulator&quot; or &quot;Snapshot / Upload Test&quot; tab!
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Simulator Control Dock (when simulator is active) */}
      {isSimulating && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 text-white">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span>Virtual Hand Tracker (Click a sign below to feed 3D landmarks):</span>
            </span>
            <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              Active Sign: {simulatedSign}
            </span>
          </div>
          <div className="space-y-2.5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                ASL Alphabet (A–Y)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASL_LETTERS.map((sign) => (
                  <button
                    key={sign}
                    type="button"
                    onClick={() => setSimulatedSign(sign)}
                    className={`w-9 h-8 text-xs font-black rounded-lg transition-all ${
                      simulatedSign === sign
                        ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400 scale-105'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    }`}
                  >
                    {sign}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
                ASL Words &amp; Controls
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ASL_WORDS.map((sign) => (
                  <button
                    key={sign}
                    type="button"
                    onClick={() => setSimulatedSign(sign)}
                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                      simulatedSign === sign
                        ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-400 scale-105'
                        : 'bg-slate-800 text-emerald-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    }`}
                  >
                    {sign === 'ILY' ? 'ILY (I Love You)' : sign}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

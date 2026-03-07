import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  Shield,
  RotateCcw,
  Timer,
  MapPin,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  analyzeSign,
  getApiKey,
  addScanToHistory,
  getPermits,
  type ParkingAnalysis,
} from "./gemini-service";
import { ParkingTimerBanner } from "./parking-timer-banner";
import {
  loadParkedLocation,
  saveParkedLocation,
  type ParkingTimer as ParkingTimerType,
} from "./parking-storage";
import { getLocation } from "./dev-mode";
import { ButtonStandard } from "./button-standard";
import verdictCheckSvg from "../../imports/svg-1ipn58qz2m";
import scanSvgPaths from "../../imports/svg-9wabwic51w";
import noParkSvg from "../../imports/svg-h99wf27z2n";
import { useAlertBg } from "./alert-bg-context";
import { compressImage } from "./compress-image";

function parseRestrictionTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, hh, mm] = match;
  const target = new Date();
  target.setHours(Number(hh), Number(mm), 0, 0);
  // If already past, it would be tomorrow — but Gemini should only return
  // times within the next 4 hours, so this shouldn't happen
  if (target.getTime() <= Date.now()) return null;
  return target.getTime();
}

export function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ParkingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timerOffer, setTimerOffer] = useState<{ label: string; endTime: number } | null>(null);
  const [timerStarted, setTimerStarted] = useState(false);
  const [isParking, setIsParking] = useState(false);

  const processFile = useCallback((file: File) => {
    setAnalysis(null);
    setError(null);
    setImageMimeType("image/jpeg");

    compressImage(file).then((dataUrl) => {
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
    });
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64) return;

    const apiKey = await getApiKey();
    if (!apiKey) {
      setError("Please add your Gemini API key in Settings first.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setTimerOffer(null);
    setTimerStarted(false);

    try {
      const permits = await getPermits();
      const result = await analyzeSign(imageBase64, apiKey, imageMimeType, permits);
      setAnalysis(result);

      // Save to history
      addScanToHistory({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        imageDataUrl: imagePreview!,
        analysis: result,
      });

      // Offer timer if parking is allowed but a restriction is approaching
      if (result.canPark === "yes" && result.nextRestriction) {
        const endTime = parseRestrictionTime(result.nextRestriction.time);
        if (endTime) {
          setTimerOffer({ label: result.nextRestriction.label, endTime });
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageBase64, imageMimeType, imagePreview]);

  const handleStartOfferedTimer = useCallback(() => {
    if (!timerOffer) return;
    const timer: ParkingTimerType = {
      type: "moveby",
      label: timerOffer.label,
      endTime: timerOffer.endTime,
    };
    const parked = loadParkedLocation();
    if (parked) {
      saveParkedLocation({ ...parked, timer });
    } else {
      saveParkedLocation({
        lat: 0,
        lng: 0,
        timestamp: Date.now(),
        timer,
      });
    }
    setTimerStarted(true);
  }, [timerOffer]);

  const handleDismissOffer = useCallback(() => {
    setTimerOffer(null);
  }, []);

  const handleParkHere = useCallback(async () => {
    setIsParking(true);
    try {
      const { lat, lng } = await getLocation();
      saveParkedLocation({ lat, lng, timestamp: Date.now() });
      navigate("/");
    } catch (err: unknown) {
      console.error("Failed to get location:", err);
      // Fall back to 0,0 so parking still works
      saveParkedLocation({ lat: 0, lng: 0, timestamp: Date.now() });
      navigate("/");
    } finally {
      setIsParking(false);
    }
  }, [navigate]);

  const resetScan = useCallback(() => {
    setImagePreview(null);
    setImageBase64(null);
    setAnalysis(null);
    setError(null);
    setTimerOffer(null);
    setTimerStarted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, []);

  // Auto-open camera when navigated from home page
  useEffect(() => {
    const state = location.state as { openCamera?: boolean; capturedImage?: string; mimeType?: string } | null;
    if (state?.capturedImage) {
      // Image already captured from home page camera input
      const dataUrl = state.capturedImage;
      setImagePreview(dataUrl);
      setImageMimeType("image/jpeg");
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
      // Clear the state so it doesn't re-trigger on re-renders
      window.history.replaceState({}, "");
    } else if (state?.openCamera) {
      // Small delay to ensure the input is mounted
      const timer = setTimeout(() => {
        cameraInputRef.current?.click();
      }, 100);
      // Clear the state so it doesn't re-trigger on re-renders
      window.history.replaceState({}, "");
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const statusConfig = {
    yes: {
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      label: "You Can Park Here",
    },
    no: {
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      label: "No Parking Allowed",
    },
    conditional: {
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      label: "Conditional Parking",
    },
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Parking timer banner */}
      <ParkingTimerBanner />

      {/* Upload / capture section */}
      {!imagePreview && (
        <Card className="border-2 border-dashed border-border">
          <CardContent className="p-8 flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
              <Camera className="w-10 h-10 text-blue-600" />
            </div>
            <div>
              <h2 className="text-foreground mb-1">Scan a Parking Sign</h2>
              <p className="text-muted-foreground text-sm">
                Take a photo or upload an image of a parking sign to find out if
                you can park there right now.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Image
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </CardContent>
        </Card>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="bg-white rounded-[14px] overflow-hidden">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Parking sign"
              className="w-full max-h-72 object-contain bg-muted"
            />
            <button
              onClick={resetScan}
              className="absolute top-[8px] right-[8px] size-[32px] rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
          {!analysis && !isAnalyzing && (
            <div className="p-4">
              <ButtonStandard
                onClick={handleAnalyze}
                disabled={!imageBase64}
              >
                Analyze Sign
              </ButtonStandard>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {isAnalyzing && (
        <div className="bg-white rounded-[14px] p-6 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-[#717182] text-sm">
            Analyzing parking sign...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#ffebe9] rounded-[14px] p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-[#e53221] shrink-0 mt-0.5" />
          <div>
            <p className="text-[#e53221] text-sm">{error}</p>
            {error.includes("Settings") && (
              <button
                className="text-[#e53221] text-sm font-medium mt-1 underline cursor-pointer"
                onClick={() => navigate("/settings")}
              >
                Go to Settings →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="flex flex-col gap-[16px]">
          {/* Main verdict */}
          {(() => {
            if (analysis.canPark === "yes") {
              return (
                <div className="bg-[#34c759] rounded-[14px]">
                  <div className="flex flex-col gap-[12px] p-[18px]">
                    <div className="flex gap-[8px] items-center">
                      <div className="shrink-0 size-[45px] overflow-clip relative">
                        <div className="absolute inset-[5%]">
                          <div className="absolute inset-[-5%]">
                            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 44.55 44.55">
                              <path d={scanSvgPaths.p3d83df00} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.05" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-[2px]">
                        <p className="font-['Inter'] font-semibold text-[22px] leading-[27px] text-white">You Can Park Here</p>
                        <div className="flex gap-[4px] items-center text-[14px] leading-[20px]">
                          <span className="font-['Inter'] text-[#2b2b2b]">Confidence:</span>
                          <span className="font-['Inter'] font-semibold text-white">{analysis.confidence}</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-px bg-[#177930]" />
                    <p className="font-['Inter'] text-[14px] leading-[18px] text-[#2b2b2b]">
                      {analysis.summary}
                    </p>
                  </div>
                </div>
              );
            }

            if (analysis.canPark === "no") {
              return (
                <div className="bg-[#e53221] rounded-[14px]">
                  <div className="flex flex-col gap-[12px] p-[18px]">
                    <div className="flex gap-[8px] items-center">
                      <div className="shrink-0 size-[45px] overflow-clip relative">
                        <div className="absolute inset-[8.33%]">
                          <div className="absolute inset-[-5%]">
                            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.4986 17.4986">
                              <path d={noParkSvg.p1e0eb1c0} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66652" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-[2px]">
                        <p className="font-['Inter'] font-semibold text-[22px] leading-[27px] text-white">No Parking Allowed</p>
                        <div className="flex gap-[4px] items-center text-[14px] leading-[20px]">
                          <span className="font-['Inter'] text-white/70">Confidence:</span>
                          <span className="font-['Inter'] font-semibold text-white">{analysis.confidence}</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-px bg-[#b0281b]" />
                    <p className="font-['Inter'] text-[14px] leading-[18px] text-white/90">
                      {analysis.summary}
                    </p>
                  </div>
                </div>
              );
            }

            // conditional
            return (
              <div className="bg-[#ec8e0b] rounded-[14px]">
                <div className="flex flex-col gap-[12px] p-[18px]">
                  <div className="flex gap-[8px] items-center">
                    <div className="shrink-0 size-[45px] overflow-clip relative">
                      <div className="absolute inset-[8.33%]">
                        <div className="absolute inset-[-5%]">
                          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 41.2506 41.2506">
                            <path d={scanSvgPaths.p2545ef00} stroke="#FCE6C9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.75" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-[2px]">
                      <p className="font-['Inter'] font-semibold text-[22px] leading-[27px] text-white">Conditional Parking</p>
                      <div className="flex gap-[4px] items-center text-[14px] leading-[20px]">
                        <span className="font-['Inter'] text-[#2b2b2b]">Confidence:</span>
                        <span className="font-['Inter'] font-semibold text-white">{analysis.confidence}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-[#c47509]" />
                  <p className="font-['Inter'] text-[14px] leading-[18px] text-[#2b2b2b]">
                    {analysis.summary}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Park-until alert — shown when parking is allowed and a deadline is known */}
          {analysis.canPark === "yes" && analysis.parkUntil && (() => {
            const match = analysis.parkUntil!.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) return null;
            const h = Number(match[1]);
            const m = Number(match[2]);
            const target = new Date();
            target.setHours(h, m, 0, 0);
            if (target.getTime() <= Date.now()) {
              target.setDate(target.getDate() + 1);
            }
            const isTomorrow = target.getDate() !== new Date().getDate();
            const timeLabel = target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            const dayLabel = isTomorrow ? "tomorrow" : "today";
            return (
              <div className="bg-[#eff6ff] rounded-[14px] p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#155dfc] shrink-0 mt-0.5" />
                <p className="text-[#155dfc] text-sm font-medium">
                  You can park here until {timeLabel} {dayLabel}
                </p>
              </div>
            );
          })()}

          {/* Park here / Park here anyway button */}
          {(analysis.canPark === "yes" || analysis.canPark === "no") && (
            analysis.canPark === "yes" ? (
              <ButtonStandard
                onClick={handleParkHere}
                disabled={isParking}
                icon={isParking ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
              >
                {isParking ? "Locating..." : "Park here"}
              </ButtonStandard>
            ) : (
              <button
                onClick={handleParkHere}
                disabled={isParking}
                className="w-full bg-[#E53221] hover:bg-[#c42a1b] active:bg-[#c42a1b] disabled:opacity-50 disabled:cursor-not-allowed rounded-[4px] relative transition-colors cursor-pointer"
              >
                <div className="absolute border border-[#E53221] border-solid inset-0 pointer-events-none rounded-[4px]" />
                <div className="flex items-center justify-center gap-[16px] px-[33px] py-[9px] h-[54px]">
                  <span className="shrink-0 flex items-center justify-center w-5 h-5">
                    {isParking ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <MapPin className="w-5 h-5 text-white" />}
                  </span>
                  <span className="font-['Inter'] font-semibold leading-[30px] text-[16px] text-center text-white">
                    {isParking ? "Locating..." : "Park here anyway"}
                  </span>
                </div>
              </button>
            )
          )}

          {/* Park-after alert — shown when parking is NOT allowed and a future window is known */}
          {analysis.canPark === "no" && analysis.parkAfter && (() => {
            const match = analysis.parkAfter!.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) return null;
            const h = Number(match[1]);
            const m = Number(match[2]);
            const target = new Date();
            target.setHours(h, m, 0, 0);
            if (target.getTime() <= Date.now()) {
              target.setDate(target.getDate() + 1);
            }
            const isTomorrow = target.getDate() !== new Date().getDate();
            const timeLabel = target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            const dayLabel = isTomorrow ? "tomorrow" : "today";
            return (
              <div className="bg-[#eff6ff] rounded-[14px] p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#155dfc] shrink-0 mt-0.5" />
                <p className="text-[#155dfc] text-sm font-medium">
                  You can park here starting at {timeLabel} {dayLabel}
                </p>
              </div>
            );
          })()}

          {/* Upcoming restriction — offer to start timer */}
          {timerOffer && !timerStarted && (
            <div className="bg-[#ec8e0b] rounded-[14px] p-[18px] flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Timer className="w-5 h-5 text-white shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">
                    Upcoming restriction detected
                  </p>
                  <p className="text-white/80 text-sm mt-0.5">
                    {timerOffer.label} at{" "}
                    {new Date(timerOffer.endTime).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStartOfferedTimer}
                  className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm font-medium py-2 px-3 rounded-[8px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Timer className="w-4 h-4" />
                  Start Timer
                </button>
                <button
                  onClick={handleDismissOffer}
                  className="shrink-0 bg-white/10 hover:bg-white/20 text-white/80 text-sm py-2 px-3 rounded-[8px] cursor-pointer transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Timer started confirmation */}
          {timerStarted && timerOffer && (
            <div className="bg-[#34c759] rounded-[14px] p-[14px] flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">
                  Timer started — {timerOffer.label.toLowerCase()} at{" "}
                  {new Date(timerOffer.endTime).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                className="text-white/80 hover:text-white text-sm font-medium px-2 py-1 shrink-0 cursor-pointer"
                onClick={() => navigate("/")}
              >
                View
              </button>
            </div>
          )}

          {/* Restrictions — shown as orange card */}
          {analysis.restrictions.length > 0 && (
            <div className="bg-[#ec8e0b] rounded-[14px] p-[18px]">
              <div className="flex gap-[8px] items-start">
                <div className="shrink-0 size-[45px] overflow-clip relative">
                  <div className="absolute inset-[8.33%]">
                    <div className="absolute inset-[-5%]">
                      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 41.2506 41.2506">
                        <path d={scanSvgPaths.p2545ef00} stroke="#FCE6C9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.75" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                  {analysis.restrictions.map((restriction, i) => (
                    <p key={i} className="font-['Inter'] text-[16px] leading-[20px] text-white">
                      {i === 0 ? (
                        <span className="font-semibold text-[22px] leading-[27px]">{restriction}</span>
                      ) : (
                        restriction
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sign Details */}
          {analysis.details.length > 0 && (
            <div className="bg-white rounded-[14px] p-[16px] flex flex-col gap-[8px]">
              <div className="flex gap-[8px] items-center">
                <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 19.9986 19.9986">
                  <g clipPath="url(#clip_info)">
                    <path d={scanSvgPaths.p35e30780} stroke="#155DFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66655" />
                    <path d="M9.99931 13.3324V9.99931" stroke="#155DFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66655" />
                    <path d="M9.99931 6.66621H10.0076" stroke="#155DFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66655" />
                  </g>
                  <defs>
                    <clipPath id="clip_info">
                      <rect fill="white" height="19.9986" width="19.9986" />
                    </clipPath>
                  </defs>
                </svg>
                <p className="font-['Inter'] font-medium text-[14px] leading-[20px] text-[#0a0a0a]">Sign Details</p>
              </div>
              <ul className="flex flex-col gap-[6px]">
                {analysis.details.map((detail, i) => (
                  <li
                    key={i}
                    className="font-['Inter'] text-[14px] leading-[20px] text-[#717182] flex items-start gap-[14px]"
                  >
                    <span className="w-[6px] h-[6px] rounded-full bg-[#51a2ff] shrink-0 mt-[7px]" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Time info */}
          {analysis.timeInfo && (
            <div className="bg-white rounded-[14px] p-[16px] flex gap-[12px] items-start">
              <svg className="shrink-0 size-[20px]" fill="none" viewBox="0 0 19.9986 19.9986">
                <g clipPath="url(#clip_clock)">
                  <path d={scanSvgPaths.p35e30780} stroke="#155DFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66655" />
                  <path d={scanSvgPaths.p1fd3cc66} stroke="#155DFC" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66655" />
                </g>
                <defs>
                  <clipPath id="clip_clock">
                    <rect fill="white" height="19.9986" width="19.9986" />
                  </clipPath>
                </defs>
              </svg>
              <div className="flex flex-col gap-[4px]">
                <p className="font-['Inter'] font-medium text-[14px] leading-[20px] text-[#0a0a0a]">Time Information</p>
                <p className="font-['Inter'] text-[14px] leading-[20px] text-[#717182]">
                  {analysis.timeInfo}
                </p>
              </div>
            </div>
          )}

          {/* Scan another */}
          <button
            onClick={resetScan}
            className="w-full bg-white rounded-[8px] h-[36px] flex items-center justify-center gap-[8px] cursor-pointer border border-black/10 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-[#0a0a0a]" />
            <span className="font-['Inter'] font-medium text-[14px] leading-[20px] text-[#0a0a0a]">Scan Another Sign</span>
          </button>
        </div>
      )}
    </div>
  );
}
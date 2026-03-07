import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Camera,
  Loader2,
  Clock,
  Timer,
  MapPin,
  Info,
  RotateCcw,
  Ban,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { ButtonStandard } from "./button-standard";
import { analyzeParkingSign, getGeminiKey, type ParkingAnalysis } from "./gemini-service";
import { loadPermits } from "./permits-storage";
import { compressImage } from "./compress-image";
import { getLocation } from "./dev-mode";
import { saveParkedLocationAndSync } from "./parking-storage";

type ScanState = { capturedImage?: string; mimeType?: string } | null;

/** Top module: take or choose a photo. */
function TakePhoto({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-[#d9eaff] rounded-xl p-6 flex flex-col items-start gap-4 cursor-pointer hover:bg-[#c9ddfb] transition-colors"
    >
      <div className="bg-[#155dfc] rounded-full w-20 h-20 flex items-center justify-center">
        <Camera className="w-10 h-10 text-white" />
      </div>
      <span className="text-[#2b2b2b] text-lg font-semibold">
        Take a photo of the parking sign
      </span>
    </button>
  );
}

/** Bottom module: upload a photo. */
function UploadPhoto({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-[#d9eaff] rounded-xl p-6 flex flex-col items-start gap-4 cursor-pointer hover:bg-[#c9ddfb] transition-colors"
    >
      <div className="bg-[#155dfc] rounded-full w-20 h-20 flex items-center justify-center">
        <img src="/icon-uploadphoto.svg" alt="" className="w-10 h-10 brightness-0 invert" aria-hidden />
      </div>
      <span className="text-[#2b2b2b] text-lg font-semibold">
        Upload a photo of it
      </span>
    </button>
  );
}

/** Format 24h "HH:MM" to friendly time (e.g. "2:30 PM"). */
function formatTime24(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const hour = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  const min = Number.isNaN(m) ? "" : `:${String(m).padStart(2, "0")}`;
  return `${hour}${min} ${ampm}`;
}

function ParkingResultView({
  data,
  onParkHere,
  onScanAnother,
  onDismissRestriction,
  parkHereLoading,
  parkHereError,
}: {
  data: ParkingAnalysis;
  onParkHere: () => void;
  onScanAnother: () => void;
  onDismissRestriction: () => void;
  parkHereLoading?: boolean;
  parkHereError?: string | null;
}) {
  const [restrictionDismissed, setRestrictionDismissed] = useState(false);
  const isYes = data.canPark === "yes";
  const isNo = data.canPark === "no";
  const showUpcomingRestriction =
    isYes && data.nextRestriction && !restrictionDismissed;
  const mainRules = data.restrictions.length > 0 ? data.restrictions : data.details;
  const hasMainRules = mainRules.length > 0;

  const handleDismiss = () => {
    setRestrictionDismissed(true);
    onDismissRestriction();
  };

  const verdictTitle = isYes
    ? "You Can Park Here"
    : isNo
      ? "You Cannot Park Here"
      : "It Depends";
  const verdictBg = isYes ? "bg-[#34c759]" : isNo ? "bg-[#dc2626]" : "bg-[#ec8e0b]";

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Green / Red / Orange verdict card — Figma main verdict */}
      <div
        className={`${verdictBg} flex flex-col gap-3 rounded-[14px] px-[18px] py-[18px]`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white">
            {isYes ? (
              <span className="font-bold text-[#34c759] text-xl">P</span>
            ) : (
              <Ban className="h-5 w-5 text-[#dc2626]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-[27px] text-[22px] text-white">
              {verdictTitle}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[14px]">
              <span className="text-[#2b2b2b]">Confidence:</span>
              <span className="font-semibold capitalize text-white">
                {data.confidence}
              </span>
            </p>
          </div>
        </div>
        <div className="h-px w-full bg-[#177930] shrink-0" aria-hidden />
        <p className="text-[14px] leading-[18px] text-[#2b2b2b]">
          {data.summary}
        </p>
        {data.permitNote && (
          <p className="text-[14px] leading-[18px] text-[#2b2b2b] mt-1">
            {data.permitNote}
          </p>
        )}
      </div>

      {/* 2. Light blue "park until" / "park after" strip */}
      {(data.parkUntil && isYes) || (data.parkAfter && isNo) ? (
        <div className="flex h-[54px] items-center gap-3 rounded-[14px] bg-[#eff6ff] px-4">
          <Clock className="h-5 w-5 shrink-0 text-[#155dfc]" />
          <p className="font-medium text-[14px] leading-5 tracking-[-0.15px] text-[#155dfc]">
            {data.parkUntil && isYes
              ? `You can park here until ${formatTime24(data.parkUntil)} today`
              : data.parkAfter && isNo
                ? `You can park after ${formatTime24(data.parkAfter)}${data.parkAfterLabel ? ` (${data.parkAfterLabel})` : ""}`
                : ""}
          </p>
        </div>
      ) : null}

      {/* 3. Blue "Park here" CTA — only when can park */}
      {isYes && (
        <div className="flex flex-col gap-1.5">
          <ButtonStandard
            onClick={onParkHere}
            disabled={parkHereLoading}
            icon={
              parkHereLoading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <MapPin className="h-5 w-5 text-white" />
              )
            }
          >
            {parkHereLoading ? "Getting location…" : "Park here"}
          </ButtonStandard>
          {parkHereError && (
            <p className="text-[14px] text-red-600">{parkHereError}</p>
          )}
        </div>
      )}

      {/* 4. Orange "Upcoming restriction" card with Start Timer / Dismiss */}
      {showUpcomingRestriction && data.nextRestriction && (
        <div className="flex flex-col gap-3 rounded-[14px] bg-[#ec8e0b] px-[18px] py-[18px]">
          <div className="flex items-start gap-3">
            <Timer className="h-5 w-5 shrink-0 text-white" />
            <div className="min-w-0">
              <p className="font-medium text-[14px] leading-5 tracking-[-0.15px] text-white">
                Upcoming restriction detected
              </p>
              <p className="text-[14px] leading-5 tracking-[-0.15px] text-white/80">
                {data.nextRestriction.label} at {formatTime24(data.nextRestriction.time)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onParkHere}
              className="flex flex-1 items-center justify-center gap-2 rounded-[8px] bg-white/20 py-2 font-medium text-[14px] text-white"
            >
              <Timer className="h-4 w-4" />
              Start Timer
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-[8px] bg-white/10 px-4 py-2 font-medium text-[14px] text-white/80"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 5. Orange rules block — main restrictions list */}
      {hasMainRules && (
        <div className="flex flex-col gap-3 rounded-[14px] bg-[#ec8e0b] px-[18px] pt-[18px] pb-4">
          <div className="flex items-start gap-3">
            <Ban className="h-5 w-5 shrink-0 text-white" />
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-[22px] leading-[27px] text-white">
                {mainRules[0]}
              </p>
              {mainRules.slice(1, 4).map((line, i) => (
                <p
                  key={i}
                  className="text-[16px] leading-5 text-white"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. White "Sign Details" card — bullet list with blue dots */}
      {data.details.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-white p-4">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 shrink-0 text-[#0a0a0a]" />
            <p className="font-medium text-[14px] text-[#0a0a0a]">
              Sign Details
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {data.details.map((d, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] text-[#717182]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#51a2ff]" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 7. White "Time Information" card */}
      {data.timeInfo && (
        <div className="flex gap-3 rounded-[14px] bg-white p-4">
          <Clock className="h-5 w-5 shrink-0 text-[#0a0a0a]" />
          <div className="min-w-0">
            <p className="font-medium text-[14px] text-[#0a0a0a]">
              Time Information
            </p>
            <p className="mt-1 text-[14px] text-[#717182]">
              {data.timeInfo}
            </p>
          </div>
        </div>
      )}

      {/* 8. Scan Another Sign button */}
      <button
        type="button"
        onClick={onScanAnother}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-black/10 bg-white font-medium text-[14px] text-[#0a0a0a]"
      >
        <RotateCcw className="h-4 w-4" />
        Scan Another Sign
      </button>
    </div>
  );
}

export function ScanPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ScanState;
  const imageFromState = state?.capturedImage;

  const [localImage, setLocalImage] = useState<string | null>(null);
  const capturedImage = imageFromState ?? localImage;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<
    { data: ParkingAnalysis } | { text: string } | { error: string } | null
  >(null);
  const [parkHereLoading, setParkHereLoading] = useState(false);
  const [parkHereError, setParkHereError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    compressImage(file).then((dataUrl) => {
      setLocalImage(dataUrl);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleScanAnother = useCallback(() => {
    setLocalImage(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleParkHere = useCallback(() => {
    setParkHereError(null);
    setParkHereLoading(true);
    getLocation()
      .then(({ lat, lng }) => {
        saveParkedLocationAndSync({ lat, lng, timestamp: Date.now() });
        navigate("/", { state: { openTimerDrawer: true } });
      })
      .catch((err: Error) => {
        setParkHereError(err.message);
      })
      .finally(() => {
        setParkHereLoading(false);
      });
  }, [navigate]);

  useEffect(() => {
    if (!capturedImage || !getGeminiKey()) return;
    setAnalyzing(true);
    setResult(null);
    analyzeParkingSign(capturedImage, loadPermits())
      .then((res) => {
        if (res.ok) {
          if ("data" in res) setResult({ data: res.data });
          else setResult({ text: res.text });
        } else {
          setResult({ error: res.error });
        }
      })
      .finally(() => setAnalyzing(false));
  }, [capturedImage]);

  const noKey = !!capturedImage && !getGeminiKey();

  if (!capturedImage) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <TakePhoto onClick={() => fileInputRef.current?.click()} />
        <UploadPhoto onClick={() => fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-[#155dfc] font-medium text-sm"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-[480px] mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-semibold">What's your sign (say)?</h1>
      {/* Image container — Figma: rounded-[14px], optional retake overlay */}
      <div className="relative h-[288px] w-full overflow-hidden rounded-[14px] bg-[#ececf0]">
        <img
          src={capturedImage}
          alt="Captured parking sign"
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50"
          aria-label="Retake photo"
        >
          <RotateCcw className="h-4 w-4 text-white" />
        </button>
      </div>

      {noKey && (
        <Card className="rounded-xl border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-amber-800 text-sm">
              Add <code className="bg-amber-100 px-1 rounded">VITE_GEMINI_API_KEY</code> to your{" "}
              <code className="bg-amber-100 px-1 rounded">.env</code> to analyze parking signs.
            </p>
          </CardContent>
        </Card>
      )}

      {analyzing && (
        <Card className="rounded-xl">
          <CardContent className="p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#155dfc] animate-spin" />
            <p className="text-muted-foreground text-sm">Reading parking rules…</p>
          </CardContent>
        </Card>
      )}

      {!analyzing && result && "data" in result && (
        <ParkingResultView
          data={result.data}
          onParkHere={handleParkHere}
          onScanAnother={handleScanAnother}
          onDismissRestriction={() => {}}
          parkHereLoading={parkHereLoading}
          parkHereError={parkHereError}
        />
      )}

      {!analyzing && result && "text" in result && (
        <Card className="rounded-xl border-gray-200 bg-gray-50/50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-gray-900 mb-1">Parking rules</p>
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{result.text}</p>
          </CardContent>
        </Card>
      )}

      {!analyzing && result && "error" in result && (
        <Card className="rounded-xl border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-800 text-sm">{result.error}</p>
          </CardContent>
        </Card>
      )}

      {(!result || "error" in result || "text" in result) && (
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-[#155dfc] font-medium text-sm"
        >
          Back to home
        </button>
      )}
    </div>
  );
}

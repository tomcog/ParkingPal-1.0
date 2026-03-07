import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation } from "react-router";
import { MapPin, Camera, Loader2, Timer, X } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { ParkingTimerBanner } from "./parking-timer-banner";
import {
  loadParkedLocation,
  saveParkedLocationAndSync,
  clearParkedLocationAndSync,
  getTimeRemaining,
  type ParkedLocation,
  type ParkingTimer as ParkingTimerType,
} from "./parking-storage";
import { getLocation, setDevMode } from "./dev-mode";
import { ButtonStandard } from "./button-standard";
import { SlideButton } from "./slide-button";
import { playCelebration } from "./sounds";
import { useAlertBg } from "./alert-bg-context";
import { getGoogleMapsKey, getStaticMapUrl } from "./google-maps-service";
import slidingArrowIcon from "../../icon-slidingarrow.svg";

function IconPark({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round">
      <path d="M7.3 14.5V5.49995H10.9C11.6161 5.49995 12.3028 5.78442 12.8092 6.29077C13.3155 6.79711 13.6 7.48387 13.6 8.19995C13.6 8.91604 13.3155 9.6028 12.8092 10.1091C12.3028 10.6155 11.6161 10.9 10.9 10.9H7.3M19 9.99995C19 14.9705 14.9706 19 10 19C5.02944 19 1 14.9705 1 9.99995C1 5.02939 5.02944 0.999954 10 0.999954C14.9706 0.999954 19 5.02939 19 9.99995Z" />
    </svg>
  );
}

function IconNoPark({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.547 5.83342H10.8337C11.1835 5.83345 11.5295 5.90692 11.8492 6.04906C12.1689 6.19121 12.4552 6.39887 12.6895 6.65863C12.9239 6.91838 13.1012 7.22443 13.2098 7.557C13.3185 7.88956 13.3561 8.24123 13.3203 8.58926M10.8337 10.8334H7.50033M15.8928 15.8926C14.3301 17.4553 12.2107 18.3332 10.0007 18.3332C7.79078 18.3332 5.67134 17.4553 4.10866 15.8926C2.54598 14.3299 1.66808 12.2105 1.66808 10.0005C1.66808 7.79055 2.54598 5.6711 4.10866 4.10842M1.66699 1.66676L18.3337 18.3334M6.96449 2.23926C8.47325 1.64901 10.1213 1.51134 11.7071 1.84311C13.2929 2.17488 14.7475 2.9617 15.8931 4.10728C17.0387 5.25287 17.8255 6.70754 18.1573 8.29331C18.4891 9.87908 18.3514 11.5272 17.7612 13.0359M7.50033 14.1668V7.50009" />
    </svg>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAlertBg } = useAlertBg();
  const [parked, setParked] = useState<ParkedLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [showTimerDrawer, setShowTimerDrawer] = useState(false);
  const [meterMinutes, setMeterMinutes] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [meterMoveByTime, setMeterMoveByTime] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);

  const goToScan = useCallback(() => {
    navigate("/scan");
  }, [navigate]);

  useEffect(() => {
    const loaded = loadParkedLocation();
    setParked(loaded);
    if (loaded && (location.state as { openTimerDrawer?: boolean } | null)?.openTimerDrawer) {
      setShowTimerDrawer(true);
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const onHydrated = () => setParked(loadParkedLocation());
    window.addEventListener("parking-hydrated", onHydrated);
    return () => window.removeEventListener("parking-hydrated", onHydrated);
  }, []);

  useEffect(() => {
    if (!parked) {
      setStaticMapUrl(null);
      return;
    }
    getGoogleMapsKey().then((key) => {
      if (key) {
        setStaticMapUrl(getStaticMapUrl(parked.lat, parked.lng, key));
      } else {
        setStaticMapUrl(null);
      }
    });
  }, [parked?.lat, parked?.lng]);

  useEffect(() => {
    if (!parked) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [parked]);

  useEffect(() => {
    if (parked?.timer) {
      const remaining = getTimeRemaining(parked.timer.endTime);
      setAlertBg(remaining.expired);
    } else {
      setAlertBg(false);
    }
  }, [parked, setAlertBg]);

  const handleParkTap = useCallback(() => {
    setIsLocating(true);
    setError(null);
    getLocation()
      .then(({ lat, lng }) => {
        const location: ParkedLocation = { lat, lng, timestamp: Date.now() };
        saveParkedLocationAndSync(location);
        setParked(location);
        setIsLocating(false);
        setShowTimerDrawer(true);
        setMeterMinutes("");
        setCustomMinutes("");
        setMeterMoveByTime("");
      })
      .catch((err: Error) => {
        setIsLocating(false);
        setError(err.message);
      });
  }, []);

  const handleDone = useCallback(() => {
    if (parked) {
      const mins = parseInt(meterMinutes || customMinutes, 10);
      if (mins && mins > 0) {
        const timer: ParkingTimerType = {
          type: "meter",
          label: "Meter expires",
          endTime: Date.now() + mins * 60000,
        };
        saveParkedLocationAndSync({ ...parked, timer });
        setParked({ ...parked, timer });
      } else if (meterMoveByTime) {
        const [hh, mm] = meterMoveByTime.split(":").map(Number);
        const target = new Date();
        target.setHours(hh, mm, 0, 0);
        if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
        const timer: ParkingTimerType = {
          type: "moveby",
          label: `Move car by ${target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
          endTime: target.getTime(),
        };
        saveParkedLocationAndSync({ ...parked, timer });
        setParked({ ...parked, timer });
      }
    }
    setShowTimerDrawer(false);
  }, [parked, meterMinutes, customMinutes, meterMoveByTime]);

  const handleRemoveTimer = useCallback(() => {
    if (!parked) return;
    const updated = { ...parked, timer: null };
    saveParkedLocationAndSync(updated);
    setParked(updated);
  }, [parked]);

  const handleNavigate = useCallback(() => {
    if (!parked) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${parked.lat},${parked.lng}&travelmode=walking`,
      "_blank"
    );
  }, [parked]);

  const handleClear = useCallback(() => {
    playCelebration();
    clearParkedLocationAndSync();
    setParked(null);
    setError(null);
    setShowTimerDrawer(false);
  }, []);

  const openTimerDrawer = useCallback(() => {
    setMeterMinutes("");
    setCustomMinutes("");
    setMeterMoveByTime("");
    setShowTimerDrawer(true);
  }, []);

  if (!parked && !isLocating) {
    return (
      <div className="max-w-lg mx-auto space-y-6 p-6">
        <ParkingTimerBanner />
        <button
          onClick={handleParkTap}
          className="w-full bg-[#d9eaff] rounded-xl p-6 flex flex-col items-start gap-6 cursor-pointer hover:bg-[#c9ddfb] transition-colors"
        >
          <div className="bg-[#155dfc] rounded-full w-20 h-20 flex items-center justify-center">
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <span className="text-[#2b2b2b] text-2xl font-semibold leading-8">
            I just parked my car.
          </span>
        </button>
        <button
          onClick={goToScan}
          className="w-full bg-[#d9eaff] rounded-xl p-6 flex flex-col items-start gap-6 cursor-pointer hover:bg-[#c9ddfb] transition-colors"
        >
          <div className="bg-[#155dfc] rounded-full w-20 h-20 flex items-center justify-center">
            <Camera className="w-10 h-10 text-white" />
          </div>
          <span className="text-[#2b2b2b] text-2xl font-semibold leading-8">
            Can I park here?
          </span>
        </button>
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-red-800 text-sm">
                This app is designed for a mobile phone.{" "}
                <a
                  href="#"
                  className="underline font-medium"
                  onClick={(e) => {
                    e.preventDefault();
                    setDevMode(true);
                    setError(null);
                  }}
                >
                  Click here
                </a>{" "}
                to run in dev mode with a default location.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (isLocating) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-muted-foreground text-sm">Getting your location...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasTimer = !!parked?.timer;
  const timerRemaining = hasTimer && parked?.timer
    ? getTimeRemaining(parked.timer.endTime)
    : null;
  const isExpired = timerRemaining?.expired ?? false;
  const isUrgent =
    timerRemaining &&
    !timerRemaining.expired &&
    timerRemaining.hours === 0 &&
    timerRemaining.minutes < 5;

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="relative">
        {hasTimer && timerRemaining && !showTimerDrawer && (
          <div
            className="h-14 rounded-t-xl flex items-center px-6 pb-2"
            style={{
              background: isExpired || isUrgent
                ? "linear-gradient(0deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 50%), #c42a1b"
                : "linear-gradient(0deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%), #2a9c47",
            }}
          >
            <div className="flex items-center justify-between w-full">
              <button onClick={handleRemoveTimer} className="p-1" aria-label="Remove timer">
                <Timer className="w-5 h-5 text-white/80" />
              </button>
              {isExpired ? (
                <p className="text-white text-xl font-semibold">Time's up!</p>
              ) : (
                <p className="text-white text-xl font-semibold">
                  {timerRemaining.hours > 0 && `${timerRemaining.hours}h `}
                  {String(timerRemaining.minutes).padStart(2, "0")}m{" "}
                  {String(timerRemaining.seconds).padStart(2, "0")}s
                </p>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openTimerDrawer();
                }}
                className="bg-black/25 rounded size-8 flex items-center justify-center"
              >
                <Timer className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}

        <div className="relative z-10 bg-[#34c759] rounded-xl flex flex-col gap-4 p-6 -mt-1.5">
          <div className="w-20 h-20 rounded-full bg-[#155DFC] flex items-center justify-center">
            <span className="text-white font-bold text-3xl">P</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-1 items-center text-white text-xl">
              <span className="font-light">Parked</span>
              <span className="font-bold">
                {new Date(parked!.timestamp).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                }).toLowerCase()}
              </span>
            </div>
            {!hasTimer && (
              <div className="flex gap-2 items-center">
                <span className="text-white text-base">Timer</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTimerDrawer((s) => !s);
                  }}
                  className="bg-black/25 rounded size-8 flex items-center justify-center"
                >
                  {showTimerDrawer ? (
                    <X className="w-4 h-4 text-white" />
                  ) : (
                    <Timer className="w-5 h-5 text-white" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showTimerDrawer && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden relative z-0 -mt-1.5"
            >
              <div
                className="rounded-b-xl pt-8 px-4 pb-4 flex flex-col gap-4"
                style={{
                  background:
                    "linear-gradient(rgba(0,0,0,0.1) 15%, rgba(0,0,0,0) 41%), #2a9c47",
                }}
              >
                <div className="flex gap-4 items-center flex-wrap">
                  {([15, 30, 60, 120] as const).map((mins) => {
                    const label = mins >= 60 ? `${mins / 60}` : `${mins}`;
                    const unit = mins >= 60 ? "h" : "m";
                    const isSelected = meterMinutes === String(mins);
                    return (
                      <button
                        key={mins}
                        onClick={() => {
                          setMeterMinutes(isSelected ? "" : String(mins));
                          setCustomMinutes("");
                          setMeterMoveByTime("");
                        }}
                        className={`h-10 px-3 rounded cursor-pointer transition-colors ${
                          isSelected ? "bg-[#2b2b2b]" : "bg-[#34c759]"
                        }`}
                      >
                        <span className="text-white text-base font-semibold">
                          {label}
                        </span>
                        <span className="text-white text-base font-normal">
                          {unit}
                        </span>
                      </button>
                    );
                  })}
                  <div className="flex-1 min-w-[80px] h-10 bg-white rounded flex items-center justify-center">
                    <input
                      ref={customInputRef}
                      type="number"
                      inputMode="numeric"
                      value={customMinutes}
                      onChange={(e) => {
                        setCustomMinutes(e.target.value);
                        setMeterMinutes("");
                        setMeterMoveByTime("");
                      }}
                      placeholder="--"
                      min={1}
                      className="w-full h-full px-2 bg-transparent text-center text-[#2b2b2b] font-semibold outline-none placeholder:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="relative bg-[#34c759] h-10 px-4 rounded flex items-center overflow-hidden">
                    <span className="text-white font-semibold text-base pointer-events-none">
                      {meterMoveByTime
                        ? (() => {
                            const [hh, mm] = meterMoveByTime
                              .split(":")
                              .map(Number);
                            const d = new Date();
                            d.setHours(hh, mm);
                            return d.toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            });
                          })()
                        : "Pick a time"}
                    </span>
                    <input
                      ref={timeInputRef}
                      type="time"
                      value={meterMoveByTime}
                      onChange={(e) => {
                        setMeterMoveByTime(e.target.value);
                        setMeterMinutes("");
                        setCustomMinutes("");
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                  <button
                    onClick={handleDone}
                    className="bg-[#1751d2] h-10 px-4 rounded flex gap-2 items-center cursor-pointer"
                  >
                    <span className="text-white text-base font-semibold">
                      Done
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SlideButton
        onSlideComplete={handleClear}
        trackColor="#eff6ff"
        handleColor="#155dfc"
        trackShadow="inset 0px 5px 0px 0px rgba(21,93,252,0.25)"
        handleShadow="0px 6px 0px 0px #1a3b82"
        handleIcon={
          <img
            src={slidingArrowIcon}
            alt=""
            className="w-6 h-5 object-contain"
          />
        }
        confirmedTrackColor="#1751d2"
        confirmedTrackShadow="inset 0px 5px 0px 0px #113a95"
        confirmedTransitionMs={100}
        confirmedContent={
          <>
            <IconNoPark className="w-5 h-5 shrink-0 text-white" />
            <span className="font-semibold text-base text-white">
              I'm no longer parked
            </span>
          </>
        }
      >
        <>
          <IconPark className="w-5 h-5 shrink-0 text-[#155dfc]" />
          <span className="font-semibold text-base text-[#155dfc]">
            I'm no longer parked
          </span>
        </>
      </SlideButton>

      {parked && (
        <div className="rounded-lg overflow-hidden bg-[#eff6ff] h-[200px] flex items-center justify-center min-h-[200px]">
          {staticMapUrl ? (
            <img
              src={staticMapUrl}
              alt="Parked location"
              className="w-full h-full object-cover"
            />
          ) : (
            <p className="text-[#717182] text-sm">
              Map: {parked.lat.toFixed(4)}, {parked.lng.toFixed(4)}
            </p>
          )}
        </div>
      )}

      <ButtonStandard onClick={handleNavigate} icon={<MapPin className="w-5 h-5 text-white" />}>
        Take me back to my car
      </ButtonStandard>
    </div>
  );
}

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation } from "react-router";
import { MapPin, Camera, Loader2, Timer, X } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { CardBlue } from "./card-blue";
import { ParkingTimerBanner } from "./parking-timer-banner";
import {
  loadParkedLocation,
  saveParkedLocationAndSync,
  clearParkedLocationAndSync,
  getTimeRemaining,
  type ParkedLocation,
  type ParkingTimer as ParkingTimerType,
} from "./parking-storage";
import { requestNotificationPermission, scheduleTimerNotification, cancelTimerNotification } from "./notifications";
import { getLocation, setDevMode } from "./dev-mode";
import { ButtonStandard } from "./button-standard";
import { SlideButton } from "./slide-button";
import { playCelebration } from "./sounds";
import { useAlertBg } from "./alert-bg-context";
import { getGoogleMapsKey, getStaticMapUrl } from "./google-maps-service";
import { compressImage } from "./compress-image";
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
  const [moveByDate, setMoveByDate] = useState("");
  const [moveByTime, setMoveByTime] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const [drawerHeight, setDrawerHeight] = useState(0);
  const [timerBarExiting, setTimerBarExiting] = useState(false);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  const handleScanFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      compressImage(file).then((dataUrl) => {
        navigate("/scan", { state: { capturedImage: dataUrl, mimeType: file.type } });
      });
      if (scanFileInputRef.current) scanFileInputRef.current.value = "";
    },
    [navigate]
  );

  useEffect(() => {
    const loaded = loadParkedLocation();
    setParked(loaded);
    if (loaded && (location.state as { openTimerDrawer?: boolean } | null)?.openTimerDrawer) {
      setMeterMinutes("");
      setCustomMinutes("");
      setMoveByDate("");
      setMoveByTime("");
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

  useLayoutEffect(() => {
    if (!showTimerDrawer || !drawerContentRef.current) return;
    setDrawerHeight(drawerContentRef.current.scrollHeight);
  }, [showTimerDrawer]);

  useEffect(() => {
    if (parked?.timer) {
      const remaining = getTimeRemaining(parked.timer.endTime);
      setAlertBg(remaining.expired);
      if (!remaining.expired) {
        scheduleTimerNotification(parked.timer.endTime);
      }
    } else {
      setAlertBg(false);
      cancelTimerNotification();
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
        setMoveByDate("");
        setMoveByTime("");
      })
      .catch((err: Error) => {
        setIsLocating(false);
        setError(err.message);
      });
  }, []);

  const openTimerDrawer = useCallback(() => {
    setMeterMinutes("");
    setCustomMinutes("");
    setMoveByDate("");
    setMoveByTime("");
    setShowTimerDrawer(true);
  }, []);

  const closeTimerDrawer = useCallback(() => {
    setMeterMinutes("");
    setCustomMinutes("");
    setMoveByDate("");
    setMoveByTime("");
    setShowTimerDrawer(false);
  }, []);

  const BOTTOM_DRAWER_CLOSE_MS = 400;

  const handleDone = useCallback(() => {
    if (parked) {
      const hadTimer = !!parked.timer;
      const mins = parseInt(meterMinutes || customMinutes, 10);
      if (mins && mins > 0) {
        const timer: ParkingTimerType = {
          type: "meter",
          label: "Meter expires",
          endTime: Date.now() + mins * 60000,
        };
        saveParkedLocationAndSync({ ...parked, timer });
        requestNotificationPermission().then(() => scheduleTimerNotification(timer.endTime));
        if (hadTimer) {
          setParked({ ...parked, timer });
        } else {
          setTimeout(() => setParked({ ...parked, timer }), BOTTOM_DRAWER_CLOSE_MS);
        }
      } else if (moveByDate && moveByTime) {
        const target = new Date(`${moveByDate}T${moveByTime}`);
        if (!Number.isNaN(target.getTime()) && target.getTime() > Date.now()) {
          const timer: ParkingTimerType = {
            type: "moveby",
            label: `Move car by ${target.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
            endTime: target.getTime(),
          };
          saveParkedLocationAndSync({ ...parked, timer });
          requestNotificationPermission().then(() => scheduleTimerNotification(timer.endTime));
          if (hadTimer) {
            setParked({ ...parked, timer });
          } else {
            setTimeout(() => setParked({ ...parked, timer }), BOTTOM_DRAWER_CLOSE_MS);
          }
        }
      }
    }
    closeTimerDrawer();
  }, [parked, meterMinutes, customMinutes, moveByDate, moveByTime, closeTimerDrawer]);

  const handleRemoveTimer = useCallback(() => {
    if (!parked) return;
    cancelTimerNotification();
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

  if (!parked && !isLocating) {
    return (
      <div className="max-w-lg mx-auto space-y-6 p-6">
        <ParkingTimerBanner />
        <CardBlue onClick={handleParkTap} icon={<MapPin className="w-10 h-10 text-white" />}>
          I just parked my car.
        </CardBlue>
        <CardBlue
          onClick={() => scanFileInputRef.current?.click()}
          icon={<Camera className="w-10 h-10 text-white" />}
        >
          Can I park here?
        </CardBlue>
        <input
          ref={scanFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleScanFileChange}
          className="hidden"
          aria-hidden
        />
        {error && (
          <Card className="rounded-xl border-red-200 bg-red-50">
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
        <Card className="rounded-xl">
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
    timerRemaining.days === 0 &&
    timerRemaining.hours === 0 &&
    timerRemaining.minutes < 5;

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="relative">
        {((hasTimer && timerRemaining) || timerBarExiting) && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: timerBarExiting ? 0 : 56 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="overflow-hidden"
            onAnimationComplete={() => {
              if (timerBarExiting) {
                handleRemoveTimer();
                setTimerBarExiting(false);
              }
            }}
          >
            <div
              className="h-14 rounded-t-[12px] flex items-center px-6 pb-3"
              style={{
                background: isExpired || isUrgent
                  ? "linear-gradient(0deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 50%), #c42a1b"
                  : "linear-gradient(0deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%), #2a9c47",
              }}
            >
              <button
                onClick={() => setTimerBarExiting(true)}
                className="p-1 opacity-60 shrink-0 mr-auto"
                aria-label="Remove timer"
              >
                <X className="w-5 h-5 text-black" />
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {isExpired ? (
                  <p className="text-white text-2xl font-semibold leading-[30px] tracking-[0.3828px]">
                    Time's up!
                  </p>
                ) : (
                  <p className="text-white text-2xl leading-[30px] tracking-[0.3828px]">
                    {timerRemaining?.days ? (
                      <>
                        <span className="font-semibold">{timerRemaining.days}</span>
                        <span className="font-light">d </span>
                      </>
                    ) : null}
                    {timerRemaining?.hours || timerRemaining?.days ? (
                      <>
                        <span className="font-semibold">{String(timerRemaining?.hours ?? 0).padStart(2, "0")}</span>
                        <span className="font-light">h </span>
                      </>
                    ) : null}
                    <span className="font-semibold">{String(timerRemaining?.minutes ?? 0).padStart(2, "0")}</span>
                    <span className="font-light">m</span>
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    showTimerDrawer ? closeTimerDrawer() : openTimerDrawer();
                  }}
                  className="bg-black/30 rounded-[4px] size-8 flex items-center justify-center shrink-0"
                  aria-label={showTimerDrawer ? "Close timer" : "Open timer"}
                >
                  <Timer className="w-5 h-5 text-white opacity-80" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="relative z-10 bg-[#34c759] rounded-[12px] flex flex-col gap-4 p-6 -mt-[10px]">
          <img src="/button-park.svg" alt="" className="w-20 h-20 shrink-0" aria-hidden />
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex gap-1 items-center text-white text-[20px] leading-[30px] tracking-[-0.35px] min-w-0">
              <span className="font-light">Parked</span>
              <span className="font-bold whitespace-nowrap">
                {new Date(parked!.timestamp).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                }).toLowerCase()}
              </span>
            </div>
            {!hasTimer && (
              <div className="flex gap-2 items-center shrink-0">
                <span className="text-white text-base leading-[30px]">Timer</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    showTimerDrawer ? closeTimerDrawer() : openTimerDrawer();
                  }}
                  className="bg-black/25 rounded-[4px] size-8 flex items-center justify-center flex-shrink-0"
                  aria-label={showTimerDrawer ? "Close timer" : "Set timer"}
                >
                  <Timer className="w-5 h-5 text-white opacity-80" />
                </button>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showTimerDrawer && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: drawerHeight }}
              exit={{ height: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="overflow-hidden relative z-0 -mt-[14px]"
            >
              <div
                ref={drawerContentRef}
                className="rounded-b-xl pt-[34px] px-4 pb-4 grid grid-cols-12 gap-x-4 gap-y-8"
                style={{
                  background:
                    "linear-gradient(rgba(0,0,0,0.1) 15%, rgba(0,0,0,0) 41%), #2a9c47",
                }}
              >
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
                        setMoveByDate("");
                        setMoveByTime("");
                      }}
                      className={`col-span-2 h-10 rounded-[4px] flex items-center justify-center cursor-pointer transition-colors ${
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
                <div className="col-span-4 h-10 bg-white rounded-[4px] flex items-center justify-center px-3">
                  <input
                    ref={customInputRef}
                    type="number"
                    inputMode="numeric"
                    value={customMinutes}
                    onChange={(e) => {
                      setCustomMinutes(e.target.value);
                      setMeterMinutes("");
                      setMoveByDate("");
                      setMoveByTime("");
                    }}
                    placeholder="--"
                    min={1}
                    className="w-full h-full bg-transparent text-center text-[#2b2b2b] font-semibold text-base outline-none placeholder:text-[#a1a1a1] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className={`col-span-4 relative h-10 rounded-[4px] flex items-center justify-center overflow-hidden ${moveByDate ? "bg-[#2B2B2B]" : "bg-[#34c759]"}`}>
                  <span className="text-white font-semibold text-base pointer-events-none truncate px-4">
                    {moveByDate
                      ? (() => {
                          const d = new Date(moveByDate + "T12:00:00");
                          return Number.isNaN(d.getTime()) ? "Date" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                        })()
                      : "Date"}
                  </span>
                  <input
                    type="date"
                    value={moveByDate}
                    min={(() => {
                      const n = new Date();
                      const pad = (x: number) => String(x).padStart(2, "0");
                      return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
                    })()}
                    onChange={(e) => {
                      setMoveByDate(e.target.value);
                      setMeterMinutes("");
                      setCustomMinutes("");
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    aria-label="Pick date"
                  />
                </div>
                <div className="col-span-4 relative bg-[#34c759] h-10 rounded-[4px] flex items-center justify-center overflow-hidden">
                  <span className="text-white font-semibold text-base pointer-events-none truncate px-4">
                    {moveByTime ? (() => {
                      const [h, m] = moveByTime.split(":").map(Number);
                      const d = new Date();
                      d.setHours(h, m, 0, 0);
                      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                    })() : "Time"}
                  </span>
                  <input
                    type="time"
                    value={moveByTime}
                    onChange={(e) => {
                      setMoveByTime(e.target.value);
                      setMeterMinutes("");
                      setCustomMinutes("");
                    }}
                    className="absolute inset-0 cursor-pointer w-full h-full opacity-0"
                    aria-label="Pick time"
                  />
                </div>
                {meterMinutes || customMinutes || (moveByDate && moveByTime) ? (
                  <button
                    onClick={handleDone}
                    className="col-span-4 bg-[#1751d2] h-10 px-4 rounded-[4px] flex gap-2 items-center justify-center cursor-pointer"
                  >
                    <Timer className="w-5 h-5 text-white opacity-80 shrink-0" />
                    <span className="text-white text-base font-semibold">
                      Start
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={closeTimerDrawer}
                    className="col-span-4 bg-[#2B2B2B] h-10 px-4 rounded-[4px] flex gap-2 items-center justify-center cursor-pointer"
                  >
                    <X className="w-5 h-5 text-white opacity-80 shrink-0" />
                    <span className="text-white text-base font-semibold">
                      Close
                    </span>
                  </button>
                )}
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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import {
  loadParkedLocation,
  getTimeRemaining,
  formatCountdown,
} from "./parking-storage";

export function ParkingTimerBanner() {
  const navigate = useNavigate();
  const [endTime, setEndTime] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    const parked = loadParkedLocation();
    if (parked?.timer) {
      setEndTime(parked.timer.endTime);
      setLabel(parked.timer.label);
    } else {
      setEndTime(null);
    }
  }, []);

  useEffect(() => {
    if (endTime === null) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (endTime === null) return null;

  const remaining = getTimeRemaining(endTime);
  const isUrgent = !remaining.expired && remaining.total < 600000;
  const countdownStr = formatCountdown(endTime);

  if (remaining.expired) {
    return (
      <button onClick={() => navigate("/")} className="w-full text-left">
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-red-700 text-sm font-medium">{label}</p>
              <p className="text-red-600 text-xs">Time's up! Move your car.</p>
            </div>
          </CardContent>
        </Card>
      </button>
    );
  }

  return (
    <button onClick={() => navigate("/")} className="w-full text-left">
      <Card
        className={
          isUrgent
            ? "border-amber-300 bg-amber-50"
            : "border-blue-200 bg-blue-50"
        }
      >
        <CardContent className="p-3 flex items-center gap-3">
          <Clock
            className={`w-5 h-5 shrink-0 ${
              isUrgent ? "text-amber-600" : "text-blue-600"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                isUrgent ? "text-amber-700" : "text-blue-700"
              }`}
            >
              {label}
            </p>
            <p
              className={`text-lg font-mono font-medium ${
                isUrgent ? "text-amber-800" : "text-blue-800"
              }`}
            >
              {countdownStr}
            </p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

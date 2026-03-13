let timerId: ReturnType<typeof setTimeout> | null = null;
let scheduledEndTime: number | null = null;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function scheduleTimerNotification(endTime: number) {
  console.log("[notify] scheduleTimerNotification called", {
    endTime,
    scheduledEndTime,
    delay: endTime - Date.now(),
    permission: "Notification" in window ? Notification.permission : "not supported",
  });
  if (scheduledEndTime === endTime) return;
  cancelTimerNotification();
  const delay = endTime - Date.now();
  if (delay <= 0) {
    console.log("[notify] delay <= 0, skipping");
    return;
  }
  scheduledEndTime = endTime;
  console.log("[notify] scheduling notification in", delay, "ms");
  timerId = setTimeout(() => {
    console.log("[notify] timer fired, permission:", Notification.permission);
    if (Notification.permission === "granted") {
      const n = new Notification("ParkingPal", {
        body: "Time's up! Move your car.",
        icon: "/pwa-192x192.png",
        tag: "parking-timer",
      });
      console.log("[notify] notification created", n);
    }
    scheduledEndTime = null;
    timerId = null;
  }, delay);
}

export function cancelTimerNotification() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  scheduledEndTime = null;
}

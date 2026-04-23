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
  if (scheduledEndTime === endTime) return;
  cancelTimerNotification();
  const delay = endTime - Date.now();
  if (delay <= 0) return;
  scheduledEndTime = endTime;
  timerId = setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification("ParkingPal", {
        body: "Time's up! Move your car.",
        icon: "/pwa-192x192.png",
      });
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

import { useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { compressImage } from "./compress-image";

export function HistoryPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      compressImage(file).then((dataUrl) => {
        navigate("/scan", { state: { capturedImage: dataUrl, mimeType: file.type } });
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [navigate]
  );

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center justify-center size-10 rounded-[4px] text-[#155dfc] hover:bg-[#155dfc]/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <h1 className="text-xl font-semibold">History</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Your past parking sessions will appear here.
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-3 text-sm font-medium text-[#155dfc] hover:underline"
      >
        Upload a photo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />
    </div>
  );
}

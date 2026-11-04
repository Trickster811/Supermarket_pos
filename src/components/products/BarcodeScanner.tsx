import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({
  onDetected,
  onClose,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");

  onDetectedRef.current = onDetected;

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();

    let stopped = false;
    let controls: { stop: () => void } | undefined;

    async function startScanner() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (stopped) return;

        if (devices.length === 0) {
          setError("No camera was found on this device.");
          return;
        }

        const camera =
          devices.find((device) =>
            /back|rear|environment/i.test(device.label),
          ) ?? devices[devices.length - 1];

        const scannerControls = await reader.decodeFromVideoDevice(
          camera.deviceId,
          videoRef.current!,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              controls?.stop();
              onDetectedRef.current(result.getText());
            }
          },
        );

        controls = scannerControls;

        if (stopped) controls.stop();
      } catch {
        if (!stopped) {
          setError(
            "Unable to access the camera. Check browser permissions and try again.",
          );
        }
      }
    }

    void startScanner();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scan Barcode</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <video
          ref={videoRef}
          className="w-full rounded-lg bg-black"
          autoPlay
          muted
          playsInline
        />

        {error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            Position the barcode inside the camera view.
          </p>
        )}
      </div>
    </div>
  );
}

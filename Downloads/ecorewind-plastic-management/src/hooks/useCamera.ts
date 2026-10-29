import { useState, useEffect, useRef, useCallback } from "react";

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsStarting(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera API is not supported on this browser or environment.");
      setHasPermission(false);
      setIsStarting(false);
      return;
    }

    // Stop any existing tracks before requesting new
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        // Fallback to basic video constraint without facingMode or resolution requirements
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setHasPermission(true);
      setError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      setHasPermission(false);
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera in your browser settings."
          : "Camera not available or is in use by another app. You can use sample items or photo upload.";
      setError(msg);
    } finally {
      setIsStarting(false);
    }
  }, []);

  // Ensure video element always binds to stream even when remounted
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Draw centered square crop
      const videoRatio = video.videoWidth / video.videoHeight;
      let sx = 0,
        sy = 0,
        sw = video.videoWidth,
        sh = video.videoHeight;

      if (videoRatio > 1) {
        sw = video.videoHeight;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth;
        sy = (video.videoHeight - sh) / 2;
      }

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 224, 224);
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        0.88
      );
    });
  }, []);

  // Cleanup only on true component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
        streamRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    stream,
    error,
    isStarting,
    hasPermission,
    startCamera,
    stopCamera,
    captureFrame,
  };
}

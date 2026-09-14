import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type Props = {
  latitude: number;
  longitude: number;
  label: string;
};

export type ChildMapRef = {
  recenter: () => void;
};

declare global {
  interface Window {
    google?: any;
    __initChildMap?: () => void;
  }
}

let loaderPromise: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
  const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];

  loaderPromise = new Promise<void>((resolve, reject) => {
    if (!key) {
      reject(new Error("Map key missing"));
      return;
    }
    window.__initChildMap = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initChildMap${
      channel ? `&channel=${channel}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Map failed to load"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

const ChildMap = forwardRef<ChildMapRef, Props>(function ChildMap(
  { latitude, longitude, label },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (mapRef.current) {
        mapRef.current.panTo({ lat: latitude, lng: longitude });
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(containerRef.current, {
            center: { lat: latitude, lng: longitude },
            zoom: 16,
            clickableIcons: false,
            disableDefaultUI: true,
            zoomControl: true,
          });
          markerRef.current = new window.google.maps.Marker({
            map: mapRef.current,
            position: { lat: latitude, lng: longitude },
            title: label,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const position = { lat: latitude, lng: longitude };
    markerRef.current.setPosition(position);
    markerRef.current.setTitle(label);
    mapRef.current.panTo(position);
  }, [latitude, longitude, label]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
        The map could not be loaded right now. The position is still being recorded.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full"
      aria-label="Map showing the child's position"
    />
  );
});

export default ChildMap;

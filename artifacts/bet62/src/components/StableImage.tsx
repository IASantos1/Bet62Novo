import { useEffect, useRef, useState } from "react";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

export default function StableImage({ src, loading, decoding, ...rest }: Props) {
  const [stableSrc, setStableSrc] = useState<string | null>(src ?? null);
  const stableSrcRef = useRef<string | null>(stableSrc);
  const badSrcsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    stableSrcRef.current = stableSrc;
  }, [stableSrc]);

  useEffect(() => {
    const desired = src ?? null;
    if (!desired) return;
    if (badSrcsRef.current.has(desired)) return;
    if (desired === stableSrcRef.current) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setStableSrc(desired);
    };
    img.onerror = () => {
      if (cancelled) return;
      badSrcsRef.current.add(desired);
    };
    img.src = desired;

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!stableSrc) return null;
  return (
    <img
      {...rest}
      src={stableSrc}
      loading={loading ?? "lazy"}
      decoding={decoding ?? "async"}
    />
  );
}

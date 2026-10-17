import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

export function siteFaviconUrl(pageUrl: string): string | undefined {
  try {
    const page = new URL(pageUrl);
    if (page.protocol !== "http:" && page.protocol !== "https:") return undefined;
    return new URL("/favicon.ico", page.origin).href;
  } catch {
    return undefined;
  }
}

export function googleFaviconUrl(pageUrl: string): string | undefined {
  try {
    const page = new URL(pageUrl);
    if (page.protocol !== "http:" && page.protocol !== "https:") return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(page.hostname)}&sz=64`;
  } catch {
    return undefined;
  }
}

export async function extractPageFaviconUrl(pageUrl: string): Promise<string | undefined> {
  try {
    const page = new URL(pageUrl);
    if (page.protocol !== "http:" && page.protocol !== "https:") return undefined;

    // Extension pages can read a cross-origin document only when its host permission
    // has already been granted. Skip fetch entirely otherwise to avoid CORS errors.
    const hasHostPermission = await chrome.permissions.contains({
      origins: [`${page.origin}/*`],
    });
    if (!hasHostPermission) return undefined;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(pageUrl, { credentials: "include", signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) return undefined;

    const html = await response.text();
    const document = new DOMParser().parseFromString(html, "text/html");
    const iconLink = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel][href]"))
      .find((link) => link.rel.toLowerCase().split(/\s+/).includes("icon"));
    const href = iconLink?.getAttribute("href");
    if (!href) return undefined;

    const resolved = new URL(href, response.url || pageUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : undefined;
  } catch {
    // Host permissionやCORSでHTMLを読めない場合は直接faviconとGoogleへフォールバックする。
    return undefined;
  }
}

export function preferredFaviconUrl(iconUrl: string | undefined, pageUrl: string): string | undefined {
  if (iconUrl && !iconUrl.startsWith("https://www.google.com/s2/favicons?")) return iconUrl;
  return siteFaviconUrl(pageUrl) || iconUrl || googleFaviconUrl(pageUrl);
}

export function FaviconImage({
  pageUrl,
  iconUrl,
  alt = "",
  style,
}: {
  pageUrl: string;
  iconUrl?: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const initialUrl = preferredFaviconUrl(iconUrl, pageUrl);
  const [src, setSrc] = useState(initialUrl);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let active = true;
    const isCustom = iconUrl && !iconUrl.startsWith("https://www.google.com/s2/favicons?");
    if (isCustom) {
      setSrc(iconUrl);
      return () => { active = false; };
    }

    const directUrl = siteFaviconUrl(pageUrl);
    setSrc(directUrl || googleFaviconUrl(pageUrl));
    void extractPageFaviconUrl(pageUrl).then((resolved) => {
      if (active && resolved) setSrc(resolved);
    });
    return () => { active = false; };
  }, [iconUrl, pageUrl]);

  useEffect(() => {
    if (imageRef.current) imageRef.current.style.visibility = "";
  }, [src]);

  if (!src) return null;
  return (
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      style={style}
      onError={(ev) => {
        const image = ev.currentTarget;
        const googleUrl = googleFaviconUrl(pageUrl);
        if (!googleUrl || image.src === googleUrl) {
          image.style.visibility = "hidden";
          return;
        }
        image.src = googleUrl;
      }}
    />
  );
}

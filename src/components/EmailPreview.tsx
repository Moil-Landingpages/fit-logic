"use client";

import { useState } from "react";
import { Monitor, Smartphone, Code, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface EmailPreviewProps {
  html: string;
  subject?: string;
  previewText?: string;
  className?: string;
}

export function EmailPreview({ html, subject, previewText, className }: EmailPreviewProps) {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [showSource, setShowSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const wrappedHtml = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;background:#fff}img{max-width:100%;height:auto}a{color:#2563eb}p{margin:0 0 12px}</style>
    </head><body>${html || '<p style="color:#999;text-align:center;padding:40px">No email content yet</p>'}</body></html>
  `;

  const autoResizeIframe = (iframe: HTMLIFrameElement) => {
    const resize = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          const h = body.scrollHeight + 32;
          iframe.style.height = Math.max(300, h) + "px";
        }
      } catch {
        // cross-origin guard
      }
    };
    resize();
    setTimeout(resize, 150);
    setTimeout(resize, 500);
    setTimeout(resize, 1200);
  };

  const Toolbar = ({ compact }: { compact?: boolean }) => (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
      <div className="flex items-center gap-1">
        <Button
          variant={view === "desktop" && !showSource ? "secondary" : "ghost"}
          size="sm" className="h-7 px-2 text-xs"
          onClick={() => { setView("desktop"); setShowSource(false); }}
        >
          <Monitor className="h-3 w-3 mr-1" />Desktop
        </Button>
        <Button
          variant={view === "mobile" && !showSource ? "secondary" : "ghost"}
          size="sm" className="h-7 px-2 text-xs"
          onClick={() => { setView("mobile"); setShowSource(false); }}
        >
          <Smartphone className="h-3 w-3 mr-1" />Mobile
        </Button>
        <Button
          variant={showSource ? "secondary" : "ghost"}
          size="sm" className="h-7 px-2 text-xs"
          onClick={() => setShowSource(!showSource)}
        >
          <Code className="h-3 w-3 mr-1" />Source
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        {subject && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
            {subject}
          </span>
        )}
        {compact && (
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
            title="Expand full email"
            onClick={() => { setFullscreen(true); setShowSource(false); }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  const InboxHeader = () =>
    !showSource && (subject || previewText) ? (
      <div className="px-4 py-2.5 border-b bg-muted/10 shrink-0">
        {subject && <p className="text-sm font-semibold text-foreground truncate">{subject}</p>}
        {previewText && <p className="text-xs text-muted-foreground truncate">{previewText}</p>}
      </div>
    ) : null;

  const EmailFrame = ({ fullHeight }: { fullHeight?: boolean }) =>
    showSource ? (
      <pre className="p-3 text-xs font-mono text-muted-foreground overflow-auto bg-muted/20 whitespace-pre-wrap flex-1">
        {html || "No content"}
      </pre>
    ) : (
      <div className={cn(
        "flex justify-center bg-muted/10 p-4",
        fullHeight ? "flex-1 overflow-y-auto" : "max-h-[480px] overflow-y-auto"
      )}>
        <div className={cn(
          "bg-background rounded shadow-sm border w-full",
          view === "desktop" ? "max-w-[600px]" : "max-w-[375px]"
        )}>
          <iframe
            srcDoc={wrappedHtml}
            className="w-full border-0 block"
            style={{ minHeight: 380 }}
            sandbox="allow-same-origin"
            title="Email preview"
            onLoad={(e) => autoResizeIframe(e.target as HTMLIFrameElement)}
          />
        </div>
      </div>
    );

  return (
    <>
      {/* Compact inline preview */}
      <div className={cn("rounded-lg border bg-card overflow-hidden flex flex-col", className)}>
        <Toolbar compact />
        <InboxHeader />
        <EmailFrame />
      </div>

      {/* Fullscreen preview dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-4xl h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-semibold truncate">
              {subject || "Email Preview"}
            </DialogTitle>
            {previewText && (
              <p className="text-xs text-muted-foreground truncate">{previewText}</p>
            )}
          </DialogHeader>
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30 shrink-0">
            <Button
              variant={view === "desktop" && !showSource ? "secondary" : "ghost"}
              size="sm" className="h-7 px-2 text-xs"
              onClick={() => { setView("desktop"); setShowSource(false); }}
            >
              <Monitor className="h-3 w-3 mr-1" />Desktop
            </Button>
            <Button
              variant={view === "mobile" && !showSource ? "secondary" : "ghost"}
              size="sm" className="h-7 px-2 text-xs"
              onClick={() => { setView("mobile"); setShowSource(false); }}
            >
              <Smartphone className="h-3 w-3 mr-1" />Mobile
            </Button>
            <Button
              variant={showSource ? "secondary" : "ghost"}
              size="sm" className="h-7 px-2 text-xs"
              onClick={() => setShowSource(!showSource)}
            >
              <Code className="h-3 w-3 mr-1" />Source
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto flex justify-center bg-muted/10 p-6">
            {showSource ? (
              <pre className="w-full text-xs font-mono text-muted-foreground whitespace-pre-wrap bg-muted/20 p-4 rounded-lg">
                {html || "No content"}
              </pre>
            ) : (
              <div className={cn(
                "bg-background rounded-lg shadow-md border w-full",
                view === "desktop" ? "max-w-[650px]" : "max-w-[400px]"
              )}>
                <iframe
                  srcDoc={wrappedHtml}
                  className="w-full border-0 block rounded-lg"
                  style={{ minHeight: 600 }}
                  sandbox="allow-same-origin"
                  title="Email preview fullscreen"
                  onLoad={(e) => autoResizeIframe(e.target as HTMLIFrameElement)}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

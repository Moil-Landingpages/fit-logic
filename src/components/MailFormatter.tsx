"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface ParsedEmail {
  subject: string;
  body: string;
  isHtml: boolean;
}

interface MailFormatterProps {
  content: string | null | undefined;
  patientName?: string;
  patientEmail?: string;
  createdAt?: string;
  className?: string;
}

function parseEmailContent(content: string | null | undefined): ParsedEmail {
  // Handle content stored as "Subject: X\n\nBody"
  const safeContent = content ?? "";
  const lines = safeContent.split("\n");
  let subject = "";
  let bodyStartIndex = 0;

  // Check if first line is subject
  if (lines[0]?.startsWith("Subject:")) {
    subject = lines[0].replace("Subject:", "").trim();
    bodyStartIndex = 1;
    // Skip empty line after subject
    if (lines[1] === "") {
      bodyStartIndex = 2;
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();

  // Detect if body is HTML
  const isHtml = /<[^>]+>/.test(body);

  return { subject, body, isHtml };
}

function formatPlainText(text: string): string {
  // Convert plain text to safe HTML
  return (
    text
      // Escape HTML entities
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Convert URLs to links
      .replace(
        /(https?:\/\/[^\s<]+[^<.,;:!?\s])/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
      )
      // Convert email addresses to mailto links
      .replace(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
        '<a href="mailto:$1" class="text-primary underline hover:text-primary/80">$1</a>'
      )
      // Preserve line breaks
      .replace(/\n/g, "<br/>")
      // Preserve multiple spaces
      .replace(/  /g, " &nbsp;")
  );
}

export function MailFormatter({
  content,
  patientName,
  patientEmail,
  createdAt,
  className,
}: MailFormatterProps) {
  const parsed = useMemo(() => parseEmailContent(content), [content]);

  const sanitizedHtml = useMemo(() => {
    if (parsed.isHtml) {
      // Clean HTML content
      return DOMPurify.sanitize(parsed.body, {
        ALLOWED_TAGS: [
          "p",
          "br",
          "strong",
          "b",
          "em",
          "i",
          "u",
          "a",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "blockquote",
          "div",
          "span",
          "img",
          "table",
          "thead",
          "tbody",
          "tr",
          "td",
          "th",
        ],
        ALLOWED_ATTR: [
          "href",
          "target",
          "rel",
          "src",
          "alt",
          "width",
          "height",
          "style",
          "class",
        ],
      });
    }
    return formatPlainText(parsed.body);
  }, [parsed]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Email Header */}
      <div className="bg-muted/50 border-b px-4 py-3">
        {parsed.subject && (
          <h3 className="font-semibold text-base mb-2 line-clamp-2">
            {parsed.subject}
          </h3>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {patientName && (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">From:</span>
              <span>
                {patientName}
                {patientEmail && (
                  <span className="text-muted-foreground"> &lt;{patientEmail}&gt;</span>
                )}
              </span>
            </div>
          )}
          {createdAt && (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">Date:</span>
              <span>
                {new Date(createdAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Email Body */}
      <div className="p-4">
        <div
          className={cn(
            "prose prose-sm max-w-none",
            "prose-p:my-2 prose-headings:mb-3 prose-headings:mt-4",
            "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
            "prose-blockquote:border-l-2 prose-blockquote:border-muted prose-blockquote:pl-4 prose-blockquote:italic",
            "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
            "prose-img:rounded-md prose-img:max-w-full",
            "text-foreground"
          )}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>
    </Card>
  );
}

// Simple preview variant for list views. Strips HTML tags + collapses
// whitespace so an inbound HTML email shows a readable snippet instead of
// a wall of `<table>` source.
export function MailPreview({ content, maxLength = 120 }: { content: string | null | undefined; maxLength?: number }) {
  const parsed = useMemo(() => parseEmailContent(content), [content]);
  const plain = useMemo(() => {
    const body = parsed.body ?? "";
    return body
      .replace(/<!doctype[\s\S]*?>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }, [parsed.body]);
  const preview = plain.slice(0, maxLength).trim();
  const hasMore = plain.length > maxLength;

  return (
    <div className="line-clamp-2 text-sm text-muted-foreground">
      {parsed.subject && (
        <span className="font-medium text-foreground mr-1">{parsed.subject}</span>
      )}
      {preview}
      {hasMore && "..."}
    </div>
  );
}

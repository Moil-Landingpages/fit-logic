"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  Bold, Italic, Link, List, ListOrdered, Eye, Code, Type,
  User, Building, Mail, Calendar, Variable, Undo, Redo, AlignLeft,
  Heading1, Heading2, Quote, SeparatorHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface RichEmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  subject?: string;
  previewText?: string;
}

// Available variables for insertion
const VARIABLES = [
  { key: "first_name", label: "First Name", icon: User },
  { key: "last_name", label: "Last Name", icon: User },
  { key: "name", label: "Full Name", icon: User },
  { key: "email", label: "Email", icon: Mail },
  { key: "company", label: "Company", icon: Building },
  { key: "phone", label: "Phone", icon: PhoneIcon },
  { key: "date", label: "Current Date", icon: Calendar },
];

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// Simple HTML to plain text conversion for visual editing
function htmlToPlainText(html: string): string {
  if (!html) return "";
  // Replace <br>, <br/> with newlines
  let text = html.replace(/<br\s*\/?>/gi, "\n");
  // Replace </p> with newlines
  text = text.replace(/<\/p>/gi, "\n");
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// Plain text to simple HTML conversion
function plainTextToHtml(text: string): string {
  if (!text) return "";
  // Escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  // Convert newlines to <br> and wrap in <p> tags for paragraphs
  const paragraphs = html.split(/\n\n/).filter(p => p.trim());
  if (paragraphs.length === 0) return "";
  if (paragraphs.length === 1 && !html.includes("\n")) {
    // Single paragraph, use <br> for line breaks
    return `<p>${html.replace(/\n/g, "<br>")}</p>`;
  }
  // Multiple paragraphs
  return paragraphs
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function RichEmailEditor({
  value,
  onChange,
  placeholder = "Write your email content here...",
  minHeight = 200,
  className,
  subject,
  previewText,
}: RichEmailEditorProps) {
  const [mode, setMode] = useState<"visual" | "html" | "preview">("visual");
  const [visualText, setVisualText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visualTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync visual text with HTML value
  useEffect(() => {
    if (mode === "visual") {
      setVisualText(htmlToPlainText(value));
    }
  }, [mode, value]);

  // Handle visual mode changes
  const handleVisualChange = (newText: string) => {
    setVisualText(newText);
    const html = plainTextToHtml(newText);
    onChange(html);
  };

  // Insert variable at cursor position
  const insertVariable = (variableKey: string) => {
    const ref = mode === "visual" ? visualTextareaRef : textareaRef;
    const currentValue = mode === "visual" ? visualText : value;
    const insertText = `{{${variableKey}}}`;

    const el = ref.current;
    if (el) {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const newValue = currentValue.slice(0, start) + insertText + currentValue.slice(end);

      if (mode === "visual") {
        handleVisualChange(newValue);
      } else {
        onChange(newValue);
      }

      // Restore cursor position after insertion
      setTimeout(() => {
        const newPos = start + insertText.length;
        el.setSelectionRange(newPos, newPos);
        el.focus();
      }, 0);
    } else {
      // Fallback: append to end
      const newValue = currentValue + insertText;
      if (mode === "visual") {
        handleVisualChange(newValue);
      } else {
        onChange(newValue);
      }
    }
  };

  // Wrap selected text with HTML tag
  const wrapSelection = (tag: string, attributes?: string) => {
    if (mode !== "html") return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selectedText = value.slice(start, end);

    if (!selectedText) return;

    const attrStr = attributes ? ` ${attributes}` : "";
    const openTag = `<${tag}${attrStr}>`;
    const closeTag = `</${tag}>`;
    const newValue = value.slice(0, start) + openTag + selectedText + closeTag + value.slice(end);

    onChange(newValue);

    setTimeout(() => {
      const newCursorPos = start + openTag.length + selectedText.length + closeTag.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
      el.focus();
    }, 0);
  };

  // Toolbar button component
  const ToolbarButton = ({
    icon: Icon,
    label,
    onClick,
    active = false,
    disabled = false,
  }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 w-7 p-0",
        active && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  // Render HTML preview
  const renderPreview = () => {
    const sanitized = DOMPurify.sanitize(value || "<p style='color:#999;text-align:center;padding:40px'>No content yet</p>");
    return (
      <div className="rounded border bg-white">
        {subject && (
          <div className="px-4 py-2 border-b bg-muted/10">
            <p className="text-sm font-semibold truncate">{subject}</p>
            {previewText && <p className="text-xs text-muted-foreground truncate">{previewText}</p>}
          </div>
        )}
        <div className="p-4 prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </div>
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 rounded-lg border bg-muted/20">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mr-2">
          <Toggle
            pressed={mode === "visual"}
            onPressedChange={() => setMode("visual")}
            className="h-7 text-xs px-2"
          >
            <Type className="h-3.5 w-3.5 mr-1" />
            Visual
          </Toggle>
          <Toggle
            pressed={mode === "html"}
            onPressedChange={() => setMode("html")}
            className="h-7 text-xs px-2"
          >
            <Code className="h-3.5 w-3.5 mr-1" />
            HTML
          </Toggle>
          <Toggle
            pressed={mode === "preview"}
            onPressedChange={() => setMode("preview")}
            className="h-7 text-xs px-2"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Preview
          </Toggle>
        </div>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Formatting buttons - only active in HTML mode */}
        <ToolbarButton
          icon={Bold}
          label="Bold"
          onClick={() => wrapSelection("strong")}
          disabled={mode !== "html"}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic"
          onClick={() => wrapSelection("em")}
          disabled={mode !== "html"}
        />
        <ToolbarButton
          icon={Link}
          label="Link"
          onClick={() => {
            const url = prompt("Enter URL:");
            if (url) wrapSelection("a", `href="${url}"`);
          }}
          disabled={mode !== "html"}
        />

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Variable insertion */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
              <Variable className="h-3.5 w-3.5" />
              Insert Variable
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-2 py-1">
              Contact Fields
            </div>
            {VARIABLES.map((variable) => (
              <Button
                key={variable.key}
                variant="ghost"
                size="sm"
                className="w-full justify-start h-8 text-xs"
                onClick={() => insertVariable(variable.key)}
              >
                <variable.icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <span className="flex-1">{variable.label}</span>
                <code className="text-[10px] bg-muted px-1 rounded">{`{{${variable.key}}}`}</code>
              </Button>
            ))}
            <Separator className="my-1" />
            <div className="px-2 py-1">
              <p className="text-[10px] text-muted-foreground">
                Variables will be replaced with contact data when sent.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor content */}
      <div className="space-y-2">
        {mode === "visual" && (
          <>
            <Textarea
              ref={visualTextareaRef}
              value={visualText}
              onChange={(e) => handleVisualChange(e.target.value)}
              placeholder={placeholder}
              className="min-h-[200px] resize-y font-normal text-sm leading-relaxed"
              style={{ minHeight }}
            />
            <p className="text-[10px] text-muted-foreground">
              <span className="font-medium">Tip:</span> Write naturally. Use double Enter for paragraphs.
              Click "Insert Variable" to personalize with contact data.
            </p>
          </>
        )}

        {mode === "html" && (
          <>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`<p>Hi {{first_name}},</p>\n\n<p>Welcome to our service!</p>\n\n<p>Best,<br>Team</p>`}
              className="min-h-[200px] resize-y font-mono text-xs"
              style={{ minHeight }}
            />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Code className="h-3 w-3" />
              <span>HTML mode. Use <code className="bg-muted px-1 rounded">{`{{first_name}}`}</code> for variables.</span>
            </p>
          </>
        )}

        {mode === "preview" && (
          <div className="space-y-2">
            {renderPreview()}
            <p className="text-[10px] text-muted-foreground">
              This is how your email will look when received.
            </p>
          </div>
        )}
      </div>

      {/* Quick variable chips - shown in visual and html modes */}
      {(mode === "visual" || mode === "html") && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1 self-center">Quick insert:</span>
          {VARIABLES.slice(0, 5).map((variable) => (
            <Button
              key={variable.key}
              variant="outline"
              size="sm"
              className="h-5 text-[10px] px-1.5"
              onClick={() => insertVariable(variable.key)}
            >
              {`{{${variable.key}}}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

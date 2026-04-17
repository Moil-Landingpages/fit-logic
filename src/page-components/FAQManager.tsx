"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight, Sparkles, ChevronDown, ChevronRight, MessageSquare, Zap, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CATEGORY_CONFIG, type InquiryCategory } from "@/lib/types";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  active: boolean;
}

const CATEGORIES: InquiryCategory[] = [
  "Appointment_Scheduling", "Prescription_Lab_Requests", "Health_Questions",
  "Billing_Insurance", "Urgent_Red_Flags", "General_Info",
];

const FAQManager = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqRow | null>(null);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "General_Info" as InquiryCategory });
  const [aiGenerating, setAiGenerating] = useState(false);

  const { data: faqs = [] } = useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faqs").select("*").order("category", { ascending: true });
      if (error) throw error;
      return data as FaqRow[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ id, ...form }: { id?: string; question: string; answer: string; category: string }) => {
      if (id) {
        const { error } = await supabase.from("faqs").update(form).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faqs").insert({ ...form, active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setDialogOpen(false);
      toast.success(editingFaq ? "FAQ updated" : "FAQ created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setDeletingFaqId(null);
      toast.success("FAQ deleted");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("faqs").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faqs"] }),
  });

  const filtered = faqs.filter((f) => {
    if (search && !f.question.toLowerCase().includes(search.toLowerCase()) && !f.answer.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab !== "all" && f.category !== activeTab) return false;
    return true;
  });

  const openNew = () => { setEditingFaq(null); setForm({ question: "", answer: "", category: "General_Info" }); setDialogOpen(true); };
  const openEdit = (faq: FaqRow) => { setEditingFaq(faq); setForm({ question: faq.question, answer: faq.answer, category: faq.category as InquiryCategory }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.question.trim() || !form.answer.trim()) { toast.error("Please fill in both question and answer"); return; }
    upsertMutation.mutate({ id: editingFaq?.id, ...form });
  };

  const handleAiGenerate = async () => {
    if (!form.question.trim()) { toast.error("Enter a question first"); return; }
    setAiGenerating(true);
    try {
      const res = await fetch("/api/generate-faq-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: form.question, category: form.category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate answer");
      if (data?.answer) {
        setForm(prev => ({ ...prev, answer: data.answer }));
        toast.success("AI generated an answer — review and edit as needed");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate answer");
    } finally {
      setAiGenerating(false);
    }
  };

  const activeCount = faqs.filter(f => f.active).length;
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = faqs.filter(f => f.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">FAQ Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-respond to common inquiries · AI-powered answers grounded in your business
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5 gradient-brand text-primary-foreground">
          <Plus className="h-4 w-4" />Add FAQ
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <BookOpen className="h-3.5 w-3.5" />Total FAQs
          </div>
          <p className="text-2xl font-bold">{faqs.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <Zap className="h-3.5 w-3.5" />Active Auto-Responses
          </div>
          <p className="text-2xl font-bold text-category-health">{activeCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
            <MessageSquare className="h-3.5 w-3.5" />Categories Covered
          </div>
          <p className="text-2xl font-bold">{Object.values(categoryCounts).filter(c => c > 0).length}/{CATEGORIES.length}</p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All ({faqs.length})
        </button>
        {CATEGORIES.map(cat => {
          const config = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {config.label} ({categoryCounts[cat] || 0})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search questions and answers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* FAQ list */}
      <div className="space-y-2">
        {filtered.map((faq) => {
          const isExpanded = expandedId === faq.id;
          return (
            <div
              key={faq.id}
              className={`rounded-lg border bg-card shadow-card transition-all ${!faq.active ? "opacity-50" : ""}`}
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : faq.id)}
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <h3 className="font-medium text-sm flex-1 min-w-0">{faq.question}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CategoryBadge category={faq.category as InquiryCategory} />
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: faq.id, active: !faq.active }); }}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {faq.active ? <ToggleRight className="h-4 w-4 text-category-health" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(faq); }}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingFaqId(faq.id); }}
                    className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 pl-11">
                  <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground whitespace-pre-line">
                    {faq.answer}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No FAQs found</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add your first FAQ
            </Button>
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingFaq ? "Edit FAQ" : "New FAQ"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Question</Label>
              <Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="e.g. How much does a consultation cost?" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as InquiryCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_CONFIG[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Answer</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !form.question.trim()}
                >
                  <Sparkles className="h-3 w-3" />
                  {aiGenerating ? "Generating..." : "AI Generate"}
                </Button>
              </div>
              <Textarea
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                placeholder="The response clients will receive..."
                className="min-h-[150px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={upsertMutation.isPending} className="gradient-brand text-primary-foreground">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingFaqId} onOpenChange={(open) => !open && setDeletingFaqId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this FAQ?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this FAQ and its auto-response.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingFaqId && deleteMutation.mutate(deletingFaqId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FAQManager;

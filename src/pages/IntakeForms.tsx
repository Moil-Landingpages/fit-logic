import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  QUESTION_TYPE_CONFIG, SUBMISSION_STATUS_CONFIG, REVIEW_STATUS_CONFIG,
  type FormQuestion, type QuestionType, type SubmissionStatus, type ReviewStatus,
} from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Plus, Search, Eye, ClipboardList, CheckCircle2, AlertCircle,
  GripVertical, Trash2, Copy, ExternalLink,
  Type, AlignLeft, CircleDot, CheckSquare, Calendar, ChevronDown, Hash,
} from "lucide-react";

const QUESTION_ICONS: Record<string, React.ReactNode> = {
  Type: <Type className="h-4 w-4" />, AlignLeft: <AlignLeft className="h-4 w-4" />,
  CircleDot: <CircleDot className="h-4 w-4" />, CheckSquare: <CheckSquare className="h-4 w-4" />,
  Calendar: <Calendar className="h-4 w-4" />, ChevronDown: <ChevronDown className="h-4 w-4" />,
  Hash: <Hash className="h-4 w-4" />,
};

interface FormRow {
  id: string;
  name: string;
  description: string | null;
  questions: FormQuestion[];
  active: boolean;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  form_id: string;
  patient_id: string | null;
  patient_name: string;
  patient_email: string | null;
  submission_data: Record<string, any>;
  completion_status: string;
  review_status: string;
  staff_notes: string | null;
  submitted_at: string | null;
  created_at: string;
}

// Form Templates list
function FormTemplates({ forms, onSelect, selectedId }: { forms: FormRow[]; onSelect: (id: string) => void; selectedId: string | null }) {
  return (
    <div className="space-y-3">
      {forms.map((form) => (
        <Card key={form.id} className={`cursor-pointer transition-all hover:shadow-elevated ${selectedId === form.id ? "ring-2 ring-primary" : ""}`} onClick={() => onSelect(form.id)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading font-semibold text-foreground truncate">{form.name}</h3>
                  <Badge variant={form.active ? "default" : "secondary"} className="text-[10px] shrink-0">{form.active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">{form.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{form.questions.length} questions</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{form.submission_count} submissions</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Form Builder
function FormBuilder({ form, onUpdate }: { form: FormRow; onUpdate: (id: string, updates: Partial<FormRow>) => void }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const selectedQuestion = form.questions.find((q) => q.id === selectedQuestionId) || null;

  const updateQuestion = (qId: string, updates: Partial<FormQuestion>) => {
    const newQuestions = form.questions.map((q) => (q.id === qId ? { ...q, ...updates } : q));
    onUpdate(form.id, { questions: newQuestions });
  };

  const addQuestion = () => {
    const newQ: FormQuestion = { id: `q${Date.now()}`, label: "New Question", type: "text", required: false };
    onUpdate(form.id, { questions: [...form.questions, newQ] });
    setSelectedQuestionId(newQ.id);
  };

  const removeQuestion = (qId: string) => {
    onUpdate(form.id, { questions: form.questions.filter((q) => q.id !== qId) });
    if (selectedQuestionId === qId) setSelectedQuestionId(null);
  };

  return (
    <div className="flex h-full">
      <div className="w-[300px] border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-semibold text-sm text-foreground">Questions</h3>
            <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-3 w-3 mr-1" />Add</Button>
          </div>
          <Input value={form.name} onChange={(e) => onUpdate(form.id, { name: e.target.value })} className="text-sm font-medium" />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {form.questions.map((q, idx) => (
              <div key={q.id} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-colors ${selectedQuestionId === q.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`} onClick={() => setSelectedQuestionId(q.id)}>
                <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0 text-xs w-5">{idx + 1}.</span>
                {QUESTION_ICONS[QUESTION_TYPE_CONFIG[q.type].icon]}
                <span className="truncate flex-1">{q.label}</span>
                {q.required && <span className="text-destructive text-xs">*</span>}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0">
        {selectedQuestion ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-foreground">Edit Question</h3>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeQuestion(selectedQuestion.id)}><Trash2 className="h-4 w-4 mr-1" />Remove</Button>
            </div>
            <div className="space-y-4">
              <div><Label className="text-xs text-muted-foreground">Question Label</Label><Input value={selectedQuestion.label} onChange={(e) => updateQuestion(selectedQuestion.id, { label: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Question Type</Label>
                <Select value={selectedQuestion.type} onValueChange={(v) => updateQuestion(selectedQuestion.id, { type: v as QuestionType })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(QUESTION_TYPE_CONFIG).map(([key, config]) => (<SelectItem key={key} value={key}><span className="flex items-center gap-2">{QUESTION_ICONS[config.icon]}{config.label}</span></SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3"><Switch checked={selectedQuestion.required} onCheckedChange={(v) => updateQuestion(selectedQuestion.id, { required: v })} /><Label className="text-sm">Required field</Label></div>
              <div><Label className="text-xs text-muted-foreground">Help Text (optional)</Label><Input value={selectedQuestion.helpText || ""} onChange={(e) => updateQuestion(selectedQuestion.id, { helpText: e.target.value || undefined })} placeholder="Additional instructions" className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Placeholder (optional)</Label><Input value={selectedQuestion.placeholder || ""} onChange={(e) => updateQuestion(selectedQuestion.id, { placeholder: e.target.value || undefined })} className="mt-1" /></div>
              {["radio", "checkbox", "dropdown"].includes(selectedQuestion.type) && (
                <div><Label className="text-xs text-muted-foreground">Options (one per line)</Label><Textarea value={(selectedQuestion.options || []).join("\n")} onChange={(e) => updateQuestion(selectedQuestion.id, { options: e.target.value.split("\n").filter(Boolean) })} rows={5} className="mt-1 font-mono text-sm" /></div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ClipboardList className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Select a question to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Form Preview
function FormPreview({ form, open, onClose }: { form: FormRow; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader><DialogTitle className="font-heading">{form.name}</DialogTitle><p className="text-sm text-muted-foreground">{form.description}</p></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5 py-2">
            {form.questions.map((q, idx) => (
              <div key={q.id} className="space-y-2">
                <Label className="text-sm font-medium">{idx + 1}. {q.label}{q.required && <span className="text-destructive ml-1">*</span>}</Label>
                {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                {q.type === "text" && <Input disabled placeholder={q.placeholder} />}
                {q.type === "textarea" && <Textarea disabled placeholder={q.placeholder} rows={3} />}
                {q.type === "number" && <Input disabled type="number" placeholder={q.placeholder} />}
                {q.type === "date" && <Input disabled type="date" />}
                {q.type === "radio" && q.options?.map((opt) => (<div key={opt} className="flex items-center gap-2"><div className="h-4 w-4 rounded-full border border-input" /><span className="text-sm">{opt}</span></div>))}
                {q.type === "checkbox" && q.options?.map((opt) => (<div key={opt} className="flex items-center gap-2"><div className="h-4 w-4 rounded border border-input" /><span className="text-sm">{opt}</span></div>))}
                {q.type === "dropdown" && (<Select disabled><SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger></Select>)}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close Preview</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Submissions Panel
function SubmissionsPanel({ submissions, forms, onUpdateSubmission }: { submissions: SubmissionRow[]; forms: FormRow[]; onUpdateSubmission: (id: string, updates: Record<string, any>) => void }) {
  const [search, setSearch] = useState("");
  const [filterReview, setFilterReview] = useState<string>("all");
  const [selectedSub, setSelectedSub] = useState<SubmissionRow | null>(null);

  const filtered = submissions.filter((sub) => {
    const matchSearch = sub.patient_name.toLowerCase().includes(search.toLowerCase()) || (sub.patient_email?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchReview = filterReview === "all" || sub.review_status === filterReview;
    return matchSearch && matchReview;
  });

  const getFormName = (formId: string) => forms.find((f) => f.id === formId)?.name || "Unknown Form";
  const getFormQuestions = (formId: string) => forms.find((f) => f.id === formId)?.questions || [];

  return (
    <div className="flex h-full">
      <div className="w-[420px] border-r flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients..." className="pl-9" />
          </div>
          <Select value={filterReview} onValueChange={setFilterReview}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Filter by review status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Submissions</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="needs_revision">Needs Revision</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filtered.map((sub) => {
              const reviewCfg = REVIEW_STATUS_CONFIG[sub.review_status as ReviewStatus] || REVIEW_STATUS_CONFIG.pending;
              const completionCfg = SUBMISSION_STATUS_CONFIG[sub.completion_status as SubmissionStatus] || SUBMISSION_STATUS_CONFIG.incomplete;
              return (
                <div key={sub.id} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedSub?.id === sub.id ? "bg-accent" : "hover:bg-muted"}`} onClick={() => setSelectedSub(sub)}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm text-foreground">{sub.patient_name}</span>
                    <Badge variant="outline" className={`${reviewCfg.bgColor} ${reviewCfg.color} text-[10px]`}>{reviewCfg.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{getFormName(sub.form_id)}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className={`${completionCfg.bgColor} ${completionCfg.color} text-[10px]`}>{completionCfg.label}</Badge>
                    {sub.submitted_at && <span className="text-[10px] text-muted-foreground">{new Date(sub.submitted_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No submissions found</p>}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0">
        {selectedSub ? (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">{selectedSub.patient_name}</h2>
                  <p className="text-sm text-muted-foreground">{selectedSub.patient_email}</p>
                  <p className="text-xs text-muted-foreground mt-1">{getFormName(selectedSub.form_id)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-status-resolved border-status-resolved/30" onClick={() => onUpdateSubmission(selectedSub.id, { review_status: "approved" })}><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" className="text-status-escalated border-status-escalated/30" onClick={() => onUpdateSubmission(selectedSub.id, { review_status: "needs_revision" })}><AlertCircle className="h-3 w-3 mr-1" />Request Revision</Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-heading font-semibold text-sm text-foreground">Responses</h3>
                {getFormQuestions(selectedSub.form_id).map((q) => {
                  const answer = selectedSub.submission_data[q.id];
                  const displayAnswer = Array.isArray(answer) ? answer.join(", ") : answer || "—";
                  return (
                    <div key={q.id} className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-medium">{q.label}</Label>
                      <p className="text-sm text-foreground bg-muted/50 rounded-md p-2">{displayAnswer}</p>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <h3 className="font-heading font-semibold text-sm text-foreground">Staff Notes</h3>
                <Textarea value={selectedSub.staff_notes || ""} onChange={(e) => onUpdateSubmission(selectedSub.id, { staff_notes: e.target.value || null })} placeholder="Add notes about this submission..." rows={3} />
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ClipboardList className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Select a submission to review</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Page
const IntakeForms = () => {
  const queryClient = useQueryClient();
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [previewForm, setPreviewForm] = useState<FormRow | null>(null);

  const { data: forms = [] } = useQuery({
    queryKey: ["intake_forms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("intake_forms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FormRow[];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["intake_submissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("intake_submissions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SubmissionRow[];
    },
  });

  const selectedForm = forms.find((f) => f.id === selectedFormId) || null;

  const updateFormMut = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FormRow> }) => {
      const { error } = await supabase.from("intake_forms").update({
        name: updates.name,
        description: updates.description,
        questions: updates.questions as any,
        active: updates.active,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intake_forms"] }),
  });

  const addFormMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("intake_forms").insert({
        name: "Untitled Form",
        description: "New form",
        questions: [],
        active: false,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["intake_forms"] });
      setSelectedFormId(data.id);
    },
  });

  const updateSubmissionMut = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"intake_submissions"> }) => {
      const { error } = await supabase.from("intake_submissions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intake_submissions"] }),
  });

  const handleFormUpdate = (id: string, updates: Partial<FormRow>) => {
    // Optimistic update
    queryClient.setQueryData(["intake_forms"], (old: FormRow[] | undefined) =>
      old?.map((f) => (f.id === id ? { ...f, ...updates } : f)) || []
    );
    updateFormMut.mutate({ id, updates });
  };

  const handleSubmissionUpdate = (id: string, updates: Record<string, any>) => {
    queryClient.setQueryData(["intake_submissions"], (old: SubmissionRow[] | undefined) =>
      old?.map((s) => (s.id === id ? { ...s, ...updates } : s)) || []
    );
    updateSubmissionMut.mutate({ id, updates });
  };

  const pendingCount = submissions.filter((s) => s.review_status === "pending").length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="border-b bg-card p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">Forms</h1>
            <p className="text-sm text-muted-foreground">{forms.length} templates · {submissions.length} submissions · {pendingCount} pending review</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="templates" className="flex-1 flex flex-col min-h-0">
        <div className="border-b bg-card px-4">
          <TabsList className="h-10 bg-transparent p-0 gap-4">
            <TabsTrigger value="templates" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2">
              <FileText className="h-4 w-4 mr-1.5" />Form Templates
            </TabsTrigger>
            <TabsTrigger value="submissions" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2">
              <ClipboardList className="h-4 w-4 mr-1.5" />Submissions
              {pendingCount > 0 && <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="flex-1 min-h-0 mt-0">
          <div className="flex h-full">
            <div className="w-[340px] border-r flex flex-col">
              <div className="p-4 border-b">
                <Button onClick={() => addFormMut.mutate()} className="w-full gradient-brand text-primary-foreground" disabled={addFormMut.isPending}>
                  <Plus className="h-4 w-4 mr-2" />New Form Template
                </Button>
              </div>
              <ScrollArea className="flex-1"><div className="p-3"><FormTemplates forms={forms} onSelect={setSelectedFormId} selectedId={selectedFormId} /></div></ScrollArea>
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              {selectedForm ? (
                <>
                  <div className="p-4 border-b bg-card flex items-center justify-between shrink-0">
                    <div>
                      <h2 className="font-heading font-semibold text-foreground">{selectedForm.name}</h2>
                      <p className="text-xs text-muted-foreground">{selectedForm.questions.length} questions</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-3">
                        <Switch checked={selectedForm.active} onCheckedChange={(v) => handleFormUpdate(selectedForm.id, { active: v })} />
                        <Label className="text-xs">{selectedForm.active ? "Active" : "Inactive"}</Label>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setPreviewForm(selectedForm)}><Eye className="h-3 w-3 mr-1" />Preview</Button>
                      <Button size="sm" variant="outline" onClick={() => toast.info("Link copied!")}><ExternalLink className="h-3 w-3 mr-1" />Copy Link</Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0"><FormBuilder form={selectedForm} onUpdate={handleFormUpdate} /></div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <div className="rounded-2xl gradient-brand p-5 mb-4 shadow-glow"><FileText className="h-8 w-8 text-primary-foreground" /></div>
                  <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Form Builder</h3>
                  <p className="text-sm">Select a template or create a new one</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="submissions" className="flex-1 min-h-0 mt-0">
          <SubmissionsPanel submissions={submissions} forms={forms} onUpdateSubmission={handleSubmissionUpdate} />
        </TabsContent>
      </Tabs>

      {previewForm && <FormPreview form={previewForm} open={!!previewForm} onClose={() => setPreviewForm(null)} />}
    </div>
  );
};

export default IntakeForms;

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Share2, Copy, Plus, Check, Clock, UserCheck, Link2, Search, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";

interface ReferralRow {
  id: string;
  referrer_name: string;
  referrer_email: string;
  referral_code: string;
  referred_name: string | null;
  referred_email: string | null;
  status: string;
  converted_at: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: "Pending", color: "text-status-pending", bgColor: "bg-status-pending/10" },
  clicked: { label: "Link Clicked", color: "text-status-assigned", bgColor: "bg-status-assigned/10" },
  signed_up: { label: "Signed Up", color: "text-primary", bgColor: "bg-primary/10" },
  converted: { label: "Converted", color: "text-status-resolved", bgColor: "bg-status-resolved/10" },
};

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "REF-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const Referrals = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReferralRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("referrals").insert({
        referrer_name: newName,
        referrer_email: newEmail,
        referral_code: generateCode(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setShowCreate(false);
      setNewName("");
      setNewEmail("");
      toast({ title: "Referral link created" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("referrals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      setDeletingId(null);
      toast({ title: "Referral deleted" });
    },
  });

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(`https://moilapp.com/ref/${code}`);
    toast({ title: "Referral link copied!" });
  };

  const filtered = referrals.filter(
    (r) =>
      (r.referrer_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.referrer_email || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.referral_code || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalReferrals = referrals.length;
  const converted = referrals.filter((r) => r.status === "converted").length;
  const pending = referrals.filter((r) => r.status === "pending").length;
  const conversionRate = totalReferrals > 0 ? Math.round((converted / totalReferrals) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Referral Program</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and track referral links for customers</p>
        </div>
        <Button size="sm" className="gradient-brand text-primary-foreground shadow-glow" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Referral Link
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Links", value: totalReferrals, icon: Link2 },
          { label: "Pending", value: pending, icon: Clock },
          { label: "Converted", value: converted, icon: UserCheck },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: Share2 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold font-heading">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search referrals..." className="pl-8 h-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No referrals yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          filtered.map((ref) => {
            const cfg = STATUS_MAP[ref.status] || STATUS_MAP.pending;
            return (
              <Card key={ref.id} className="hover:shadow-elevated transition-shadow">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`rounded-lg p-2.5 ${cfg.bgColor}`}>
                    <Share2 className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-heading font-semibold text-foreground truncate">{ref.referrer_name}</h3>
                      <Badge className={`${cfg.bgColor} ${cfg.color} border-0 text-[10px]`}>{cfg.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{ref.referrer_email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{ref.referral_code}</p>
                  </div>
                  {ref.referred_name && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-foreground">{ref.referred_name}</p>
                      <p className="text-[10px] text-muted-foreground">referred</p>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); copyLink(ref.referral_code); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(ref.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Referral Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-sm">Referrer Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <Label className="text-sm">Referrer Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="customer@example.com" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={() => createMut.mutate()} disabled={!newName.trim() || !newEmail.trim() || createMut.isPending}>
              Create Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete referral?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingId && deleteMut.mutate(deletingId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Referrals;

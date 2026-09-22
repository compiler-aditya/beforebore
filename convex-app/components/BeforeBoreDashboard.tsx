"use client";

import { Component, type FormEvent, type ReactNode, useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDashed,
  ClipboardCheck,
  Drill,
  FileCheck2,
  HardHat,
  Layers3,
  LayoutDashboard,
  Loader2,
  Mail,
  MapPin,
  Plus,
  ScanLine,
  Search,
  ShieldAlert,
  Siren,
  ScrollText,
  Users,
  Wifi,
  X,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PasskeySignIn } from "@/components/PasskeySignIn";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PermitStatus = "ready" | "waiting" | "blocked" | "draft";

type Permit = {
  id: string;
  liveId?: Id<"permits">;
  location: string;
  level: string;
  trade: string;
  detail: string;
  requestedBy: string;
  initials: string;
  status: PermitStatus;
  statusLabel: string;
  timing: string;
  completed: number;
  total: number;
  pinX?: number;
  pinY?: number;
};

const PROJECT_CODE = "ALDER-5";

function statusLabel(status: PermitStatus) {
  if (status === "ready") return "Demo ready";
  if (status === "waiting") return "Awaiting review";
  if (status === "blocked") return "Blocked";
  return "Draft";
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

const permits: Permit[] = [
  {
    id: "BB-2049",
    location: "Grid C4 · Electrical room",
    level: "Level 04",
    trade: "Plumbing",
    detail: "Ø150 mm · Full depth",
    requestedBy: "M. Torres",
    initials: "MT",
    status: "blocked",
    statusLabel: "Blocked",
    timing: "Sample · 14:00",
    completed: 4,
    total: 6,
    pinX: 43,
    pinY: 35,
  },
  {
    id: "BB-2048",
    location: "Grid F7 · East corridor",
    level: "Level 03",
    trade: "Electrical",
    detail: "4 × Ø50 mm · 180 mm",
    requestedBy: "J. Bell",
    initials: "JB",
    status: "waiting",
    statusLabel: "Awaiting review",
    timing: "Sample · 15:30",
    completed: 5,
    total: 6,
    pinX: 20,
    pinY: 70,
  },
  {
    id: "BB-2047",
    location: "Grid A2 · Riser 02",
    level: "Level 06",
    trade: "Mechanical",
    detail: "Ø225 mm · Full depth",
    requestedBy: "S. Clarke",
    initials: "SC",
    status: "ready",
    statusLabel: "Demo ready",
    timing: "Sample · 11:00",
    completed: 6,
    total: 6,
    pinX: 66,
    pinY: 67,
  },
  {
    id: "BB-2046",
    location: "Grid D9 · Washroom core",
    level: "Level 02",
    trade: "Plumbing",
    detail: "2 × Ø100 mm · Full depth",
    requestedBy: "A. King",
    initials: "AK",
    status: "draft",
    statusLabel: "Draft",
    timing: "Sample · 08:00",
    completed: 2,
    total: 6,
    pinX: 76,
    pinY: 35,
  },
];

const navItems = [
  { label: "Control room", icon: LayoutDashboard, active: true },
  { label: "Penetration permits", icon: ClipboardCheck },
  { label: "Drawings", icon: Layers3 },
  { label: "Site inbox", icon: Mail },
  { label: "Audit trail", icon: ScrollText },
];

const evidence = [
  {
    label: "Current drawing revision",
    detail: "S-402 · Rev 08 confirmed",
    status: "done",
  },
  {
    label: "GPR scan",
    detail: "Scan report · Clear zone marked",
    status: "done",
  },
  {
    label: "Structural approval",
    detail: "Approved by Elena Park · 09:42",
    status: "done",
  },
  {
    label: "MEP services clearance",
    detail: "Electrical cleared · Plumbing pending",
    status: "waiting",
  },
  {
    label: "Area below exclusion zone",
    detail: "Photo evidence attached",
    status: "done",
  },
  {
    label: "Firestop system",
    detail: "No approved system selected",
    status: "blocked",
  },
] as const;

function StatusDot({ status }: { status: PermitStatus }) {
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 rounded-full ring-4",
        status === "ready" && "bg-emerald-400 ring-emerald-400/10",
        status === "waiting" && "bg-sky-400 ring-sky-400/10",
        status === "blocked" && "bg-red-400 ring-red-400/10",
        status === "draft" && "bg-zinc-500 ring-zinc-500/10",
      )}
    />
  );
}

function PermitBadge({ status, label }: { status: PermitStatus; label: string }) {
  const tone =
    status === "ready"
      ? "ready"
      : status === "waiting"
        ? "waiting"
        : status === "blocked"
          ? "blocked"
          : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

function inboxIcon(category: "structural" | "scan" | "mep" | "system") {
  if (category === "scan") return ScanLine;
  if (category === "mep") return Users;
  if (category === "system") return ShieldAlert;
  return FileCheck2;
}

function NewPermitPanel({
  liveEnabled,
  onClose,
  onCreated,
}: {
  liveEnabled: boolean;
  onClose: () => void;
  onCreated: (permitId: Id<"permits">) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createPermit = useMutation(api.permits.create);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liveEnabled) {
      setError("The Convex deployment must be re-enabled before permits can be saved.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const diameterMm = Number.parseInt(String(formData.get("diameterMm")), 10);
    setError(null);
    setIsSaving(true);
    try {
      const permitId = await createPermit({
        clientRequestId: crypto.randomUUID(),
        projectCode: PROJECT_CODE,
        level: String(formData.get("level")),
        location: String(formData.get("location")),
        diameterMm,
        depth: String(formData.get("depth")),
        purpose: String(formData.get("purpose")),
        trade: String(formData.get("trade")),
      });
      onCreated(permitId);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The permit could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <button
        aria-label="Close new permit form"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-zinc-700 bg-[#12151a] shadow-2xl shadow-black">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-700 bg-[#12151a]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
              New penetration request
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">Mark the proposed cut</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
        <div className="px-6 py-6">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/70 p-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-zinc-800 bg-[#171a20] blueprint-grid">
              <div className="absolute left-[12%] top-[16%] h-[68%] w-[72%] border-2 border-zinc-600" />
              <div className="absolute left-[34%] top-[16%] h-[68%] border-l border-zinc-600" />
              <div className="absolute left-[60%] top-[16%] h-[68%] border-l border-zinc-600" />
              <div className="absolute left-[12%] top-[48%] w-[72%] border-t border-zinc-600" />
              <div
                className="absolute left-[54%] top-[38%] grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#171a20] bg-amber-400 text-zinc-950 shadow-[0_0_0_6px_rgba(251,191,36,0.18)]"
              >
                <Plus className="h-5 w-5" />
              </div>
              <div className="absolute bottom-3 left-3 rounded-md border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                S-402 · Level 04 · Rev 08
              </div>
              <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-emerald-400 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-950">
                <Wifi className="h-3 w-3" /> Illustrative plan
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Input id="level" name="level" required defaultValue="Level 04" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grid">Grid / room</Label>
              <Input id="grid" name="location" required defaultValue="Grid C4 · Electrical room" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diameter">Opening diameter</Label>
              <Input id="diameter" name="diameterMm" type="number" min="10" max="1200" required defaultValue="150" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="depth">Maximum depth</Label>
              <Input id="depth" name="depth" required defaultValue="Full slab" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade">Trade</Label>
              <Input id="trade" name="trade" required defaultValue="Plumbing" className="h-11 border-zinc-700 bg-zinc-900 text-white" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">Purpose of penetration</Label>
              <Textarea
                id="reason"
                name="purpose"
                required
                defaultValue="New sanitary riser connection serving Level 04 washrooms."
                className="border-zinc-700 bg-zinc-900 text-white"
              />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-100">Six evidence gates will be created</p>
                <p className="mt-1 text-xs leading-5 text-amber-100/70">
                  After submission, you can run the optional AI pre-screen with a drawing or specification URL. No request is routed to a reviewer automatically, and this demo does not issue engineering approval.
                </p>
              </div>
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-zinc-700 bg-[#12151a] px-6 py-4">
          <p className="text-xs text-zinc-500">Creates six evidence gates</p>
          <Button type="submit" disabled={isSaving || !liveEnabled} className="h-11 bg-amber-400 px-5 font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
            {isSaving ? "Creating…" : "Create demo request"}
          </Button>
        </div>
        </form>
      </aside>
    </div>
  );
}

function BeforeBoreDashboardContent({ liveEnabled, previewMode = false, onExitPreview }: { liveEnabled: boolean; previewMode?: boolean; onExitPreview?: () => void }) {
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.current, liveEnabled ? {} : "skip");
  const [selectedId, setSelectedId] = useState("BB-2049");
  const [showNewPermit, setShowNewPermit] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [isPrescreening, setIsPrescreening] = useState(false);
  const [prescreenStatus, setPrescreenStatus] = useState<string | null>(null);
  const [isRequestingReview, setIsRequestingReview] = useState(false);
  const [coordinationStatus, setCoordinationStatus] = useState<string | null>(null);
  const dashboard = useQuery(api.dashboard.get, liveEnabled ? { projectCode: PROJECT_CODE } : "skip");
  const simulateNextDemoGate = useMutation(api.permits.simulateNextDemoGate);
  const seedDemo = useMutation(api.demo.seedDemo);
  const runPrescreen = useAction(api.prescreen.run);
  const sendReviewRequest = useAction(api.coordination.sendRequest);
  const livePermits: Permit[] = dashboard?.permits.map((permit) => ({
    id: permit.permitNumber,
    liveId: permit._id,
    location: permit.location,
    level: permit.level,
    trade: permit.trade,
    detail: `Ø${permit.diameterMm} mm · ${permit.depth}`,
    requestedBy: permit.requestedByName,
    initials: permit.requestedByInitials,
    status: permit.status,
    statusLabel: statusLabel(permit.status),
    timing: permit.clientRequestId.startsWith("seed:")
      ? permit.scheduledLabel.replace(/^(Today|Tomorrow)/, "Sample")
      : "Unscheduled",
    completed: permit.clearedGateCount,
    total: permit.totalGateCount,
    pinX: permit.pinX,
    pinY: permit.pinY,
  })) ?? [];
  const displayPermits = dashboard ? livePermits : permits;
  const queuePermits = displayPermits.filter((permit) =>
    [permit.id, permit.location, permit.level, permit.trade, permit.requestedBy]
      .some((field) => field.toLowerCase().includes(searchTerm.trim().toLowerCase())),
  );
  const selected = displayPermits.find(
    (permit) => permit.id === selectedId || permit.liveId === selectedId,
  ) ?? displayPermits[0];
  const selectedLiveId = selected?.liveId;
  const permitDetails = useQuery(
    api.permits.getDetails,
    liveEnabled && selectedLiveId ? { permitId: selectedLiveId } : "skip",
  );
  const isSeededDemoPermit = permitDetails?.permit.clientRequestId.startsWith("seed:") ?? false;
  const displayedEvidence = permitDetails?.evidenceGates.map((item) => ({
    label: item.label,
    detail: item.detail,
    status: item.status === "cleared" ? "done" : item.status,
  })) ?? (selected.id === "BB-2049" ? evidence : evidence.map((item, index) => ({
    ...item,
    status: index < selected.completed ? "done" : "waiting",
    detail: index < selected.completed ? "Illustrative evidence accepted" : "Illustrative evidence pending",
  })));
  const outstandingGateCount = displayedEvidence.filter((item) => item.status !== "done").length;
  const stats = dashboard?.stats;

  async function handleSimulate() {
    if (!selectedLiveId) {
      setActionError("Connect the live Convex demo workspace to simulate a gate.");
      return;
    }
    setActionError(null);
    setIsSimulating(true);
    try {
      await simulateNextDemoGate({ permitId: selectedLiveId });
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The demo transition could not be simulated.");
    } finally {
      setIsSimulating(false);
    }
  }

  async function handleSeed() {
    setActionError(null);
    setIsSeeding(true);
    try {
      await seedDemo({});
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The demo workspace could not be initialized.");
    } finally {
      setIsSeeding(false);
    }
  }

  async function handlePrescreen() {
    if (!selectedLiveId || !sourceUrl.trim()) {
      setPrescreenStatus("Select a live permit and paste a drawing or spec URL first.");
      return;
    }
    setIsPrescreening(true);
    setPrescreenStatus(null);
    try {
      const result = await runPrescreen({ permitId: selectedLiveId, sourceUrl: sourceUrl.trim() });
      const label =
        result.status === "completed"
          ? `Advisory · ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`
          : result.status === "not_configured"
            ? "Pre-screen not configured"
            : "Pre-screen failed";
      setPrescreenStatus(`${label} — ${result.findings[0]?.summary ?? "No evidence findings returned."}`);
    } catch (caught) {
      setPrescreenStatus(caught instanceof Error ? caught.message : "The pre-screen could not run.");
    } finally {
      setIsPrescreening(false);
    }
  }

  async function handleRequestReview() {
    if (!selectedLiveId) {
      setActionError("Connect the live Convex demo workspace to send an inbox request.");
      return;
    }
    setIsRequestingReview(true);
    setActionError(null);
    setCoordinationStatus(null);
    try {
      const result = await sendReviewRequest({
        permitId: selectedLiveId,
        reviewerRole: "Structural and MEP reviewer",
        subject: `${selected.id} clearance request`,
        body: `Please review the proposed penetration at ${selected.location}, ${selected.level}. Reply with evidence or a clear action; BeforeBore never treats silence as approval.`,
      });
      // A delivered request is not an error. Only a refusal or a missing
      // configuration belongs in the alert region.
      if (result.status === "sent") {
        setCoordinationStatus(`${result.summary} Reply to that thread with ${selected.id} in the subject to see it arrive here.`);
      } else {
        setActionError(result.summary);
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The reviewer request could not be sent.");
    } finally {
      setIsRequestingReview(false);
    }
  }

  const inboxMessages = dashboard?.inboxMessages.filter((message) =>
    message.permitNumber && displayPermits.some((permit) => permit.id === message.permitNumber),
  ).map((message) => ({
    icon: inboxIcon(message.category),
    permitNumber: message.permitNumber,
    sender: `${message.senderName} · ${message.senderRole}`,
    subject: message.subject,
    preview: message.preview,
    time: formatTime(message.receivedAt),
    unread: message.unread,
  })) ?? [
    { icon: FileCheck2, permitNumber: "BB-2049", sender: "Elena Park · Structural", subject: "RE: BB-2049 structural review", preview: "Approved at the revised location shown…", time: "09:42", unread: true },
    { icon: ScanLine, permitNumber: "BB-2049", sender: "Axis GPR", subject: "Scan report · Level 04 / C4", preview: "Clear area marked in green. Two conduits…", time: "09:18", unread: true },
    { icon: Users, permitNumber: "BB-2048", sender: "Derek Mills · Electrical", subject: "RE: Services clearance BB-2048", preview: "No electrical services within the marked…", time: "08:55", unread: true },
  ];

  return (
      <div className="min-h-screen bg-[#0c0e12] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-700/80 bg-[#111318] lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-zinc-700/80 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-400 text-zinc-950 shadow-[0_0_30px_rgba(251,191,36,0.12)]">
            <Drill className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-black tracking-[0.16em] text-white">BEFORE<span className="text-amber-400">BORE</span></div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Site clearance system</div>
          </div>
        </div>

        <div className="px-3 py-4">
          <div className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-left">
            <span className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-orange-500/15 text-orange-300"><HardHat className="h-4 w-4" /></span>
              <span>
                <span className="block text-xs font-semibold text-white">{dashboard?.project.name ?? "Alder & 5th"}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">{dashboard?.project.siteLabel ?? "Building A · Active"}</span>
              </span>
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <p className="px-3 pb-2 pt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-600">Workspace</p>
          {navItems.map((item) => (
            <div
              key={item.label}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                item.active
                  ? "bg-amber-400 text-zinc-950"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-700/80 p-4">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Site status</span>
              <span className={cn("flex items-center gap-1.5 text-[10px] font-bold", dashboard ? "text-emerald-300" : "text-amber-300")}><span className={cn("h-1.5 w-1.5 rounded-full", dashboard ? "bg-emerald-400" : "bg-amber-400")} /> {dashboard ? "Demo synced" : "Demo snapshot"}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {["EP", "DM", "JB"].map((avatar) => (
                <span key={avatar} className="grid h-7 w-7 place-items-center rounded-full border border-zinc-600 bg-zinc-800 text-[9px] font-bold text-zinc-200">{avatar}</span>
              ))}
              <span className="text-xs text-zinc-500">Synthetic team</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-zinc-700/80 bg-[#0c0e12]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-zinc-950 lg:hidden"><Drill className="h-5 w-5" /></div>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                <span>Projects</span><span>/</span><span>{dashboard?.project.name ?? "Alder & 5th"}</span><span>/</span><span className="text-zinc-300">Control room</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400"><Wifi className={cn("h-3.5 w-3.5", dashboard ? "text-emerald-400" : "text-amber-400")} /> {dashboard ? "Convex-synced synthetic workspace" : "Read-only demo snapshot"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {liveEnabled && <span className="hidden text-xs text-zinc-400 md:inline">{currentUser?.username}</span>}
            {previewMode ? <Button type="button" variant="ghost" onClick={onExitPreview} className="text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white">Sign in</Button> : <Button type="button" variant="ghost" onClick={() => void signOut()} className="text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white">Sign out</Button>}
            {searchOpen && <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Search permits" placeholder="Permit, location, or trade" className="hidden h-9 w-52 border-zinc-700 bg-zinc-900 text-xs text-white sm:block" />}
            <button type="button" onClick={() => { setSearchOpen((open) => !open); setSearchTerm(""); }} className="hidden h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-400 hover:border-zinc-600 hover:text-white sm:flex"><Search className="h-3.5 w-3.5" /> {searchOpen ? "Close search" : "Search permits"}</button>
            {liveEnabled && <Button onClick={() => setShowNewPermit(true)} className="h-10 bg-amber-400 px-4 font-bold text-zinc-950 hover:bg-amber-300"><Plus /> <span className="hidden sm:inline">New permit</span></Button>}
          </div>
        </header>

        <main className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={dashboard ? "ready" : "amber"}><Siren className="mr-1 h-3 w-3" /> Demo control room</Badge><span className="text-xs text-zinc-500">{new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span>{dashboard && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">● Convex synced</span>}</div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">Every cut starts with evidence.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Explore concrete penetration requests, missing clearances, and evidence gates before the drill touches the slab.</p>
              <p className="mt-3 max-w-2xl rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">Synthetic demonstration only. Green status and simulated gate transitions are not site approval or authorization to cut concrete.</p>
              {!liveEnabled && <p className="mt-3 max-w-2xl rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100/80">Read-only sample project. Sign in to create and track live requests.</p>}
              {liveEnabled && dashboard === null && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2.5 text-xs text-sky-100"><span>Workspace not seeded yet.</span><Button type="button" onClick={handleSeed} disabled={isSeeding} size="sm" className="h-8 bg-sky-300 px-3 font-bold text-sky-950 hover:bg-sky-200">{isSeeding ? <Loader2 className="animate-spin" /> : <Plus />} {isSeeding ? "Initializing…" : "Initialize demo workspace"}</Button></div>}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500"><CalendarDays className="h-4 w-4" /> Synthetic project scenario</div>
          </div>

          <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Demo ready", value: String(stats?.ready ?? 1), sub: "Synthetic gate state", color: "emerald" },
              { label: "Blocked", value: String(stats?.blocked ?? 1), sub: "Action required", color: "red" },
              { label: "Awaiting review", value: String(stats?.waiting ?? 1), sub: "Evidence outstanding", color: "sky" },
              { label: "Draft", value: String(stats?.draft ?? 1), sub: "Not submitted", color: "amber" },
            ].map((stat) => (
              <Card key={stat.label} className="overflow-hidden border-zinc-700 bg-[#13161b] shadow-none">
                <CardContent className="relative p-4 sm:p-5">
                  <div className={cn("absolute inset-y-0 left-0 w-1", stat.color === "emerald" && "bg-emerald-400", stat.color === "red" && "bg-red-400", stat.color === "sky" && "bg-sky-400", stat.color === "amber" && "bg-amber-400")} />
                  <div className="flex items-start justify-between">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{stat.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-white">{stat.value}</p></div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{stat.sub}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(390px,0.8fr)]">
            <Card className="border-zinc-700 bg-[#13161b] shadow-none">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-700 px-5 py-4">
                <div><CardTitle className="text-base text-white">Permit queue</CardTitle><CardDescription className="mt-1 text-xs text-zinc-500">{dashboard ? `${dashboard.permits.length} synthetic requests in Convex` : "Four sample requests · sign in for live data"}</CardDescription></div>
                <Badge tone="neutral">{queuePermits.length} shown</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="hidden grid-cols-[0.72fr_1.5fr_0.8fr_0.78fr] border-b border-zinc-800 px-5 py-3 text-[9px] font-bold uppercase tracking-[0.17em] text-zinc-600 md:grid">
                  <span>Permit</span><span>Location &amp; scope</span><span>Requested by</span><span>Status</span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {queuePermits.map((permit) => (
                    <button
                      key={permit.id}
                      onClick={() => setSelectedId(permit.id)}
                      className={cn(
                        "grid w-full gap-3 px-4 py-4 text-left transition md:grid-cols-[0.72fr_1.5fr_0.8fr_0.78fr] md:items-center md:px-5",
                        selectedId === permit.id ? "bg-amber-400/[0.07] shadow-[inset_3px_0_0_#fbbf24]" : "hover:bg-zinc-800/45",
                      )}
                    >
                      <div className="flex items-center gap-3"><StatusDot status={permit.status} /><div><p className="text-xs font-bold text-white">{permit.id}</p><p className="mt-1 text-[10px] text-zinc-500">{permit.timing}</p></div></div>
                      <div><p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200"><MapPin className="h-3.5 w-3.5 text-zinc-500" /> {permit.location}</p><p className="mt-1 text-xs text-zinc-500">{permit.level} · {permit.trade} · {permit.detail}</p></div>
                      <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-300">{permit.initials}</span><span className="text-xs text-zinc-400">{permit.requestedBy}</span></div>
                      <div className="flex items-center justify-between md:block"><PermitBadge status={permit.status} label={permit.statusLabel} /><p className="mt-1.5 text-[10px] text-zinc-500">{permit.completed}/{permit.total} gates cleared</p></div>
                    </button>
                  ))}
                  {queuePermits.length === 0 && <p className="px-5 py-8 text-center text-sm text-zinc-400">No permits match that search.</p>}
                </div>
                <p className="border-t border-zinc-700 px-4 py-3.5 text-center text-xs text-zinc-500">Showing {queuePermits.length} of {displayPermits.length} synthetic requests</p>
              </CardContent>
            </Card>

            <Card className="border-zinc-700 bg-[#13161b] shadow-none">
              <CardHeader className="border-b border-zinc-700 px-5 py-4">
                <div className="flex items-start justify-between">
                  <div><div className="flex items-center gap-2"><CardTitle className="text-base text-white">{selected.id}</CardTitle><PermitBadge status={selected.status} label={selected.statusLabel} /></div><CardDescription className="mt-2 text-xs text-zinc-500">{selected.location} · {selected.level}</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="flex items-end justify-between">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Readiness</p><p className="mt-1 text-2xl font-semibold text-white">{selected.completed} of {selected.total} <span className="text-sm font-normal text-zinc-500">gates</span></p></div>
                  <span className={cn("text-xs font-semibold", selected.completed === selected.total ? "text-emerald-300" : "text-red-300")}>{outstandingGateCount === 0 ? "No gates outstanding" : `${outstandingGateCount} ${outstandingGateCount === 1 ? "gate" : "gates"} outstanding`}</span>
                </div>
                <div className="mt-3 flex gap-1.5">{Array.from({ length: selected.total }).map((_, index) => <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < selected.completed ? "bg-emerald-400" : index === selected.completed ? "bg-red-400" : "bg-zinc-700")} />)}</div>

                <div className="mt-5 space-y-1">
                  {displayedEvidence.map((item) => (
                    <div key={item.label} className={cn("flex items-center gap-3 rounded-lg border px-3 py-3", item.status === "blocked" ? "border-red-500/30 bg-red-500/[0.07]" : item.status === "waiting" ? "border-sky-500/30 bg-sky-500/[0.05]" : "border-transparent hover:border-zinc-700 hover:bg-zinc-900")}>
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", item.status === "done" && "bg-emerald-400/15 text-emerald-300", item.status === "waiting" && "bg-sky-400/15 text-sky-300", item.status === "blocked" && "bg-red-400/15 text-red-300")}>{item.status === "done" ? <Check className="h-3.5 w-3.5" /> : item.status === "waiting" ? <CircleDashed className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}</span>
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-zinc-200">{item.label}</p><p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.detail}</p></div>
                      <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600" />
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950/45 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200"><ScrollText className="h-4 w-4 text-amber-300" /> Permit audit trail</div>
                  {permitDetails ? (
                    <ol className="mt-3 space-y-3 border-l border-zinc-700 pl-3">
                      {permitDetails.auditEvents.slice(0, 4).map((event) => (
                        <li key={event._id} className="text-[11px] leading-4 text-zinc-400">
                          <span className="font-semibold text-zinc-200">{event.actorName}</span> · {formatTime(event.createdAt)}
                          <span className="mt-0.5 block">{event.summary}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="mt-2 text-[11px] leading-4 text-zinc-500">Sign in to inspect the live audit trail.</p>}
                </div>

                <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-bold text-sky-100">AI evidence pre-screen</p><p className="mt-1 text-[10px] leading-4 text-sky-100/60">Firecrawl extracts the source; OpenAI flags gaps. Neither can approve a cut.</p></div>
                    <Badge tone="waiting">Advisory</Badge>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Paste drawing/spec URL" aria-label="Drawing or specification URL" className="h-9 border-sky-400/20 bg-zinc-950/60 text-xs text-white placeholder:text-zinc-600" />
                    <Button type="button" onClick={handlePrescreen} disabled={isPrescreening || !selectedLiveId || !sourceUrl.trim()} size="sm" className="h-9 shrink-0 bg-sky-300 px-3 font-bold text-sky-950 hover:bg-sky-200 disabled:opacity-40">{isPrescreening ? <Loader2 className="animate-spin" /> : <ScanLine />} {isPrescreening ? "Scanning…" : "Run pre-screen"}</Button>
                  </div>
                  {prescreenStatus && <p className="mt-2 text-[10px] leading-4 text-sky-100/80" role="status">{prescreenStatus}</p>}
                  <Button type="button" variant="ghost" onClick={handleRequestReview} disabled={isRequestingReview || !selectedLiveId} className="mt-2 h-8 px-0 text-[10px] font-semibold text-amber-300 hover:bg-transparent hover:text-amber-200 disabled:opacity-40">{isRequestingReview ? <Loader2 className="animate-spin" /> : <Mail />} {isRequestingReview ? "Sending inbox request…" : "Send to coordination inbox"}</Button>
                  {coordinationStatus && <p className="mt-1 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-[10px] leading-4 text-emerald-100" role="status">{coordinationStatus}</p>}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Button type="button" onClick={handleSimulate} disabled={isSimulating || !isSeededDemoPermit || selected.completed === selected.total} className="h-11 bg-amber-400 font-bold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">{isSimulating ? <Loader2 className="animate-spin" /> : <FileCheck2 />} {selected.completed === selected.total ? "Demo gates complete" : isSeededDemoPermit ? "Simulate next gate" : "Simulation: seeded examples only"}</Button>
                </div>
                {actionError && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200" role="alert">{actionError}</p>}
                <p className="mt-3 text-center text-[10px] leading-4 text-zinc-400">Simulation never records a human approval. Real clearance requires authenticated, qualified reviewers and verified evidence.</p>
              </CardContent>
            </Card>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden border-zinc-700 bg-[#13161b] shadow-none">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-700 px-5 py-4"><div><CardTitle className="text-base text-white">Illustrative penetration map</CardTitle><CardDescription className="mt-1 text-xs text-zinc-500">S-402 · Level 04 · Synthetic structural overlay</CardDescription></div><Badge tone="neutral"><ScanLine className="mr-1 h-3 w-3" /> Rev 08</Badge></CardHeader>
              <CardContent className="p-3">
                <div className="relative h-72 overflow-hidden rounded-lg border border-zinc-700 bg-[#171a20] blueprint-grid sm:h-80">
                  <div className="absolute left-[8%] top-[13%] h-[72%] w-[84%] border-2 border-zinc-600" />
                  <div className="absolute left-[29%] top-[13%] h-[72%] border-l border-zinc-600" />
                  <div className="absolute left-[54%] top-[13%] h-[72%] border-l border-zinc-600" />
                  <div className="absolute left-[76%] top-[13%] h-[72%] border-l border-zinc-600" />
                  <div className="absolute left-[8%] top-[48%] w-[84%] border-t border-zinc-600" />
                  <div className="absolute left-[31%] top-[24%] rounded border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-[9px] text-zinc-500">ELECTRICAL</div>
                  <div className="absolute left-[58%] top-[60%] rounded border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-[9px] text-zinc-500">RISER 04</div>
                  {displayPermits.slice(0, 6).map((permit) => (
                    <button
                      type="button"
                      key={permit.id}
                      aria-label={`Open ${permit.id} on map`}
                      onClick={() => setSelectedId(permit.id)}
                      className={cn("absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#171a20] text-[9px] font-black text-zinc-950 shadow-xl", permit.status === "blocked" && "bg-red-400 shadow-red-950", permit.status === "ready" && "bg-emerald-400 shadow-emerald-950", permit.status === "waiting" && "bg-sky-400 shadow-sky-950", permit.status === "draft" && "bg-zinc-400 shadow-zinc-950")}
                      style={{ left: `${permit.pinX ?? 43}%`, top: `${permit.pinY ?? 35}%` }}
                    >
                      {permit.id.replace("BB-", "")}
                    </button>
                  ))}
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-zinc-700 bg-zinc-950/90 p-2 text-[9px] font-semibold text-zinc-400"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Demo ready</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Review</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Blocked</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-700 bg-[#13161b] shadow-none">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-700 px-5 py-4"><div><CardTitle className="text-base text-white">Coordination inbox</CardTitle><CardDescription className="mt-1 text-xs text-zinc-500">Synthetic replies linked to permits</CardDescription></div><Badge tone="amber">{inboxMessages.filter((message) => message.unread).length} unread</Badge></CardHeader>
              <CardContent className="divide-y divide-zinc-800 p-0">
                {inboxMessages.map((message) => (
                  <button type="button" key={message.subject} onClick={() => { if (message.permitNumber) setSelectedId(message.permitNumber); }} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-zinc-800/50"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-800 text-zinc-300"><message.icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={cn("truncate text-xs", message.unread ? "font-bold text-white" : "font-medium text-zinc-300")}>{message.sender}</span><span className="text-[9px] text-zinc-600">{message.time}</span></span><span className="mt-1 block truncate text-xs font-medium text-zinc-400">{message.subject}</span><span className="mt-1 block truncate text-[10px] text-zinc-600">{message.preview}</span></span>{message.unread && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}</button>
                ))}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>

      {showNewPermit && <NewPermitPanel liveEnabled={liveEnabled} onClose={() => setShowNewPermit(false)} onCreated={(permitId) => setSelectedId(permitId)} />}
    </div>
  );
}

class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? (
      <BeforeBoreDashboardContent liveEnabled={false} />
    ) : (
      this.props.children
    );
  }
}

function GuestAccess() {
  const [exploring, setExploring] = useState(false);
  return exploring ? (
    <BeforeBoreDashboardContent liveEnabled={false} previewMode onExitPreview={() => setExploring(false)} />
  ) : (
    <PasskeySignIn onExploreDemo={() => setExploring(true)} />
  );
}

export function BeforeBoreDashboard() {
  return (
    <>
      <AuthLoading><div className="flex min-h-screen items-center justify-center bg-[#0c0e12] text-sm text-zinc-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restoring session…</div></AuthLoading>
      <Unauthenticated><GuestAccess /></Unauthenticated>
      <Authenticated>
        <DashboardErrorBoundary>
          <BeforeBoreDashboardContent liveEnabled />
        </DashboardErrorBoundary>
      </Authenticated>
    </>
  );
}

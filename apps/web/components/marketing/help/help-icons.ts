import { ArrowLeftRight, Bell, Code2, FileText, Send, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";
import type { HelpIcon } from "../../../lib/help/catalog";

export const HELP_ICONS: Record<HelpIcon, LucideIcon> = {
  compare: ArrowLeftRight,
  send: Send,
  account: UserRound,
  alerts: Bell,
  invoices: FileText,
  payroll: Users,
  developers: Code2,
  privacy: ShieldCheck,
};

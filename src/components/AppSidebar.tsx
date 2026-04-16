import { LayoutDashboard, Mail, Users, ClipboardList, FileText, Share2, Settings, BarChart3, ExternalLink, Inbox, Tent } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import logo from "@/assets/fitlogic-logo.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Pipeline", url: "/", icon: LayoutDashboard },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Campaigns", url: "/campaigns", icon: Mail },
  { title: "Contacts", url: "/contacts", icon: Users },
  // { title: "Lead Forms", url: "/forms", icon: ClipboardList },
  { title: "FAQs", url: "/faqs", icon: FileText },
  { title: "Referrals", url: "/referrals", icon: Share2 },
];

const secondaryItems = [
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  // Live unread count for inbox badge
  const { data: unreadLeads = 0 } = useQuery({
    queryKey: [...QK.emailMessages, "unread_leads_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("email_messages")
        .select("*", { count: "exact", head: true })
        .eq("is_lead", true)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="FitLogic" className="h-9 w-9 rounded-lg object-contain" />
          {!collapsed && (
            <div>
              <h2 className="font-heading text-sm font-bold text-sidebar-primary-foreground">FitLogic</h2>
              <p className="text-[10px] text-sidebar-foreground/60">Sales Engine</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sales</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-sidebar-primary">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                  {item.url === "/inbox" && unreadLeads > 0 && (
                    <SidebarMenuBadge className="bg-category-health/20 text-category-health text-[10px] font-bold">
                      {unreadLeads > 9 ? "9+" : unreadLeads}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="https://moilapp.com/marketing" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    {!collapsed && <span>Marketing</span>}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/retreat")}>
                  <Link to="/retreat" className="flex items-center gap-2">
                    <Tent className="h-4 w-4" />
                    {!collapsed && <span>The Retreat</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} activeClassName="bg-sidebar-accent text-sidebar-primary">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent/50 p-3">
            <p className="text-[11px] text-sidebar-foreground/70">FitLogic Sales Engine</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

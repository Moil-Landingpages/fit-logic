"use client";

import { LayoutDashboard, Mail, Users, ClipboardList, FileText, Share2, Settings, BarChart3, ExternalLink, Inbox, Tent } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <Image src="/fitlogic-logo.png" alt="FitLogic" width={36} height={36} className="rounded-lg object-contain" />
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
                    <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-sidebar-primary" onClick={handleNavClick}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="https://moilapp.com/marketing" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2" onClick={handleNavClick}>
                    <ExternalLink className="h-4 w-4" />
                    {!collapsed && <span>Marketing</span>}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/retreat")}>
                  <Link href="/retreat" className="flex items-center gap-2" onClick={handleNavClick}>
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
                    <NavLink to={item.url} activeClassName="bg-sidebar-accent text-sidebar-primary" onClick={handleNavClick}>
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

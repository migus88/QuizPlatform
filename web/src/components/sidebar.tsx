"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, BookOpen, LogIn, Users, Library, Settings, Pencil, LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
      {label}
    </div>
  );
}

function UserAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
      {initials}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="p-6">
        <Link href="/" className="text-xl font-bold" onClick={onNavigate}>
          Quiz Platform
        </Link>
      </div>

      <nav className="flex-1 space-y-0 px-3 overflow-y-auto">
        <NavLink
          href="/quizzes"
          label="Quizzes"
          icon={BookOpen}
          active={pathname === "/quizzes" || (pathname.startsWith("/quizzes/") && !pathname.startsWith("/quizzes/admin"))}
          onClick={onNavigate}
        />
        <NavLink
          href="/join"
          label="Join"
          icon={LogIn}
          active={pathname === "/join"}
          onClick={onNavigate}
        />

        {isAdmin && (
          <>
            <SectionLabel label="Administration" />
            <NavLink
              href="/admin/users"
              label="Users"
              icon={Users}
              active={pathname === "/admin/users"}
              onClick={onNavigate}
            />
            <NavLink
              href="/admin/quizzes"
              label="All Quizzes"
              icon={Library}
              active={pathname === "/admin/quizzes"}
              onClick={onNavigate}
            />
          </>
        )}
      </nav>

      <div className="border-t p-3 space-y-1">
        {isAdmin && (
          <NavLink
            href="/settings"
            label="Settings"
            icon={Settings}
            active={pathname === "/settings"}
            onClick={onNavigate}
          />
        )}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground">
                <UserAvatar firstName={user.firstName} lastName={user.lastName} />
                <span className="truncate">{user.firstName} {user.lastName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile" onClick={onNavigate} className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onNavigate?.();
                  logout();
                }}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-background md:fixed md:inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile header + sheet */}
      <div className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="ml-3 text-lg font-bold">Quiz Platform</span>
      </div>
    </>
  );
}

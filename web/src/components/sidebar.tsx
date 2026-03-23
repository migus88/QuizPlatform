"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Users, BookOpen, LogIn, User, LogOut } from "lucide-react";
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();

  const navLinks = [
    ...(isAdmin
      ? [{ href: "/users", label: "Users", icon: Users }]
      : []),
    { href: "/quizzes", label: "Quizzes", icon: BookOpen },
    { href: "/join", label: "Join", icon: LogIn },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="p-6">
        <Link href="/" className="text-xl font-bold" onClick={onNavigate}>
          Quiz Platform
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navLinks.map((link) => (
          <NavLink
            key={link.href}
            href={link.href}
            label={link.label}
            icon={link.icon}
            active={pathname === link.href || pathname.startsWith(link.href + "/")}
            onClick={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t p-3 space-y-1">
        <NavLink
          href="/profile"
          label="Profile"
          icon={User}
          active={pathname === "/profile"}
          onClick={onNavigate}
        />
        <button
          onClick={() => {
            onNavigate?.();
            logout();
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
        {user && (
          <div className="px-3 pt-2 text-xs text-muted-foreground truncate">
            {user.firstName} {user.lastName}
          </div>
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
